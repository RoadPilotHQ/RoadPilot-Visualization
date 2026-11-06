import { describe, expect, it } from 'vitest'
import { parseNavigationGraphV1 } from './navigationGraphV1'

const graph = (major = 1, footer = true) => {
  const records: unknown[] = [
    {
      t: 'header',
      format: 'roadpilot-map-navigation-graph',
      schema_version: { major, minor: 0 },
      generator: { name: 'roadpilot-map', version: '0.1.0' },
      generated_at: null,
      game: 'ats',
      source: { map: 'usa', game_version: null, archives: null },
      coordinate_system: {
        x: 'east',
        y: 'up',
        z: 'south',
        position_scale: 256,
        world_unit: 'unconfirmed',
      },
      counts: { nodes: 2, edges: 1, issues: 1 },
      limitations: ['positions_are_map_node_positions_not_lane_positions'],
    },
    {
      t: 'node',
      id: 0,
      kind: 'lane_entry',
      road: 'a',
      side: 'right',
      index: 0,
      map_node: '1',
      position: [256, 0, 0],
    },
    {
      t: 'node',
      id: 1,
      kind: 'lane_exit',
      road: 'a',
      side: 'right',
      index: 0,
      map_node: '2',
      position: null,
    },
    {
      t: 'edge',
      id: 0,
      from: 0,
      to: 1,
      status: 'candidate',
      category: 'road_lane',
      source: 'a',
    },
    { t: 'issue', kind: 'road_lanes_not_navigable', source: 'b' },
  ]
  if (footer) records.push({ t: 'footer', complete: true, nodes: 2, edges: 1, issues: 1 })
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
}

describe('parseNavigationGraphV1', () => {
  it('summarizes graph evidence while preserving unavailable positions', () => {
    const result = parseNavigationGraphV1(graph())

    expect(result).toMatchObject({
      schemaVersion: { major: 1, minor: 0 },
      nodeCount: 2,
      edgeCount: 1,
      issueCount: 1,
      positionedNodeCount: 1,
      missingPositionCount: 1,
      limitations: ['positions_are_map_node_positions_not_lane_positions'],
      nodesByKind: { lane_entry: 1, lane_exit: 1 },
      edgesByStatus: { candidate: 1 },
      edgesByCategory: { road_lane: 1 },
      issuesByKind: { road_lanes_not_navigable: 1 },
    })
  })

  it('rejects unsupported versions, malformed records, and incomplete files', () => {
    expect(() => parseNavigationGraphV1(graph(2))).toThrow(/unsupported navigation schema major/)
    expect(() =>
      parseNavigationGraphV1(graph().replace('"status":"candidate"', '"status":"likely"')),
    ).toThrow()
    expect(() => parseNavigationGraphV1(graph(1, false))).toThrow(/footer/)
  })

  it('rejects nonconsecutive ids and references to missing nodes', () => {
    expect(() =>
      parseNavigationGraphV1(
        graph().replace('"id":1,"kind":"lane_exit"', '"id":2,"kind":"lane_exit"'),
      ),
    ).toThrow(/consecutive/)
    expect(() => parseNavigationGraphV1(graph().replace('"to":1', '"to":2'))).toThrow(
      /missing node/,
    )
  })

  it('builds a bounded topology sample only from positioned map-node endpoints', () => {
    const positioned = graph().replace('"position":null', '"position":[512,0,512]')
    const result = parseNavigationGraphV1(positioned)

    expect(result.topology).toMatchObject({
      sampleStride: 1,
      sampledEdgeCount: 1,
      bounds: { minX: 1, minY: 0, maxX: 2, maxY: 2 },
    })
    expect(Array.from(result.topology!.positions)).toEqual([1, 0, 2, 2])
    expect(Array.from(result.topology!.edges)).toEqual([0, 1, 1])
    expect(parseNavigationGraphV1(graph()).topology?.sampledEdgeCount).toBe(0)
  })
})
