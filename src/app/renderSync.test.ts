import { describe, expect, it } from 'vitest'
import type { FrameScheduler } from '@/domain/scheduler'
import { Canvas2DRenderer } from '@/render/canvas2d/Canvas2DRenderer'
import { COLORS } from '@/render/canvas2d/painters'
import { RenderController } from '@/render/RenderController'
import type { RenderInput, Renderer } from '@/render/Renderer'
import { DEFAULT_VIEW } from '@/render/view'
import { SimulationSource } from '@/sources/simulation/SimulationSource'
import { attachSource, createSceneStore } from '@/state/sceneStore'

class ManualScheduler implements FrameScheduler {
  private callback: ((nowMs: number) => void) | null = null
  private nowMs = 0
  request(callback: (nowMs: number) => void): number {
    this.callback = callback
    return 1
  }
  cancel(): void {
    this.callback = null
  }
  /** Advances fake time by `ms` and runs the pending callback, if any. */
  tick(ms: number): void {
    this.nowMs += ms
    const cb = this.callback
    this.callback = null
    cb?.(this.nowMs)
  }
}

class SpyRenderer implements Renderer {
  inputs: RenderInput[] = []
  resize() {}
  render(input: RenderInput) {
    this.inputs.push(input)
  }
  dispose() {}
}

/** Wires store -> render controller the way CanvasSceneView does. */
function setup() {
  const store = createSceneStore()
  const clockScheduler = new ManualScheduler()
  const renderScheduler = new ManualScheduler()
  const source = new SimulationSource({ scheduler: clockScheduler })
  const renderer = new SpyRenderer()
  const controller = new RenderController(
    renderer,
    () => {
      const s = store.getState()
      return { frame: s.frame, layers: s.layers, sceneLabel: '', view: DEFAULT_VIEW }
    },
    renderScheduler,
  )
  store.subscribe(() => controller.invalidate())
  attachSource(store, source)
  return { store, source, renderer, controller, clockScheduler, renderScheduler }
}

describe('playback and renderer stay synchronized', () => {
  it('draws the frame the store holds, at the playback time', () => {
    const { store, renderer, clockScheduler, renderScheduler } = setup()
    clockScheduler.tick(0)
    for (let i = 0; i < 90; i += 1) {
      clockScheduler.tick(16.7)
      renderScheduler.tick(0)
    }
    const drawn = renderer.inputs.at(-1)?.frame
    expect(drawn).toBeDefined()
    expect(drawn).toBe(store.getState().frame)
    expect(drawn?.timestampS).toBeGreaterThan(1)
  })

  it('never draws an older frame after a newer one', () => {
    const { renderer, clockScheduler, renderScheduler } = setup()
    clockScheduler.tick(0)
    for (let i = 0; i < 120; i += 1) {
      clockScheduler.tick(16.7)
      if (i % 3 === 0) renderScheduler.tick(0) // the renderer may skip frames
    }
    const sequences = renderer.inputs.map((input) => input.frame?.sequence ?? -1)
    expect(sequences.length).toBeGreaterThan(10)
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b))
  })

  it('draws a seek while paused', () => {
    const { source, renderer, renderScheduler } = setup()
    source.playback.pause()
    source.playback.seek(30)
    renderScheduler.tick(0)
    expect(renderer.inputs.at(-1)?.frame?.timestampS).toBe(30)
  })

  it('does not draw while playback is paused and nothing changes', () => {
    const { source, renderer, renderScheduler, clockScheduler } = setup()
    source.playback.pause()
    renderScheduler.tick(0)
    const before = renderer.inputs.length
    for (let i = 0; i < 20; i += 1) {
      clockScheduler.tick(16.7)
      renderScheduler.tick(0)
    }
    expect(renderer.inputs).toHaveLength(before)
  })

  it('redraws when a layer is toggled', () => {
    const { store, renderer, renderScheduler } = setup()
    renderScheduler.tick(0)
    const before = renderer.inputs.length
    store.getState().toggleLayer('lanes')
    renderScheduler.tick(0)
    expect(renderer.inputs).toHaveLength(before + 1)
    expect(renderer.inputs.at(-1)?.layers.lanes).toBe(false)
  })
})

describe('Canvas 2D renderer with simulated frames', () => {
  const calls: string[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_t, name: string) => () => {
        calls.push(name)
      },
      set: (_t, name: string, value: unknown) => {
        if (name === 'strokeStyle') calls.push(`stroke:${String(value)}`)
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D

  it('renders the whole timeline without errors', () => {
    const { store, source } = setup()
    const renderer = new Canvas2DRenderer({ width: 0, height: 0 }, ctx)
    renderer.resize({ width: 900, height: 440 }, 1)
    for (let t = 0; t < 60; t += 5) {
      source.playback.seek(t)
      renderer.render({
        frame: store.getState().frame,
        layers: store.getState().layers,
        sceneLabel: 'SIM',
        view: DEFAULT_VIEW,
      })
    }
    expect(calls).toContain(`stroke:${COLORS.laneBoundary}`)
    expect(calls).toContain(`stroke:${COLORS.trajectory}`)
  })
})
