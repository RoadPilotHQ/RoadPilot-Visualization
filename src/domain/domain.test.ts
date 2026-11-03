import { describe, expect, it } from 'vitest'
import {
  MAP_UNIT_SCALE,
  headingToCompassDeg,
  mapRawToWorld,
  mapWorldToScenePlane,
  mpsToKmh,
} from './coordinates'
import { normalizeAngle, polylineLength, projectOnPolyline } from './geometry'

describe('geometry', () => {
  it('normalizes angles into (-PI, PI]', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(0.5)).toBe(0.5)
  })

  it('computes polyline length', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBe(11)
  })

  it('reports positive lateral offset to the left of the direction', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(projectOnPolyline(line, { x: 5, y: 2 })?.lateralOffset).toBeCloseTo(2)
    expect(projectOnPolyline(line, { x: 5, y: -1 })?.lateralOffset).toBeCloseTo(-1)
    expect(projectOnPolyline([{ x: 0, y: 0 }], { x: 1, y: 1 })).toBeNull()
  })
})

describe('coordinates', () => {
  it('keeps the map world unit scale unconfirmed', () => {
    expect(MAP_UNIT_SCALE.status).toBe('unconfirmed')
    expect(MAP_UNIT_SCALE.metresPerUnit).toBeNull()
  })

  it('divides raw map positions by 256', () => {
    expect(mapRawToWorld(512)).toBe(2)
  })

  it('does not label map coordinates as metres while the scale is unconfirmed', () => {
    const result = mapWorldToScenePlane({ x: 10, y: 99, z: 4 })
    expect(result.unit).toBe('map-world-unit')
    expect(result.point).toEqual({ x: 10, y: -4 })
  })

  it('applies an explicit scale only when one is supplied', () => {
    const result = mapWorldToScenePlane(
      { x: 10, y: 0, z: 4 },
      { metresPerUnit: 2, status: 'confirmed' },
    )
    expect(result.unit).toBe('metre')
    expect(result.point).toEqual({ x: 20, y: -8 })
  })

  it('converts units and headings', () => {
    expect(mpsToKmh(10)).toBeCloseTo(36)
    expect(headingToCompassDeg(Math.PI / 2)).toBeCloseTo(0) // north
    expect(headingToCompassDeg(0)).toBeCloseTo(90) // east
    expect(headingToCompassDeg(-Math.PI / 2)).toBeCloseTo(180) // south
  })
})
