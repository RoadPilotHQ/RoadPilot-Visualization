import { describe, expect, it } from 'vitest'
import { findMapGraphSelection } from './mapGraphSelection'
import type { MapNavigationTopology } from './mapPackage'

const topology: MapNavigationTopology = {
  positions: new Float64Array([0, 0, 10, 0]),
  nodeKinds: new Uint8Array([0, 1]),
  edges: new Uint32Array([42, 0, 1, 1, 0]),
  categories: ['road_lane'],
  edgeSources: ['a'],
  sampleStride: 1,
  sampledEdgeCount: 1,
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 0 },
}

describe('findMapGraphSelection', () => {
  it('selects the nearest displayed graph node before an overlapping edge', () => {
    expect(findMapGraphSelection(topology, 200, 100, 16, 50, 1, { x: 0, y: 0 })).toEqual({
      type: 'node',
      id: 0,
    })
  })

  it('selects a sampled edge near its visible segment', () => {
    expect(findMapGraphSelection(topology, 200, 100, 100, 50, 1, { x: 0, y: 0 })).toEqual({
      type: 'edge',
      sampleIndex: 0,
    })
  })

  it('returns no selection away from the sample or when the view is unavailable', () => {
    expect(findMapGraphSelection(topology, 200, 100, 100, 20, 1, { x: 0, y: 0 })).toBeNull()
    expect(findMapGraphSelection(null, 200, 100, 100, 50, 1, { x: 0, y: 0 })).toBeNull()
  })
})
