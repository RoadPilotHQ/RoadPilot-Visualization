import { z } from 'zod'
import type { MapNavigationGraphSummary } from '@/domain/mapPackage'

const MAX_LINE_LENGTH = 4 * 1024 * 1024
const HEX_UID = /^[0-9a-f]{1,16}$/
const safeCount = z.number().int().nonnegative().safe()
const coordinate = z.number().int().safe()

const headerSchema = z.object({
  t: z.literal('header'),
  format: z.literal('roadpilot-map-navigation-graph'),
  schema_version: z.object({ major: z.number().int().nonnegative(), minor: safeCount }),
  generator: z.object({ name: z.string().min(1), version: z.string().min(1) }),
  generated_at: z.null(),
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
  counts: z.object({ nodes: safeCount, edges: safeCount, issues: safeCount }),
  limitations: z.array(z.string()),
})

const nodeSchema = z.object({
  t: z.literal('node'),
  id: safeCount,
  kind: z.enum(['lane_entry', 'lane_exit', 'prefab_input', 'prefab_output']),
  road: z.string().regex(HEX_UID).optional(),
  side: z.enum(['left', 'right']).optional(),
  index: safeCount.optional(),
  prefab: z.string().regex(HEX_UID).optional(),
  arm: safeCount.optional(),
  slot: safeCount.optional(),
  map_node: z.string().regex(HEX_UID),
  position: z.tuple([coordinate, coordinate, coordinate]).nullable(),
})

const edgeSchema = z.object({
  t: z.literal('edge'),
  id: safeCount,
  from: safeCount,
  to: safeCount,
  status: z.enum(['confirmed', 'candidate', 'unknown', 'forbidden']),
  category: z.string().min(1),
  source: z.string().regex(HEX_UID),
  rules: z.array(z.object({ name: z.string(), resolved: z.boolean() })).optional(),
})

const issueSchema = z.object({
  t: z.literal('issue'),
  kind: z.string().min(1),
  source: z.string().regex(HEX_UID),
  reason: z.string().optional(),
  arm: safeCount.optional(),
  direction: z.string().optional(),
  lanes: safeCount.optional(),
  slots: safeCount.optional(),
})

const footerSchema = z.object({
  t: z.literal('footer'),
  complete: z.literal(true),
  nodes: safeCount,
  edges: safeCount,
  issues: safeCount,
})

type Header = z.infer<typeof headerSchema>

/** Incremental reader for RoadPilot-Map navigation graph schema 1. */
export function createNavigationGraphV1Accumulator() {
  let header: Header | null = null
  let stage = 0
  let nodeCount = 0
  let edgeCount = 0
  let issueCount = 0
  let positionedNodeCount = 0
  let missingPositionCount = 0
  let footerSeen = false
  const nodesByKind: Record<string, number> = {}
  const edgesByStatus: Record<string, number> = {}
  const edgesByCategory: Record<string, number> = {}
  const issuesByKind: Record<string, number> = {}

  const push = (line: string, lineNumber: number) => {
    if (line.length > MAX_LINE_LENGTH) {
      throw new Error(`navigation.jsonl line ${lineNumber} exceeds the supported line length`)
    }
    if (!line.trim()) throw new Error(`navigation.jsonl line ${lineNumber} is empty`)
    const value = parseLine(line, lineNumber)
    const recordType = isRecord(value) ? value.t : undefined

    if (!header) {
      header = headerSchema.parse(value)
      if (header.schema_version.major !== 1) {
        throw new Error(
          `unsupported navigation schema major version ${header.schema_version.major}`,
        )
      }
      return
    }
    if (footerSeen) throw new Error(`navigation.jsonl line ${lineNumber} follows the footer`)

    switch (recordType) {
      case 'node': {
        if (stage > 0) throw new Error(`navigation.jsonl line ${lineNumber}: node after edges`)
        const node = nodeSchema.parse(value)
        if (node.id !== nodeCount) {
          throw new Error(`navigation.jsonl line ${lineNumber}: node ids must be consecutive`)
        }
        if (node.kind === 'lane_entry' || node.kind === 'lane_exit') {
          if (!node.road || !node.side || node.index === undefined) {
            throw new Error(`navigation.jsonl line ${lineNumber}: lane node fields are missing`)
          }
        } else if (!node.prefab || node.arm === undefined || node.slot === undefined) {
          throw new Error(`navigation.jsonl line ${lineNumber}: prefab node fields are missing`)
        }
        nodeCount += 1
        increment(nodesByKind, node.kind)
        if (node.position === null) missingPositionCount += 1
        else positionedNodeCount += 1
        break
      }
      case 'edge': {
        if (stage > 1) throw new Error(`navigation.jsonl line ${lineNumber}: edge after issues`)
        stage = 1
        const edge = edgeSchema.parse(value)
        if (edge.id !== edgeCount) {
          throw new Error(`navigation.jsonl line ${lineNumber}: edge ids must be consecutive`)
        }
        if (edge.from >= nodeCount || edge.to >= nodeCount) {
          throw new Error(`navigation.jsonl line ${lineNumber}: edge refers to a missing node`)
        }
        edgeCount += 1
        increment(edgesByStatus, edge.status)
        increment(edgesByCategory, edge.category)
        break
      }
      case 'issue': {
        stage = 2
        const issue = issueSchema.parse(value)
        issueCount += 1
        increment(issuesByKind, issue.kind)
        break
      }
      case 'footer': {
        const footer = footerSchema.parse(value)
        const counts = header.counts
        for (const [name, actual] of [
          ['nodes', nodeCount],
          ['edges', edgeCount],
          ['issues', issueCount],
        ] as const) {
          if (counts[name] !== actual || footer[name] !== actual) {
            throw new Error(`navigation.jsonl line ${lineNumber}: ${name} count does not match`)
          }
        }
        footerSeen = true
        break
      }
      default:
        // Unknown records are forward-compatible within schema major 1.
        break
    }
  }

  return {
    push,
    finish(): MapNavigationGraphSummary {
      if (!header) throw new Error('navigation.jsonl is missing its header')
      if (!footerSeen) throw new Error('navigation.jsonl is missing its complete footer')
      return {
        schemaVersion: { major: 1, minor: header.schema_version.minor },
        nodeCount,
        edgeCount,
        issueCount,
        positionedNodeCount,
        missingPositionCount,
        limitations: header.limitations,
        nodesByKind,
        edgesByStatus,
        edgesByCategory,
        issuesByKind,
      }
    },
  }
}

/** Parses a complete string for tests; production uses the streaming worker path. */
export function parseNavigationGraphV1(text: string): MapNavigationGraphSummary {
  const parser = createNavigationGraphV1Accumulator()
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  lines.forEach((line, index) => parser.push(line, index + 1))
  return parser.finish()
}

function parseLine(line: string, lineNumber: number): unknown {
  try {
    return JSON.parse(line) as unknown
  } catch (error) {
    throw new Error(`navigation.jsonl line ${lineNumber}: invalid JSON`, { cause: error })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1
}
