import { describe, expect, it } from 'vitest'
import { queryMapCurveSpatialIndex } from '@/domain/mapSpatialIndex'
import { parseRoadPilotMapPackageV1 } from './mapPackageV1'

const geometryOf = (records: unknown[]) =>
  `${records.map((record) => JSON.stringify(record)).join('\n')}\n`

const fnv64 = (text: string) => {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(text))
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n)
  return hash.toString(16)
}

const fixture = (
  geometry = geometryOf([
    {
      t: 'header',
      format: 'roadpilot-map-geometry',
      schema_version: { major: 1, minor: 0 },
      counts: { nodes: 2, roads: 1, junctions: 0, connections: 0 },
    },
    { t: 'node', id: '01', position: [0, 0, 0], rotation: [1, 0, 0, 0] },
    { t: 'node', id: '02', position: [0, 0, -2560], rotation: [1, 0, 0, 0] },
    {
      t: 'road',
      id: '03',
      start: '01',
      end: '02',
      stored_length: 10,
      curve: {
        quality: 'estimated',
        tangent_scale: 10,
        estimated_length: 10,
        length_deviation: 0,
        length_consistent: true,
        bounds: [0, 0, -10, 0, 0, 0],
      },
    },
    { t: 'footer', complete: true, nodes: 2, roads: 1, junctions: 0, connections: 0 },
  ]),
) => {
  const bytes = new TextEncoder().encode(geometry).byteLength
  const checksum = fnv64(geometry)
  const fileEntry = {
    name: 'geometry.jsonl',
    role: 'geometry',
    format: 'roadpilot-map-geometry',
    schema_version: { major: 1, minor: 0 },
    bytes,
    checksum,
  }
  const contentId = fnv64(`geometry.jsonl:${bytes}:${checksum};`)
  const manifest = JSON.stringify({
    format: 'roadpilot-map-package',
    schema_version: { major: 1, minor: 0 },
    content_revision: 1,
    content_id: contentId,
    generator: { name: 'RoadPilot-Map', version: '0.1.0' },
    game: 'ats',
    source: { map: 'usa', game_version: null, archives: null },
    coordinate_system: {
      x: 'east',
      y: 'up',
      z: 'south',
      position_scale: 256,
      world_unit: 'unconfirmed',
    },
    counts: { nodes: 2, roads: 1, lanes: 0, junctions: 0, connections: 0 },
    geometry_models: {
      node_position: 'confirmed',
      curve: { model: 'hermite_stored_length', quality: 'estimated', length_tolerance: 0.001 },
      lane_position: 'unavailable',
    },
    spatial_index: { kind: 'uniform_grid', cell_size: 256 },
    distribution: 'local_use_only',
    limitations: [],
    files: [fileEntry],
  })
  return { manifest, geometry }
}

describe('parseRoadPilotMapPackageV1', () => {
  it('validates integrity and returns estimated curves in map-world units', () => {
    const result = parseRoadPilotMapPackageV1(...(Object.values(fixture()) as [string, string]))

    expect(result.game).toBe('ats')
    expect(result.schemaVersion).toEqual({ major: 1, minor: 0 })
    expect(result.roadCount).toBe(1)
    expect(result.coordinateUnit).toBe('map-world-unit')
    expect(result.curves[0]).toMatchObject({
      id: '03',
      quality: 'estimated',
      coordinateOffset: 0,
      pointCount: 33,
      lengthConsistent: true,
    })
    expect(result.coordinates.length).toBe(66)
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 10 })
    expect(
      queryMapCurveSpatialIndex(result.spatialIndex, {
        minX: -1,
        minY: 2,
        maxX: 1,
        maxY: 8,
      }),
    ).toEqual([0])
    expect(
      queryMapCurveSpatialIndex(result.spatialIndex, {
        minX: 300,
        minY: 2,
        maxX: 301,
        maxY: 8,
      }),
    ).toEqual([])
  })

  it('keeps unavailable curve geometry unavailable', () => {
    const { manifest, geometry } = fixture(
      geometryOf([
        {
          t: 'header',
          format: 'roadpilot-map-geometry',
          schema_version: { major: 1, minor: 0 },
          counts: { nodes: 2, roads: 1, junctions: 0, connections: 0 },
        },
        { t: 'node', id: '01', position: [0, 0, 0], rotation: [1, 0, 0, 0] },
        { t: 'node', id: '02', position: [0, 0, -2560], rotation: [1, 0, 0, 0] },
        {
          t: 'road',
          id: '03',
          start: '01',
          end: '02',
          stored_length: 10,
          curve: { quality: 'unavailable', reason: 'invalid_direction' },
        },
        { t: 'footer', complete: true, nodes: 2, roads: 1, junctions: 0, connections: 0 },
      ]),
    )

    const result = parseRoadPilotMapPackageV1(manifest, geometry)
    expect(result.curves[0]).toMatchObject({
      quality: 'unavailable',
      pointCount: 0,
      unavailableReason: 'invalid_direction',
      lengthConsistent: null,
    })
    expect(result.coordinates.length).toBe(0)
  })

  it('rejects unsupported versions, damaged files, and incomplete geometry', () => {
    const valid = fixture()
    const parsedManifest = JSON.parse(valid.manifest) as Record<string, unknown>
    const schemaVersion = parsedManifest.schema_version as { major: number; minor: number }
    expect(() =>
      parseRoadPilotMapPackageV1(
        JSON.stringify({ ...parsedManifest, schema_version: { ...schemaVersion, major: 2 } }),
        valid.geometry,
      ),
    ).toThrow(/unsupported package schema major version 2/)
    expect(() =>
      parseRoadPilotMapPackageV1(valid.manifest, valid.geometry.replace('"header"', '"headeR"')),
    ).toThrow(/checksum/)
    expect(() =>
      parseRoadPilotMapPackageV1(
        ...(Object.values(
          fixture(valid.geometry.slice(0, valid.geometry.lastIndexOf('{"t":"footer"'))),
        ) as [string, string]),
      ),
    ).toThrow(/footer/)
  })
})
