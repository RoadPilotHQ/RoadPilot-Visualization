import { describe, expect, it } from 'vitest'
import { anchorFor, screenRotationDeg, screenToWorld, worldToScreen } from './camera'
import type { Camera } from './camera'

const camera = (headingRad: number): Camera => ({
  center: { x: 100, y: 200 },
  headingRad,
  pixelsPerMetre: 10,
  anchor: { x: 500, y: 600 },
})

describe('camera', () => {
  it('puts the centre at the anchor', () => {
    expect(worldToScreen(camera(1), { x: 100, y: 200 })).toEqual({ x: 500, y: 600 })
  })

  it('shows points ahead of the heading above the anchor (north-facing camera)', () => {
    const p = worldToScreen(camera(Math.PI / 2), { x: 100, y: 210 })
    expect(p.x).toBeCloseTo(500)
    expect(p.y).toBeCloseTo(500)
  })

  it('shows points to the right of the heading right of the anchor', () => {
    // Facing north, east is to the right.
    const p = worldToScreen(camera(Math.PI / 2), { x: 105, y: 200 })
    expect(p.x).toBeCloseTo(550)
    expect(p.y).toBeCloseTo(600)
  })

  it('rotates with the camera heading (east-facing camera)', () => {
    const p = worldToScreen(camera(0), { x: 110, y: 200 })
    expect(p.x).toBeCloseTo(500)
    expect(p.y).toBeCloseTo(500)
    const left = worldToScreen(camera(0), { x: 100, y: 205 }) // north is left when facing east
    expect(left.x).toBeCloseTo(450)
  })

  it('computes clockwise screen rotation relative to the camera', () => {
    expect(screenRotationDeg(camera(Math.PI / 2), Math.PI / 2)).toBeCloseTo(0)
    // Object turned 90 degrees to the right (clockwise) of the camera heading.
    expect(screenRotationDeg(camera(Math.PI / 2), 0)).toBeCloseTo(90)
  })

  it('screenToWorld is the inverse of worldToScreen for any heading', () => {
    for (const heading of [0, 0.7, Math.PI / 2, 3, -2.2]) {
      const cam = camera(heading)
      const world = { x: 123.4, y: 187.9 }
      const back = screenToWorld(cam, worldToScreen(cam, world))
      expect(back.x).toBeCloseTo(world.x, 9)
      expect(back.y).toBeCloseTo(world.y, 9)
    }
  })

  it('places the anchor at a fixed fraction of the viewport', () => {
    expect(anchorFor({ width: 1000, height: 500 })).toEqual({ x: 500, y: 425 })
  })
})
