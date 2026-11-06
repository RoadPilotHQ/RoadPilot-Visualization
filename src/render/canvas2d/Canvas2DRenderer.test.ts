import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYERS, LAYER_IDS } from '@/domain/layers'
import type { LayerId, LayerVisibility } from '@/domain/layers'
import type { SceneFrame } from '@/domain/scene'
import type { RenderInput } from '../Renderer'
import { DEFAULT_VIEW, panView } from '../view'
import { Canvas2DRenderer } from './Canvas2DRenderer'
import { COLORS, DEFAULT_PAINTERS, gridStepM } from './painters'
import type { Painter } from './painters'

interface Call {
  readonly name: string
  readonly args: readonly unknown[]
}

/** A 2D context double that records every call and property assignment. */
function recordingContext() {
  const calls: Call[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        return (...args: unknown[]) => {
          calls.push({ name, args })
        }
      },
      set: (_target, name: string, value: unknown) => {
        calls.push({ name: `set:${name}`, args: [value] })
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const point = (x: number, y: number) => ({ x, y })
const line = (offset: number) => [point(offset, -20), point(offset, 0), point(offset, 60)]

const frame: SceneFrame = {
  sequence: 1,
  timestampS: 1,
  sourceId: 'test',
  ego: {
    position: point(0, 0),
    headingRad: Math.PI / 2,
    speedMps: 20,
    steeringAngleRad: 0,
    curvaturePerM: 0,
    lengthM: 7.5,
    widthM: 2.55,
  },
  agents: [
    {
      id: 'car',
      kind: 'car',
      position: point(3, 20),
      headingRad: Math.PI / 2,
      speedMps: 20,
      lengthM: 4.5,
      widthM: 1.9,
    },
  ],
  signals: [{ id: 's', position: point(8, 30), state: 'red', remainingS: 5 }],
  lanes: [{ id: 'l', centerline: line(1.75), leftBoundary: line(3.5), rightBoundary: line(0) }],
  trajectory: {
    points: [point(0, 0), point(0, 20), point(0, 38)].map((position) => ({
      position,
      speedMps: 20,
      curvaturePerM: 0,
    })),
  },
  acc: null,
  inputs: null,
  status: [],
}

const viewport = { width: 800, height: 500 }

function draw(overrides: Partial<RenderInput> = {}, painters?: readonly Painter[]) {
  const { ctx, calls } = recordingContext()
  const surface = { width: 0, height: 0 }
  const renderer = new Canvas2DRenderer(surface, ctx, painters)
  renderer.resize(viewport, 2)
  renderer.render({
    frame,
    layers: DEFAULT_LAYERS,
    view: DEFAULT_VIEW,
    sceneLabel: 'TEST SCENE',
    ...overrides,
  })
  return { calls, surface }
}

const only = (layer: LayerId): LayerVisibility => ({
  ...(Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<LayerId, boolean>),
  [layer]: true,
})
const without = (layer: LayerId): LayerVisibility => ({ ...DEFAULT_LAYERS, [layer]: false })
const none = (): LayerVisibility => ({
  ...(Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<LayerId, boolean>),
})

/** All values assigned to a style property during drawing. */
const assigned = (calls: readonly Call[], property: string): unknown[] =>
  calls.filter((c) => c.name === `set:${property}`).map((c) => c.args[0])
const count = (calls: readonly Call[], name: string) => calls.filter((c) => c.name === name).length

describe('Canvas2DRenderer', () => {
  it('renders sparse live frames without inventing position or dimensions', () => {
    const sparseFrame: SceneFrame = {
      ...frame,
      agents: [],
      signals: [],
      lanes: [],
      trajectory: null,
      ego: {
        position: null,
        headingRad: null,
        speedMps: 4,
        steeringAngleRad: null,
        curvaturePerM: null,
        lengthM: null,
        widthM: null,
      },
    }
    const { calls } = draw({ frame: sparseFrame })
    expect(count(calls, 'arc')).toBe(0)
    expect(
      calls.some((call) => call.name === 'fillText' && call.args[0] === 'POSITION UNAVAILABLE'),
    ).toBe(true)
    expect(
      calls.some((call) => call.name === 'fillText' && call.args[0] === 'HEADING UNAVAILABLE'),
    ).toBe(true)
  })

  it('sizes the backing store by the device pixel ratio and scales the context', () => {
    const { calls, surface } = draw()
    expect(surface).toEqual({ width: 1600, height: 1000 })
    expect(calls.find((c) => c.name === 'setTransform')?.args).toEqual([2, 0, 0, 2, 0, 0])
  })

  it('clips drawing to the viewport and balances save/restore', () => {
    const { calls } = draw()
    expect(count(calls, 'clip')).toBe(1)
    expect(count(calls, 'save')).toBe(count(calls, 'restore'))
  })

  it('draws nothing before the viewport has a size', () => {
    const { ctx, calls } = recordingContext()
    new Canvas2DRenderer({ width: 0, height: 0 }, ctx).render({
      frame,
      layers: DEFAULT_LAYERS,
      view: DEFAULT_VIEW,
      sceneLabel: '',
    })
    expect(calls).toHaveLength(0)
  })

  it('draws only the background and ego-independent layers without a frame', () => {
    const { calls } = draw({ frame: null })
    expect(count(calls, 'fillRect')).toBe(1)
    expect(assigned(calls, 'fillStyle')).not.toContain(COLORS.egoFill)
    expect(assigned(calls, 'strokeStyle')).not.toContain(COLORS.laneBoundary)
  })
})

describe('layer visibility', () => {
  it('draws every layer by default', () => {
    const { calls } = draw()
    const fills = assigned(calls, 'fillStyle')
    const strokes = assigned(calls, 'strokeStyle')
    expect(fills).toContain(COLORS.roadSurface)
    expect(strokes).toContain(COLORS.laneBoundary)
    expect(strokes).toContain(COLORS.trajectory)
    expect(strokes).toContain(COLORS.grid)
    expect(fills).toContain('#c96d45') // car
    expect(fills).toContain('#e85d50') // red signal lamp
    expect(fills).toContain(COLORS.egoFill)
    expect(count(calls, 'fillText')).toBeGreaterThan(0)
  })

  it.each([
    ['lanes', 'strokeStyle', COLORS.laneBoundary],
    ['trajectory', 'strokeStyle', COLORS.trajectory],
    ['grid', 'strokeStyle', COLORS.grid],
    ['traffic', 'fillStyle', '#c96d45'],
    ['lights', 'fillStyle', COLORS.signalHousing],
  ] as const)('hides the %s layer on its own', (layer, property, color) => {
    expect(assigned(draw({ layers: DEFAULT_LAYERS }).calls, property)).toContain(color)
    const hidden = draw({ layers: without(layer) }).calls
    expect(assigned(hidden, property)).not.toContain(color)
    // The other layers are unaffected.
    expect(assigned(hidden, 'fillStyle')).toContain(COLORS.egoFill)
  })

  it('hides the road surface independently of the lane boundaries', () => {
    const hidden = draw({ layers: without('road') }).calls
    expect(assigned(hidden, 'fillStyle')).not.toContain(COLORS.roadSurface)
    expect(assigned(hidden, 'strokeStyle')).not.toContain(COLORS.roadEdge)
    expect(assigned(hidden, 'strokeStyle')).toContain(COLORS.laneBoundary)
  })

  it('hides all text with the labels layer, while the ego vehicle stays', () => {
    const hidden = draw({ layers: without('labels') }).calls
    expect(count(hidden, 'fillText')).toBe(0)
    expect(assigned(hidden, 'fillStyle')).toContain(COLORS.egoFill)
  })

  it('shows the lookahead label only while the trajectory layer is on', () => {
    const texts = (calls: readonly Call[]) =>
      calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])
    expect(texts(draw().calls)).toContain('LOOKAHEAD')
    expect(texts(draw({ layers: without('trajectory') }).calls)).not.toContain('LOOKAHEAD')
  })

  it('draws a layer when only that layer is on, and nothing else of the optional layers', () => {
    const lanesOnly = draw({ layers: only('lanes') }).calls
    expect(assigned(lanesOnly, 'strokeStyle')).toContain(COLORS.laneBoundary)
    for (const other of [COLORS.trajectory, COLORS.grid, COLORS.roadEdge]) {
      expect(assigned(lanesOnly, 'strokeStyle')).not.toContain(other)
    }
    expect(assigned(lanesOnly, 'fillStyle')).not.toContain('#c96d45')
  })

  it('always draws the ego vehicle, even with every layer off', () => {
    const calls = draw({ layers: none() }).calls
    expect(assigned(calls, 'fillStyle')).toContain(COLORS.egoFill)
    expect(count(calls, 'fillText')).toBe(0)
  })

  it('keeps the painter order from back to front', () => {
    expect(DEFAULT_PAINTERS.map((p) => p.id)).toEqual([
      'background',
      'grid',
      'road',
      'lanes',
      'trajectory',
      'traffic',
      'lights',
      'ego',
      'labels',
    ])
  })

  it('skips painters of hidden layers and calls the others in order', () => {
    const order: string[] = []
    const painter = (id: string, layer: LayerId | null): Painter => ({
      id,
      layer,
      paint: () => {
        order.push(id)
      },
    })
    draw({ layers: without('lanes') }, [
      painter('bg', null),
      painter('road', 'road'),
      painter('lanes', 'lanes'),
      painter('ego', null),
    ])
    expect(order).toEqual(['bg', 'road', 'ego'])
  })
})

