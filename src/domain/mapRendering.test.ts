import { describe, expect, it } from 'vitest'
import { mapCurveSampleStride } from './mapRendering'

describe('mapCurveSampleStride', () => {
  it('reduces sub-pixel curve detail for map overviews', () => {
    expect(mapCurveSampleStride(0.002)).toBe(32)
    expect(mapCurveSampleStride(0.01)).toBe(8)
    expect(mapCurveSampleStride(0.05)).toBe(4)
    expect(mapCurveSampleStride(0.5)).toBe(2)
    expect(mapCurveSampleStride(1)).toBe(1)
  })

  it('rejects invalid map scales', () => {
    expect(() => mapCurveSampleStride(0)).toThrow(/pixelsPerMapUnit/)
    expect(() => mapCurveSampleStride(Number.NaN)).toThrow(/pixelsPerMapUnit/)
  })
})
