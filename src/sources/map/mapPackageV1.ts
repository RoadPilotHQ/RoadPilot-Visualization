import { z } from 'zod'
import type { RoadPilotMapPackageV1 } from '@/domain/mapPackage'
import type { MapCurveNode } from './estimatedCurve'
import { writeEstimatedMapCurve } from './estimatedCurve'

const HEX_UID = /^[0-9a-f]+$/
const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn
const CURVE_SEGMENTS = 32
const MAX_ROADS = 1_000_000

export interface MapPackageFileIntegrity {
  readonly bytes: number
  readonly checksum: string
}

const fileSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/),
  role: z.enum(['geometry', 'navigation']),
  format: z.string(),
  schema_version: z.object({
    major: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
  }),
  bytes: z.number().int().nonnegative().safe(),
  checksum: z.string().regex(/^[0-9a-f]{1,16}$/),
})

const manifestSchema = z.object({
  format: z.literal('roadpilot-map-package'),
  schema_version: z.object({ major: z.number().int(), minor: z.number().int().nonnegative() }),
  content_revision: z.number().int().nonnegative(),
  content_id: z.string().regex(/^[0-9a-f]{1,16}$/),
  generator: z.object({ name: z.string().min(1), version: z.string().min(1) }),
  game: z.enum(['ats', 'ets2']),
  source: z.object({
    map: z.string().nullable(),
    game_version: z.string().nullable(),
    archives: z.array(z.string()).nullable(),
  }),
  coordinate_system: z.object({
    x: z.literal('east'),
    y: z.literal('up'),
    z: z.literal('south'),
    position_scale: z.literal(256),
    world_unit: z.literal('unconfirmed'),
  }),
  geometry_models: z.object({
    node_position: z.literal('confirmed'),
    curve: z.object({
      model: z.literal('hermite_stored_length'),
      quality: z.literal('estimated'),
      length_tolerance: z.number().finite().nonnegative(),
    }),
    lane_position: z.literal('unavailable'),
  }),
  counts: z.object({
    nodes: z.number().int().nonnegative().safe(),
    roads: z.number().int().nonnegative().safe(),
    lanes: z.number().int().nonnegative().safe(),
    junctions: z.number().int().nonnegative().safe(),
    connections: z.number().int().nonnegative().safe(),
  }),
  spatial_index: z.object({
    kind: z.literal('uniform_grid'),
    cell_size: z.number().finite().positive(),
  }),
  distribution: z.literal('local_use_only'),
  limitations: z.array(z.string()),
  files: z.array(fileSchema).min(1),
})

const geometryHeaderSchema = z.object({
  t: z.literal('header'),
  format: z.literal('roadpilot-map-geometry'),
  schema_version: z.object({ major: z.number().int(), minor: z.number().int().nonnegative() }),
  counts: z.object({
    nodes: z.number().int().nonnegative().safe(),
    roads: z.number().int().nonnegative().safe(),
    junctions: z.number().int().nonnegative().safe(),
    connections: z.number().int().nonnegative().safe(),
  }),
})

const nodeSchema = z.object({
  t: z.literal('node'),
  id: z.string().regex(HEX_UID),
  position: z.tuple([z.number().int().safe(), z.number().int().safe(), z.number().int().safe()]),
  rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]),
})

const estimatedCurveSchema = z.object({
  quality: z.literal('estimated'),
  tangent_scale: z.number().finite().positive(),
  estimated_length: z.number().finite().positive(),
  length_deviation: z.number().finite().nonnegative(),
  length_consistent: z.boolean(),
  bounds: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]),
})
const unavailableCurveSchema = z.object({
  quality: z.literal('unavailable'),
  reason: z.enum(['non_finite_input', 'invalid_stored_length', 'invalid_direction', 'no_geometry']),
})
const roadSchema = z.object({
  t: z.literal('road'),
  id: z.string().regex(HEX_UID),
  start: z.string().regex(HEX_UID),
  end: z.string().regex(HEX_UID),
  stored_length: z.number().finite().positive(),
  curve: z.discriminatedUnion('quality', [estimatedCurveSchema, unavailableCurveSchema]),
})

