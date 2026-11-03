import { headingToCompassDeg } from '@/domain/coordinates'
import type { Vec2 } from '@/domain/geometry'
import type { LayerId, LayerVisibility } from '@/domain/layers'
import type { Agent, SceneFrame, SignalState } from '@/domain/scene'
import { screenRotationDeg, screenToWorld, worldToScreen } from '../camera'
import type { Camera, Viewport } from '../camera'

/** Colours from the dashboard design (see src/theme/styles.css). */
export const COLORS = {
  background: '#1d211d',
  grid: '#30352e',
  roadSurface: '#31372f',
  roadEdge: '#8a9084',
  laneBoundary: '#72d59b',
  trajectory: '#f4a64f',
  egoFill: '#e7a34d',
  egoStroke: '#ffd18a',
  egoLabel: '#f1c17f',
  glass: '#353e3b',
  headlight: '#fff2c7',
  hud: '#9ba493',
  signalHousing: '#151915',
  signalFrame: '#858d7f',
  signalPole: '#9ba18f',
} as const

const AGENT_STYLE: Readonly<Record<string, { fill: string; stroke: string }>> = {
  truck: { fill: '#d4d8cf', stroke: '#f3f0e6' },
  bus: { fill: '#d4d8cf', stroke: '#f3f0e6' },
  car: { fill: '#c96d45', stroke: '#e79b75' },
}
const DEFAULT_AGENT_STYLE = { fill: '#8a9084', stroke: '#c5cabb' }

const SIGNAL_COLORS: Readonly<Record<SignalState, string>> = {
  red: '#e85d50',
  yellow: '#d69c43',
  green: '#65c987',
  off: '#4a5047',
  unknown: '#4a5047',
}

export interface PaintContext {
  readonly frame: SceneFrame | null
  readonly camera: Camera
  readonly viewport: Viewport
  readonly layers: LayerVisibility
  readonly sceneLabel: string
}

/** One drawing step. `layer: null` means it is always drawn. */
export interface Painter {
  readonly id: string
  readonly layer: LayerId | null
  paint(ctx: CanvasRenderingContext2D, scene: PaintContext): void
}

// --- helpers ------------------------------------------------------------------------------

