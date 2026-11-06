import { describe, expect, it } from 'vitest'
import {
  inspectNavigationEdge,
  inspectNavigationNode,
  inspectNavigationPath,
} from './mapNavigationInspection'
import type { NavigationGraphInspectionIndex } from './mapNavigationInspection'

const index: NavigationGraphInspectionIndex = {
  nodeCount: 4,
  edgeCount: 4,
  positions: new Float64Array([0, 0, 1, 0, 2, 0, 3, 0]),
  altitudes: new Float64Array([0, 0, 0, 0]),
  nodeKinds: new Uint8Array([0, 1, 2, 3]),
  nodeMapIds: new BigUint64Array([1n, 2n, 3n, 4n]),
  nodeOwnerIds: new BigUint64Array([10n, 10n, 20n, 20n]),
  nodeDetails: new Uint32Array([
    0, 0xffffffff, 0xffffffff, 1, 0xffffffff, 0xffffffff, 0xffffffff, 0, 0, 0xffffffff, 1, 0,
  ]),
  nodeSides: new Uint8Array([1, 1, 0, 0]),
  edgeEndpoints: new Uint32Array([0, 1, 0, 2, 1, 2, 2, 3]),
  edgeStatuses: new Uint8Array([1, 2, 0, 3]),
  edgeCategoryCodes: new Uint32Array([0, 2, 1, 3]),
  edgeSourceIds: new BigUint64Array([10n, 30n, 20n, 40n]),
  edgeOffsets: new Uint32Array([0, 2, 3, 4, 4]),
  categories: ['road_lane', 'prefab_internal', 'road_connection', 'other'],
  edgeRules: new Map([[0, [{ name: 'speed_limit', resolved: true }]]]),
}

describe('navigation graph inspection', () => {
  it('returns complete node and edge details for any valid exported id', () => {
    expect(inspectNavigationNode(index, 0)).toMatchObject({
      id: 0,
      kind: 'lane_entry',
      mapNodeId: '1',
      position: [0, 0, 0],
      ownerId: 'a',
      side: 'left',
      index: 0,
    })
    expect(inspectNavigationEdge(index, 1)).toEqual({
      id: 1,
      from: 0,
      to: 2,
      status: 'unknown',
      category: 'road_connection',
      sourceId: '1e',
      rules: [],
    })
    expect(inspectNavigationNode(index, 4)).toBeNull()
    expect(inspectNavigationEdge(index, -1)).toBeNull()
  })

  it('finds a directed topological chain using only explicitly selected statuses', () => {
    expect(inspectNavigationPath(index, 0, 2, ['candidate', 'confirmed'])).toMatchObject({
      status: 'found',
      from: 0,
      to: 2,
      totalEdges: 2,
      steps: [
        { id: 0, status: 'candidate', from: 0, to: 1 },
        { id: 2, status: 'confirmed', from: 1, to: 2 },
      ],
      truncated: false,
    })
    expect(inspectNavigationPath(index, 2, 0, ['candidate', 'confirmed']).status).toBe('not-found')
    expect(inspectNavigationPath(index, 0, 2, ['confirmed']).status).toBe('not-found')
    expect(inspectNavigationPath(index, 0, 0, []).totalEdges).toBe(0)
  })
})