/** Parses and integrity-checks a schema 1 package for offline, read-only visualization. */
export function parseRoadPilotMapPackageV1(
  manifestText: string,
  geometryText: string,
  additionalFiles: Readonly<Record<string, string>> = {},
  verifiedFiles: Readonly<Record<string, MapPackageFileIntegrity>> = {},
): RoadPilotMapPackageV1 {
  const manifestValue = parseJson(manifestText, 'manifest.json')
  const manifest = manifestSchema.parse(manifestValue)
  if (manifest.schema_version.major !== 1) {
    throw new Error(`unsupported package schema major version ${manifest.schema_version.major}`)
  }
  if (manifest.schema_version.minor < 0)
    throw new Error('package schema minor version must be nonnegative')

  const suppliedFiles: Record<string, string> = {
    ...additionalFiles,
    'geometry.jsonl': geometryText,
  }
  const listedNames = new Set<string>()
  let contentId = FNV_OFFSET
  for (const file of manifest.files) {
    if (listedNames.has(file.name)) throw new Error(`manifest lists ${file.name} more than once`)
    listedNames.add(file.name)
    const contents = suppliedFiles[file.name]
    const verified = verifiedFiles[file.name]
    if (contents === undefined && verified === undefined) {
      throw new Error(`package file ${file.name} is missing`)
    }
    const integrity =
      verified ??
      (() => {
        const bytes = new TextEncoder().encode(contents!)
        return { bytes: bytes.byteLength, checksum: fnv64(bytes) }
      })()
    if (integrity.bytes !== file.bytes)
      throw new Error(`package file ${file.name} has an unexpected byte length`)
    if (integrity.checksum !== file.checksum)
      throw new Error(`package file ${file.name} checksum does not match`)
    contentId = fnvUpdate(
      contentId,
      new TextEncoder().encode(`${file.name}:${file.bytes}:${integrity.checksum};`),
    )
  }
  if (contentId.toString(16) !== manifest.content_id)
    throw new Error('package content_id does not match its files')

  const geometryFile = manifest.files.find((file) => file.role === 'geometry')
  if (
    !geometryFile ||
    geometryFile.name !== 'geometry.jsonl' ||
    geometryFile.format !== 'roadpilot-map-geometry'
  ) {
    throw new Error('manifest must list geometry.jsonl as a RoadPilot-Map geometry file')
  }
  if (geometryFile.schema_version.major !== 1) {
    throw new Error(
      `unsupported geometry schema major version ${geometryFile.schema_version.major}`,
    )
  }

  return parseGeometry(
    geometryText,
    manifest.game,
    manifest.source.map,
    manifest.schema_version.minor,
    manifest.content_revision,
    manifest.counts,
    manifest.geometry_models.curve.length_tolerance,
  )
}

