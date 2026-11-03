import { describe, expect, it } from 'vitest'
import type { FrameScheduler } from '@/domain/scheduler'
import { DEFAULT_LAYERS } from '@/domain/layers'
import type { Viewport } from './camera'
import { RenderController } from './RenderController'
import type { RenderInput, Renderer } from './Renderer'
import { DEFAULT_VIEW } from './view'

class ManualScheduler implements FrameScheduler {
  private callback: ((nowMs: number) => void) | null = null
  requests = 0
  request(callback: (nowMs: number) => void): number {
    this.requests += 1
    this.callback = callback
    return this.requests
  }
  cancel(): void {
    this.callback = null
  }
  get pending(): boolean {
    return this.callback !== null
  }
  runFrame(): void {
    const cb = this.callback
    this.callback = null
    cb?.(0)
  }
}

class SpyRenderer implements Renderer {
  inputs: RenderInput[] = []
  resizes: { viewport: Viewport; dpr: number }[] = []
  disposed = false
  resize(viewport: Viewport, dpr: number) {
    this.resizes.push({ viewport, dpr })
  }
  render(input: RenderInput) {
    this.inputs.push(input)
  }
  dispose() {
    this.disposed = true
  }
}

const input = (label: string): RenderInput => ({
  frame: null,
  layers: DEFAULT_LAYERS,
  view: DEFAULT_VIEW,
  sceneLabel: label,
})

describe('RenderController', () => {
  it('does not draw until it is invalidated', () => {
    const scheduler = new ManualScheduler()
    const renderer = new SpyRenderer()
    new RenderController(renderer, () => input('a'), scheduler)
    expect(scheduler.pending).toBe(false)
    expect(renderer.inputs).toHaveLength(0)
  })

  it('coalesces many invalidations into one draw per animation frame', () => {
    const scheduler = new ManualScheduler()
    const renderer = new SpyRenderer()
    const controller = new RenderController(renderer, () => input('a'), scheduler)
    for (let i = 0; i < 50; i += 1) controller.invalidate()
    expect(scheduler.requests).toBe(1)
    scheduler.runFrame()
    expect(renderer.inputs).toHaveLength(1)
    expect(controller.draws).toBe(1)
    controller.invalidate()
    scheduler.runFrame()
    expect(renderer.inputs).toHaveLength(2)
  })

  it('draws the newest input, read at draw time', () => {
    const scheduler = new ManualScheduler()
    const renderer = new SpyRenderer()
    let label = 'old'
    const controller = new RenderController(renderer, () => input(label), scheduler)
    controller.invalidate()
    label = 'new'
    scheduler.runFrame()
    expect(renderer.inputs[0]?.sceneLabel).toBe('new')
  })

  it('resize forwards the size and schedules a redraw', () => {
    const scheduler = new ManualScheduler()
    const renderer = new SpyRenderer()
    const controller = new RenderController(renderer, () => input('a'), scheduler)
    controller.resize({ width: 640, height: 360 }, 2)
    expect(renderer.resizes).toEqual([{ viewport: { width: 640, height: 360 }, dpr: 2 }])
    expect(scheduler.pending).toBe(true)
  })

  it('stops drawing after dispose and cancels the pending frame', () => {
    const scheduler = new ManualScheduler()
    const renderer = new SpyRenderer()
    const controller = new RenderController(renderer, () => input('a'), scheduler)
    controller.invalidate()
    controller.dispose()
    expect(renderer.disposed).toBe(true)
    expect(scheduler.pending).toBe(false)
    controller.invalidate()
    controller.resize({ width: 1, height: 1 }, 1)
    expect(scheduler.pending).toBe(false)
    expect(renderer.inputs).toHaveLength(0)
  })
})