function tracePolyline(ctx: CanvasRenderingContext2D, camera: Camera, points: readonly Vec2[]) {
  ctx.beginPath()
  for (let i = 0; i < points.length; i += 1) {
    const s = worldToScreen(camera, points[i]!)
    if (i === 0) ctx.moveTo(s.x, s.y)
    else ctx.lineTo(s.x, s.y)
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

const GRID_STEPS_M = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
const GRID_MIN_SPACING_PX = 40
const GRID_MAX_LINES = 200

/** Smallest "nice" grid spacing in metres that is at least GRID_MIN_SPACING_PX wide on screen. */
export function gridStepM(pixelsPerMetre: number): number {
  return (
    GRID_STEPS_M.find((step) => step * pixelsPerMetre >= GRID_MIN_SPACING_PX) ??
    GRID_STEPS_M[GRID_STEPS_M.length - 1]!
  )
}

/** Draws a vehicle body centred on the origin, pointing up (front at negative y). */
function drawVehicleBody(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  lengthPx: number,
  fill: string,
  stroke: string,
  lineWidth: number,
) {
  roundedRect(
    ctx,
    -widthPx / 2,
    -lengthPx / 2,
    widthPx,
    lengthPx,
    Math.min(widthPx, lengthPx) * 0.22,
  )
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = stroke
  ctx.stroke()
}

function drawWindscreen(ctx: CanvasRenderingContext2D, widthPx: number, lengthPx: number) {
  roundedRect(
    ctx,
    -widthPx * 0.36,
    -lengthPx / 2 + lengthPx * 0.08,
    widthPx * 0.72,
    Math.min(lengthPx * 0.22, 26),
    3,
  )
  ctx.fillStyle = COLORS.glass
  ctx.fill()
}

// --- painters -----------------------------------------------------------------------------

const background: Painter = {
  id: 'background',
  layer: null,
  paint(ctx, { viewport }) {
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, viewport.width, viewport.height)
  },
}

/** World-aligned grid, so that motion of the ego vehicle is visible. */
const grid: Painter = {
  id: 'grid',
  layer: 'grid',
  paint(ctx, { camera, viewport }) {
    const corners = [
      screenToWorld(camera, { x: 0, y: 0 }),
      screenToWorld(camera, { x: viewport.width, y: 0 }),
      screenToWorld(camera, { x: 0, y: viewport.height }),
      screenToWorld(camera, { x: viewport.width, y: viewport.height }),
    ]
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const step = gridStepM(camera.pixelsPerMetre)
    if ((maxX - minX) / step > GRID_MAX_LINES || (maxY - minY) / step > GRID_MAX_LINES) return
    ctx.beginPath()
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
      const a = worldToScreen(camera, { x, y: minY })
      const b = worldToScreen(camera, { x, y: maxY })
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      const a = worldToScreen(camera, { x: minX, y })
      const b = worldToScreen(camera, { x: maxX, y })
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
    ctx.lineWidth = 1
    ctx.strokeStyle = COLORS.grid
    ctx.stroke()
  },
}

/** Road surface and dashed lane edges, exactly from the lane data. Nothing is inferred. */
const road: Painter = {
  id: 'road',
  layer: 'road',
  paint(ctx, { frame, camera }) {
    if (frame === null) return
    for (const lane of frame.lanes) {
      if (lane.leftBoundary.length < 2 || lane.rightBoundary.length < 2) continue
      ctx.beginPath()
      lane.leftBoundary.forEach((p, i) => {
        const s = worldToScreen(camera, p)
        if (i === 0) ctx.moveTo(s.x, s.y)
        else ctx.lineTo(s.x, s.y)
      })
      for (let i = lane.rightBoundary.length - 1; i >= 0; i -= 1) {
        const s = worldToScreen(camera, lane.rightBoundary[i]!)
        ctx.lineTo(s.x, s.y)
      }
      ctx.closePath()
      ctx.fillStyle = COLORS.roadSurface
      ctx.fill()
      // Same-colour hairline so neighbouring lanes show no anti-aliasing seam.
      ctx.lineWidth = 1
      ctx.strokeStyle = COLORS.roadSurface
      ctx.setLineDash([])
      ctx.stroke()
    }
    ctx.lineWidth = 2
    ctx.strokeStyle = COLORS.roadEdge
    ctx.setLineDash([14, 12])
    for (const lane of frame.lanes) {
      tracePolyline(ctx, camera, lane.leftBoundary)
      ctx.stroke()
      tracePolyline(ctx, camera, lane.rightBoundary)
      ctx.stroke()
    }
    ctx.setLineDash([])
  },
}

const lanes: Painter = {
  id: 'lanes',
  layer: 'lanes',
  paint(ctx, { frame, camera }) {
    if (frame === null || frame.lanes.length === 0) return
    ctx.lineWidth = 3
    ctx.strokeStyle = COLORS.laneBoundary
    ctx.globalAlpha = 0.9
    for (const lane of frame.lanes) {
      tracePolyline(ctx, camera, lane.leftBoundary)
      ctx.stroke()
      tracePolyline(ctx, camera, lane.rightBoundary)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },
}

const trajectory: Painter = {
  id: 'trajectory',
  layer: 'trajectory',
  paint(ctx, { frame, camera }) {
    const points = frame?.trajectory?.points
    if (!points || points.length < 2) return
    tracePolyline(
      ctx,
      camera,
      points.map((p) => p.position),
    )
    ctx.lineWidth = 4
    ctx.strokeStyle = COLORS.trajectory
    ctx.setLineDash([10, 8])
    ctx.stroke()
    ctx.setLineDash([])
    const end = worldToScreen(camera, points[points.length - 1]!.position)
    ctx.beginPath()
    ctx.arc(end.x, end.y, 7, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.trajectory
    ctx.fill()
  },
}

function paintAgent(ctx: CanvasRenderingContext2D, camera: Camera, agent: Agent) {
  const p = worldToScreen(camera, agent.position)
  const style = AGENT_STYLE[agent.kind] ?? DEFAULT_AGENT_STYLE
  const widthPx = agent.widthM * camera.pixelsPerMetre
  const lengthPx = agent.lengthM * camera.pixelsPerMetre
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate((screenRotationDeg(camera, agent.headingRad) * Math.PI) / 180)
  drawVehicleBody(ctx, widthPx, lengthPx, style.fill, style.stroke, 2)
  drawWindscreen(ctx, widthPx, lengthPx)
  ctx.restore()
}

const traffic: Painter = {
  id: 'traffic',
  layer: 'traffic',
  paint(ctx, { frame, camera }) {
    if (frame === null) return
    for (const agent of frame.agents) paintAgent(ctx, camera, agent)
  },
}

const lights: Painter = {
  id: 'lights',
  layer: 'lights',
  paint(ctx, { frame, camera }) {
    if (frame === null) return
    for (const signal of frame.signals) {
      const p = worldToScreen(camera, signal.position)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.beginPath()
      ctx.moveTo(0, 62)
      ctx.lineTo(0, 88)
      ctx.lineWidth = 3
      ctx.strokeStyle = COLORS.signalPole
      ctx.stroke()
      roundedRect(ctx, -9, -9, 18, 72, 6)
      ctx.fillStyle = COLORS.signalHousing
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = COLORS.signalFrame
      ctx.stroke()
      const lamps: readonly [SignalState, number][] = [
        ['red', 8],
        ['yellow', 27],
        ['green', 46],
      ]
      for (const [state, y] of lamps) {
        ctx.beginPath()
        ctx.arc(0, y, 6, 0, Math.PI * 2)
        ctx.globalAlpha = signal.state === state ? 1 : 0.3
        ctx.fillStyle = SIGNAL_COLORS[state]
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.restore()
    }
  },
}

const ego: Painter = {
  id: 'ego',
  layer: null,
  paint(ctx, { frame, camera }) {
    if (frame === null) return
    const { ego: vehicle } = frame
    const p = worldToScreen(camera, vehicle.position)
    const widthPx = vehicle.widthM * camera.pixelsPerMetre
    const lengthPx = vehicle.lengthM * camera.pixelsPerMetre
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate((screenRotationDeg(camera, vehicle.headingRad) * Math.PI) / 180)
    drawVehicleBody(ctx, widthPx, lengthPx, COLORS.egoFill, COLORS.egoStroke, 3)
    drawWindscreen(ctx, widthPx, lengthPx)
    ctx.fillStyle = COLORS.headlight
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(side * widthPx * 0.36, -lengthPx / 2 + 3, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },
}

const labels: Painter = {
  id: 'labels',
  layer: 'labels',
  paint(ctx, { frame, camera, layers, sceneLabel }) {
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.fillStyle = COLORS.hud
    ctx.font = '12px "DM Mono", monospace'
    ctx.fillText(sceneLabel, 24, 30)
    if (frame === null) return
    const { ego: vehicle } = frame
    ctx.fillText(
      `SCENE X ${vehicle.position.x.toFixed(1)} · Y ${vehicle.position.y.toFixed(1)}`,
      24,
      49,
    )
    ctx.fillText(
      `HEADING ${headingToCompassDeg(vehicle.headingRad).toFixed(1).padStart(5, '0')}°`,
      24,
      68,
    )
    ctx.font = '700 13px "DM Sans", sans-serif'
    const egoScreen = worldToScreen(camera, vehicle.position)
    const halfWidth = (vehicle.widthM * camera.pixelsPerMetre) / 2
    ctx.fillStyle = COLORS.egoLabel
    ctx.fillText('EGO VEHICLE', egoScreen.x + Math.max(halfWidth, 8) + 14, egoScreen.y + 5)
    const points = frame.trajectory?.points
    if (layers.trajectory && points && points.length >= 2) {
      const end = worldToScreen(camera, points[points.length - 1]!.position)
      ctx.font = '13px "DM Sans", sans-serif'
      ctx.fillStyle = COLORS.trajectory
      ctx.fillText('LOOKAHEAD', end.x + 16, end.y - 8)
    }
  },
}

/** Back to front. */
export const DEFAULT_PAINTERS: readonly Painter[] = [
  background,
  grid,
  road,
  lanes,
  trajectory,
  traffic,
  lights,
  ego,
  labels,
]
