import { describe, expect, it } from 'vitest'
import type { EgoState } from '@/domain/scene'
import { anchorFor, screenToWorld, worldToScreen } from './camera'
import {
  DEFAULT_VIEW,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  followView,
  panView,
  resetView,
  resolveCamera,
  zoomView,
} from './view'
import type { ViewState } from './view'

const viewport = { width: 800, height: 500 }

const ego = (x: number, y: number, headingRad = Math.PI / 2): EgoState => ({
  position: { x, y },
  headingRad,
  speedMps: 20,
  steeringAngleRad: 0,
  curvaturePerM: 0,
  lengthM: 7.5,
  widthM: 2.55,
})

describe('zoom limits', () => {
  it('clamps to the allowed range', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN)
    expect(clampZoom(1000)).toBe(ZOOM_MAX)
    expect(clampZoom(10)).toBe(10)
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT)
  })

  it('never zooms beyond the limits, however often it is applied', () => {
    let view: ViewState = DEFAULT_VIEW
    for (let i = 0; i < 100; i += 1) view = zoomView(view, 1.5, null, ego(0, 0), viewport)
    expect(view.pixelsPerMetre).toBe(ZOOM_MAX)
    for (let i = 0; i < 100; i += 1) view = zoomView(view, 1 / 1.5, null, ego(0, 0), viewport)
    expect(view.pixelsPerMetre).toBe(ZOOM_MIN)
  })

  it('ignores invalid factors', () => {
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomView(DEFAULT_VIEW, factor, null, ego(0, 0), viewport)).toBe(DEFAULT_VIEW)
    }
  })
})

describe('follow mode', () => {
  it('centres the camera on the ego vehicle and points its heading up', () => {
    const e = ego(500, 800, 1)
    const camera = resolveCamera(DEFAULT_VIEW, e, viewport)
    expect(camera.center).toEqual(e.position)
    expect(camera.headingRad).toBe(1)
    expect(worldToScreen(camera, e.position)).toEqual(anchorFor(viewport))
  })

  it('tracks the ego vehicle as it moves', () => {
    const a = resolveCamera(DEFAULT_VIEW, ego(0, 0), viewport)
    const b = resolveCamera(DEFAULT_VIEW, ego(0, 50), viewport)
    expect(a.center).not.toEqual(b.center)
    expect(worldToScreen(b, { x: 0, y: 50 })).toEqual(anchorFor(viewport))
  })

  it('zooming in follow mode keeps following and ignores the cursor', () => {
    const view = zoomView(DEFAULT_VIEW, 2, { x: 10, y: 10 }, ego(0, 0), viewport)
    expect(view.mode).toBe('follow')
    expect(view.pixelsPerMetre).toBeCloseTo(ZOOM_DEFAULT * 2)
  })

  it('falls back to the stored centre when there is no ego vehicle', () => {
    const view: ViewState = { ...DEFAULT_VIEW, center: { x: 7, y: 9 } }
    expect(resolveCamera(view, null, viewport).center).toEqual({ x: 7, y: 9 })
  })
})

describe('panning', () => {
  it('switches to free mode and freezes the camera at the ego position and heading', () => {
    const e = ego(100, 200, 0.5)
    const panned = panView(DEFAULT_VIEW, 0, 0, e, viewport)
    expect(panned.mode).toBe('free')
    expect(panned.center.x).toBeCloseTo(100)
    expect(panned.center.y).toBeCloseTo(200)
    expect(panned.headingRad).toBe(0.5)
  })

  it('moves the scene with the pointer: a world point follows the drag', () => {
    const e = ego(100, 200)
    const before = resolveCamera(DEFAULT_VIEW, e, viewport)
    const point = { x: 103, y: 215 }
    const start = worldToScreen(before, point)
    const panned = panView(DEFAULT_VIEW, 40, -25, e, viewport)
    const after = worldToScreen(resolveCamera(panned, e, viewport), point)
    expect(after.x).toBeCloseTo(start.x + 40)
    expect(after.y).toBeCloseTo(start.y - 25)
  })

  it('accumulates drags in free mode', () => {
    const e = ego(0, 0)
    let view = panView(DEFAULT_VIEW, 10, 0, e, viewport)
    view = panView(view, 10, 0, e, viewport)
    const point = { x: 0, y: 0 }
    const screen = worldToScreen(resolveCamera(view, e, viewport), point)
    expect(screen.x).toBeCloseTo(anchorFor(viewport).x + 20)
  })

  it('keeps the camera still while the ego vehicle drives away in free mode', () => {
    const view = panView(DEFAULT_VIEW, 5, 5, ego(0, 0), viewport)
    const a = resolveCamera(view, ego(0, 0), viewport)
    const b = resolveCamera(view, ego(0, 100), viewport)
    expect(a).toEqual(b)
  })

  it('ignores non-finite drags', () => {
    expect(panView(DEFAULT_VIEW, Number.NaN, 0, ego(0, 0), viewport)).toBe(DEFAULT_VIEW)
  })

  it('returns to follow mode and keeps the zoom', () => {
    const e = ego(0, 0)
    const zoomed = zoomView(DEFAULT_VIEW, 2, null, e, viewport)
    const free = panView(zoomed, 30, 30, e, viewport)
    const back = followView(free)
    expect(back.mode).toBe('follow')
    expect(back.pixelsPerMetre).toBe(free.pixelsPerMetre)
    expect(followView(back)).toBe(back)
  })

  it('reset restores follow mode and the default zoom', () => {
    expect(resetView()).toEqual(DEFAULT_VIEW)
  })
})

describe('zoom about the cursor in free mode', () => {
  it('keeps the world point under the cursor fixed', () => {
    const e = ego(100, 200, 0.8)
    const free = panView(DEFAULT_VIEW, 25, -40, e, viewport)
    const cursor = { x: 600, y: 120 }
    const worldBefore = screenToWorld(resolveCamera(free, e, viewport), cursor)
    const zoomed = zoomView(free, 1.6, cursor, e, viewport)
    expect(zoomed.pixelsPerMetre).toBeCloseTo(free.pixelsPerMetre * 1.6)
    const worldAfter = screenToWorld(resolveCamera(zoomed, e, viewport), cursor)
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 9)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 9)
  })

  it('keeps the point fixed at the zoom limit too (no drift when clamped)', () => {
    const e = ego(0, 0)
    let view = panView(DEFAULT_VIEW, 1, 1, e, viewport)
    const cursor = { x: 300, y: 300 }
    const worldBefore = screenToWorld(resolveCamera(view, e, viewport), cursor)
    for (let i = 0; i < 20; i += 1) view = zoomView(view, 2, cursor, e, viewport)
    expect(view.pixelsPerMetre).toBe(ZOOM_MAX)
    const worldAfter = screenToWorld(resolveCamera(view, e, viewport), cursor)
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6)
  })
})
