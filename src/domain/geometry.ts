/** Basic 2D geometry in the scene frame. Pure functions, no dependencies. */

export interface Vec2 {
  readonly x: number
  readonly y: number
}

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Normalizes an angle in radians to the range (-PI, PI]. */
export function normalizeAngle(rad: number): number {
  const twoPi = 2 * Math.PI
  let a = rad % twoPi
  if (a > Math.PI) a -= twoPi
  if (a <= -Math.PI) a += twoPi
  return a
}

export function polylineLength(points: readonly Vec2[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1]!, points[i]!)
  }
  return total
}

export interface PolylineProjection {
  /** Distance from the query point to the closest point on the polyline. */
  readonly distance: number
  /** Signed lateral offset: positive when the query point is left of the polyline direction. */
  readonly lateralOffset: number
}

/** Projects a point on the closest segment of a polyline. Returns null for fewer than 2 points. */
export function projectOnPolyline(points: readonly Vec2[], point: Vec2): PolylineProjection | null {
  let best: PolylineProjection | null = null
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!
    const b = points[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) continue
    const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq))
    const closest = { x: a.x + t * dx, y: a.y + t * dy }
    const d = distance(point, closest)
    if (best === null || d < best.distance) {
      // In a y-up frame a positive cross product means the point is LEFT of the direction.
      const cross = dx * (point.y - a.y) - dy * (point.x - a.x)
      best = { distance: d, lateralOffset: cross / Math.sqrt(lengthSq) }
    }
  }
  return best
}
