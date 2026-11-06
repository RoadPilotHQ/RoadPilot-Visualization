import { describe, expect, it } from 'vitest'
import { sampleEstimatedMapCurve, writeEstimatedMapCurve } from './estimatedCurve'

const node = (position: [number, number, number], rotation: [number, number, number, number]) => ({
  position,
  rotation,
})

describe('sampleEstimatedMapCurve', () => {
  it('samples the documented straight curve in map-world units', () => {
    const curve = sampleEstimatedMapCurve(
      node([0, 0, 0], [1, 0, 0, 0]),
      node([0, 0, -2560], [1, 0, 0, 0]),
      10,
      4,
    )

    expect(curve.quality).toBe('estimated')
    expect(curve.unit).toBe('map-world-unit')
    expect(curve.points).toHaveLength(5)
    expect(curve.points.map(({ point }) => point)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 2.5 },
      { x: 0, y: 5 },
      { x: 0, y: 7.5 },
      { x: 0, y: 10 },
    ])
    expect(curve.points.every(({ unit }) => unit === 'map-world-unit')).toBe(true)
  })

  it('rejects invalid tangent lengths, sample counts, and quaternions', () => {
    const straightNode = node([0, 0, 0], [1, 0, 0, 0])
    expect(() => sampleEstimatedMapCurve(straightNode, straightNode, 0)).toThrow(/tangentScale/)
    expect(() => sampleEstimatedMapCurve(straightNode, straightNode, 1, 0)).toThrow(/segments/)
    expect(() => sampleEstimatedMapCurve(straightNode, node([0, 0, 0], [2, 0, 0, 0]), 1)).toThrow(
      /unit quaternion/,
    )
  })

  it('uses the node quaternion to rotate the documented local -Z travel direction', () => {
    const yaw90 = Math.SQRT1_2
    const curve = sampleEstimatedMapCurve(
      node([0, 0, 0], [yaw90, 0, yaw90, 0]),
      node([-2560, 0, 0], [yaw90, 0, yaw90, 0]),
      10,
      2,
    )

    expect(curve.points.map(({ point }) => point.x)).toEqual(
      [0, -5, -10].map((x) => expect.closeTo(x)),
    )
    expect(curve.points.map(({ point }) => point.y)).toEqual(
      [0, 0, 0].map((y) => expect.closeTo(y)),
    )
  })

  it('writes the same curve into a compact x/y buffer', () => {
    const start = node([0, 0, 0], [1, 0, 0, 0])
    const end = node([0, 0, -2560], [1, 0, 0, 0])
    const packed = new Float32Array(12)
    const count = writeEstimatedMapCurve(start, end, 10, packed, 2, 4)

    expect(count).toBe(5)
    expect(Array.from(packed.slice(2))).toEqual([0, 0, 0, 2.5, 0, 5, 0, 7.5, 0, 10])
    expect(() => writeEstimatedMapCurve(start, end, 10, packed, 4, 4)).toThrow(/enough room/)
  })
})
