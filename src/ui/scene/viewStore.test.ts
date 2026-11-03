import { describe, expect, it } from 'vitest'
import type { EgoState } from '@/domain/scene'
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from '@/render/view'
import { createSceneViewStore, ZOOM_STEP } from './viewStore'

const ego: EgoState = {
  position: { x: 10, y: 20 },
  headingRad: 1,
  speedMps: 0,
  steeringAngleRad: 0,
  curvaturePerM: 0,
  lengthM: 7,
  widthM: 2.5,
}

const makeStore = (current: EgoState | null = ego) => {
  const store = createSceneViewStore(() => current)
  store.getState().setViewport({ width: 800, height: 500 })
  return store
}

describe('scene view store', () => {
  it('starts in follow mode at the default zoom', () => {
    const { view } = makeStore().getState()
    expect(view.mode).toBe('follow')
    expect(view.pixelsPerMetre).toBe(ZOOM_DEFAULT)
  })

  it('pan leaves follow mode and follow returns to it', () => {
    const store = makeStore()
    store.getState().pan(20, 10)
    expect(store.getState().view.mode).toBe('free')
    store.getState().follow()
    expect(store.getState().view.mode).toBe('follow')
  })

  it('zooms in steps and respects the limits', () => {
    const store = makeStore()
    store.getState().zoom(ZOOM_STEP, null)
    expect(store.getState().view.pixelsPerMetre).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP)
    for (let i = 0; i < 60; i += 1) store.getState().zoom(ZOOM_STEP, null)
    expect(store.getState().view.pixelsPerMetre).toBe(ZOOM_MAX)
    for (let i = 0; i < 120; i += 1) store.getState().zoom(1 / ZOOM_STEP, null)
    expect(store.getState().view.pixelsPerMetre).toBe(ZOOM_MIN)
  })

  it('reset restores follow mode and the default zoom', () => {
    const store = makeStore()
    store.getState().pan(50, 50)
    store.getState().zoom(2, null)
    store.getState().reset()
    expect(store.getState().view.mode).toBe('follow')
    expect(store.getState().view.pixelsPerMetre).toBe(ZOOM_DEFAULT)
  })

  it('works before any ego vehicle exists', () => {
    const store = makeStore(null)
    store.getState().pan(5, 5)
    expect(store.getState().view.mode).toBe('free')
    expect(Number.isFinite(store.getState().view.center.x)).toBe(true)
  })

  it('notifies subscribers on view changes', () => {
    const store = makeStore()
    let notifications = 0
    store.subscribe(() => {
      notifications += 1
    })
    store.getState().zoom(1.1, null)
    store.getState().pan(1, 1)
    expect(notifications).toBe(2)
  })
})
