import { describe, expect, it } from 'vitest'
import type { MapRoadCurve } from './mapPackage'
import { buildMapCurveSpatialIndex, queryMapCurveSpatialIndex } from './mapSpatialIndex'

const curve = (bounds: MapRoadCurve['bounds']): MapRoadCurve => ({
  id: 'road',
  quality: 'estimated',
  coordinateOffset: 0,
  pointCount: 2,
  bounds,
  unavailableReason: null,
  lengthConsistent: true,
})

describe('map curve spatial index', () => {
  it('returns curves in intersecting cells without duplicates and in stable order', () => {
    const index = buildMapCurveSpatialIndex(
      [
        curve({ minX: 0, minY: 0, maxX: 12, maxY: 12 }),
        curve({ minX: 100, minY: 0, maxX: 110, maxY: 10 }),
        { ...curve(null), quality: 'unavailable' },
      ],
      10,
    )

    expect(queryMapCurveSpatialIndex(index, { minX: 9, minY: 9, maxX: 11, maxY: 11 })).toEqual([0])
    expect(queryMapCurveSpatialIndex(index, { minX: 100, minY: 0, maxX: 105, maxY: 5 })).toEqual([
      1,
    ])
    expect(queryMapCurveSpatialIndex(index, { minX: 200, minY: 0, maxX: 210, maxY: 10 })).toEqual(
      [],
    )
  })

  it('keeps oversized bounds visible through a bounded overflow list', () => {
    const index = buildMapCurveSpatialIndex(
      [curve({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 })],
      1,
    )

    expect(index.overflowCurveIndices).toEqual([0])
    expect(
      queryMapCurveSpatialIndex(index, {
        minX: 10_000,
        minY: 10_000,
        maxX: 10_010,
        maxY: 10_010,
      }),
    ).toEqual([0])
  })

  it('validates cell sizes and query bounds', () => {
    expect(() => buildMapCurveSpatialIndex([], 0)).toThrow(/cellSize/)
    expect(() =>
      buildMapCurveSpatialIndex([curve({ minX: 2, minY: 0, maxX: 1, maxY: 1 })], 10),
    ).toThrow(/bounds/)
    const index = buildMapCurveSpatialIndex([], 10)
    expect(() => queryMapCurveSpatialIndex(index, { minX: 2, minY: 0, maxX: 1, maxY: 1 })).toThrow(
      /viewport bounds/,
    )
  })
})
