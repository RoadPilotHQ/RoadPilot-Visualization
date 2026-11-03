import type { Vec2 } from '@/domain/geometry'

/**
 * A deterministic synthetic road used by simulated scenarios. It is a pure function of the
 * arc length `s` (metres along the road centre line), so scenarios are exactly reproducible.
 * All coordinates are in the scene frame (metres).
 */

const STEP_M = 1
const START_S = -100
const END_S = 1600
const ORIGIN: Vec2 = { x: 12458.2, y: 837.6 }
const ORIGIN_HEADING = Math.PI / 2 // north at s = 0

/** Signed curvature in 1/m (positive = left). A continuous, gentle right bend. */
export function roadCurvature(s: number): number {
  return -0.0024 * (0.7 + 0.3 * Math.cos((2 * Math.PI * s) / 800))
}

interface RoadSample {
  readonly x: number
  readonly y: number
  readonly heading: number
}

function buildTable(): readonly RoadSample[] {
  // Integrate forward from an arbitrary start pose, then move the whole curve rigidly so that
  // the pose at s = 0 is ORIGIN heading north.
  const raw: RoadSample[] = [{ x: 0, y: 0, heading: 0 }]
  let x = 0
  let y = 0
  let heading = 0
  for (let s = START_S; s < END_S; s += STEP_M) {
    const k = roadCurvature(s + STEP_M / 2)
    const mid = heading + (k * STEP_M) / 2
    x += STEP_M * Math.cos(mid)
    y += STEP_M * Math.sin(mid)
    heading += k * STEP_M
    raw.push({ x, y, heading })
  }
  const anchor = raw[-START_S / STEP_M]!
  const rotation = ORIGIN_HEADING - anchor.heading
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return raw.map((p) => {
    const dx = p.x - anchor.x
    const dy = p.y - anchor.y
    return {
      x: ORIGIN.x + dx * cos - dy * sin,
      y: ORIGIN.y + dx * sin + dy * cos,
      heading: p.heading + rotation,
    }
  })
}

const TABLE = buildTable()

export const ROAD_START_S = START_S
export const ROAD_END_S = END_S - 1

/** Centre-line position and heading at arc length `s` (clamped to the table range). */
export function roadPose(s: number): { position: Vec2; heading: number } {
  const clamped = Math.min(Math.max(s, START_S), END_S - 1e-9)
  const f = (clamped - START_S) / STEP_M
  const i = Math.floor(f)
  const t = f - i
  const a = TABLE[i]!
  const b = TABLE[i + 1]!
  return {
    position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
    heading: a.heading + (b.heading - a.heading) * t,
  }
}

/** Point at arc length `s` with a lateral offset from the centre line (positive = left). */
export function roadPoint(s: number, lateral: number): Vec2 {
  const { position, heading } = roadPose(s)
  return {
    x: position.x - Math.sin(heading) * lateral,
    y: position.y + Math.cos(heading) * lateral,
  }
}