function parseGeometry(
  text: string,
  game: 'ats' | 'ets2',
  mapName: string | null,
  packageMinor: number,
  contentRevision: number,
  packageCounts: z.infer<typeof manifestSchema>['counts'],
  lengthTolerance: number,
): RoadPilotMapPackageV1 {
  let lineNumber = 0
  let offset = 0
  let header: z.infer<typeof geometryHeaderSchema> | null = null
  let stage = 0
  let nodeCount = 0
  let roadCount = 0
  let junctionCount = 0
  let connectionCount = 0
  let lastNodeId: bigint | null = null
  let lastRoadId: bigint | null = null
  const nodes = new Map<string, MapCurveNode>()
  const curves: RoadPilotMapPackageV1['curves'][number][] = []
  let coordinates: Float32Array | null = null
  let coordinateOffset = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let footerSeen = false

  while (offset < text.length) {
    const end = text.indexOf('\n', offset)
    const line = text.slice(offset, end === -1 ? text.length : end).replace(/\r$/, '')
    offset = end === -1 ? text.length : end + 1
    lineNumber += 1
    if (line.length === 0) {
      if (footerSeen) continue
      throw new Error(`geometry.jsonl line ${lineNumber}: empty line before footer`)
    }
    if (footerSeen) throw new Error(`geometry.jsonl line ${lineNumber}: data after footer`)

    const value = parseJson(line, `geometry.jsonl line ${lineNumber}`)
    if (!isRecord(value) || typeof value.t !== 'string') {
      throw new Error(`geometry.jsonl line ${lineNumber}: missing record type`)
    }
    const fail = (error: unknown): never => {
      throw new Error(`geometry.jsonl line ${lineNumber}: ${errorMessage(error)}`, { cause: error })
    }

    switch (value.t) {
      case 'header': {
        if (lineNumber !== 1)
          throw new Error(`geometry.jsonl line ${lineNumber}: header must be first`)
        header = geometryHeaderSchema.parse(value)
        if (header.schema_version.major !== 1) {
          throw new Error(
            `unsupported geometry schema major version ${header.schema_version.major}`,
          )
        }
        if (
          header.counts.nodes !== packageCounts.nodes ||
          header.counts.roads !== packageCounts.roads ||
          header.counts.junctions !== packageCounts.junctions ||
          header.counts.connections !== packageCounts.connections
        ) {
          throw new Error(`geometry.jsonl line ${lineNumber}: counts do not match manifest`)
        }
        if (header.counts.roads > MAX_ROADS) {
          throw new Error(
            `geometry.jsonl contains too many roads to visualize (${header.counts.roads})`,
          )
        }
        coordinates = new Float32Array(header.counts.roads * (CURVE_SEGMENTS + 1) * 2)
        stage = 0
        break
      }
      case 'node': {
        if (!header || stage !== 0)
          throw new Error(`geometry.jsonl line ${lineNumber}: node after nodes section`)
        const node = nodeSchema.parse(value)
        const id = BigInt(`0x${node.id}`)
        if (lastNodeId !== null && id <= lastNodeId) {
          throw new Error(`geometry.jsonl line ${lineNumber}: node ids are not strictly ascending`)
        }
        lastNodeId = id
        nodes.set(node.id, { position: node.position, rotation: node.rotation })
        nodeCount += 1
        break
      }
      case 'road': {
        if (!header || stage > 1)
          throw new Error(`geometry.jsonl line ${lineNumber}: road after roads section`)
        stage = 1
        const road = roadSchema.parse(value)
        if (road.start === road.end)
          throw new Error(`geometry.jsonl line ${lineNumber}: road nodes must differ`)
        if (road.curve.quality === 'estimated') {
          const deviation =
            Math.abs(road.curve.estimated_length - road.stored_length) / road.stored_length
          if (Math.abs(deviation - road.curve.length_deviation) > 1e-9) {
            throw new Error(
              `geometry.jsonl line ${lineNumber}: curve length deviation is inconsistent`,
            )
          }
          if (road.curve.length_consistent !== deviation <= lengthTolerance) {
            throw new Error(
              `geometry.jsonl line ${lineNumber}: curve length consistency claim is false`,
            )
          }
        }
        const id = BigInt(`0x${road.id}`)
        if (lastRoadId !== null && id <= lastRoadId) {
          throw new Error(`geometry.jsonl line ${lineNumber}: road ids are not strictly ascending`)
        }
        lastRoadId = id
        const start = nodes.get(road.start)
        const finish = nodes.get(road.end)
        if (!start || !finish)
          throw new Error(`geometry.jsonl line ${lineNumber}: road references a missing node`)
        if (road.curve.quality === 'unavailable') {
          curves.push({
            id: road.id,
            quality: 'unavailable',
            coordinateOffset,
            pointCount: 0,
            unavailableReason: road.curve.reason,
            lengthConsistent: null,
          })
        } else {
          const [minRoadX, , minRoadZ, maxRoadX, , maxRoadZ] = road.curve.bounds
          if (minRoadX > maxRoadX || minRoadZ > maxRoadZ) {
            throw new Error(`geometry.jsonl line ${lineNumber}: curve bounds are inverted`)
          }
          minX = Math.min(minX, minRoadX)
          maxX = Math.max(maxX, maxRoadX)
          minY = Math.min(minY, -maxRoadZ)
          maxY = Math.max(maxY, -minRoadZ)
          try {
            if (coordinates === null) throw new Error('geometry header is missing')
            const pointCount = writeEstimatedMapCurve(
              start,
              finish,
              road.curve.tangent_scale,
              coordinates,
              coordinateOffset,
              CURVE_SEGMENTS,
            )
            curves.push({
              id: road.id,
              quality: 'estimated',
              coordinateOffset,
              pointCount,
              unavailableReason: null,
              lengthConsistent: road.curve.length_consistent,
            })
            coordinateOffset += pointCount * 2
          } catch (error) {
            fail(error)
          }
        }
        roadCount += 1
        break
      }
      case 'junction':
        if (!header || stage > 2)
          throw new Error(`geometry.jsonl line ${lineNumber}: junction after junctions section`)
        stage = 2
        junctionCount += 1
        break
      case 'connection':
        if (!header || stage > 3)
          throw new Error(`geometry.jsonl line ${lineNumber}: connection after connections section`)
        stage = 3
        connectionCount += 1
        break
      case 'footer': {
        if (!header || value.complete !== true)
          throw new Error(`geometry.jsonl line ${lineNumber}: incomplete footer`)
        const counts = header.counts
        for (const [name, actual] of [
          ['nodes', nodeCount],
          ['roads', roadCount],
          ['junctions', junctionCount],
          ['connections', connectionCount],
        ] as const) {
          if (counts[name] !== actual || value[name] !== actual) {
            throw new Error(`geometry.jsonl line ${lineNumber}: ${name} count does not match`)
          }
        }
        footerSeen = true
        break
      }
      default:
        // Forward-compatible records are ignored within a supported major version.
        break
    }
  }

  if (!header) throw new Error('geometry.jsonl is missing its header')
  if (!footerSeen) throw new Error('geometry.jsonl is missing its complete footer')
  return {
    game,
    mapName,
    schemaVersion: { major: 1, minor: packageMinor },
    contentRevision,
    roadCount,
    coordinateUnit: 'map-world-unit',
    bounds:
      Number.isFinite(minX) &&
      Number.isFinite(minY) &&
      Number.isFinite(maxX) &&
      Number.isFinite(maxY)
        ? { minX, minY, maxX, maxY }
        : null,
    coordinates: coordinates?.subarray(0, coordinateOffset) ?? new Float32Array(),
    curves,
  }
}

function parseJson(text: string, where: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`${where}: invalid JSON (${errorMessage(error)})`, { cause: error })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fnv64(bytes: Uint8Array): string {
  return fnvUpdate(FNV_OFFSET, bytes).toString(16)
}

function fnvUpdate(start: bigint, bytes: Uint8Array): bigint {
  let hash = start
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64
  return hash
}