describe('drawing from the scene data', () => {
  it('does not invent geometry: no lanes means no road surface', () => {
    const calls = draw({ frame: { ...frame, lanes: [] } }).calls
    expect(assigned(calls, 'fillStyle')).not.toContain(COLORS.roadSurface)
    expect(assigned(calls, 'strokeStyle')).not.toContain(COLORS.laneBoundary)
  })

  it('skips degenerate lanes and trajectories instead of failing', () => {
    const degenerate: SceneFrame = {
      ...frame,
      lanes: [{ id: 'x', centerline: [], leftBoundary: [point(0, 0)], rightBoundary: [] }],
      trajectory: { points: [{ position: point(0, 0), speedMps: null, curvaturePerM: null }] },
    }
    const calls = draw({ frame: degenerate }).calls
    expect(assigned(calls, 'fillStyle')).not.toContain(COLORS.roadSurface)
    expect(assigned(calls, 'strokeStyle')).not.toContain(COLORS.trajectory)
  })

  it('uses the pan/zoom view: dragging moves where the ego vehicle is drawn', () => {
    const translations = (calls: readonly Call[]) =>
      calls.filter((c) => c.name === 'translate').map((c) => c.args as [number, number])
    const near = (list: readonly [number, number][], x: number, y: number) =>
      list.some(([tx, ty]) => Math.abs(tx - x) < 1e-6 && Math.abs(ty - y) < 1e-6)
    // Follow mode: the ego vehicle sits at the anchor (50% / 85% of the viewport).
    expect(near(translations(draw().calls), 400, 425)).toBe(true)
    // Dragging 100 px right and 30 px down moves it by the same amount.
    const view = panView(DEFAULT_VIEW, 100, 30, frame.ego, viewport)
    expect(near(translations(draw({ view }).calls), 500, 455)).toBe(true)
  })
})

describe('grid spacing', () => {
  it('keeps at least 40 px between lines at every zoom level', () => {
    for (const zoom of [2, 5, 9, 20, 60]) {
      expect(gridStepM(zoom) * zoom).toBeGreaterThanOrEqual(40)
    }
  })

  it('uses a finer grid when zoomed in', () => {
    expect(gridStepM(60)).toBeLessThan(gridStepM(2))
  })
})
