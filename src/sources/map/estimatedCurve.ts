import { MAP_POSITION_DIVISOR } from '@/domain/coordinates'
import type { ScenePlanePoint } from '@/domain/coordinates'

/** RoadPilot-Map node fields needed to reproduce its documented curve estimate. */
export interface MapCurveNode {
  /** Raw integer [east, up, south] position from geometry.jsonl. */
  readonly position: readonly [number, number, number]
  /** Stored unit quaternion [w, x, y, z] from geometry.jsonl. */
  readonly rotation: readonly [number, number, number, number]
}

export interface EstimatedMapCurve {
  readonly quality: 'estimated'
  readonly unit: 'map-world-unit'
  readonly points: readonly ScenePlanePoint[]
}

/**
 * Samples RoadPilot-Map's documented hermite_stored_length curve model.
 * Coordinates remain explicitly tagged as map-world units; they are not metres.
 */
export function sampleEstimatedMapCurve(
  start: MapCurveNode,
  end: MapCurveNode,
  tangentScale: number,
  segments = 32,
): EstimatedMapCurve {
  if (!Number.isFinite(tangentScale) || tangentScale <= 0) {
    throw new RangeError('tangentScale must be a positive finite number')
  }
  if (!Number.isInteger(segments) || segments < 1 || segments > 1024) {
    throw new RangeError('segments must be an integer between 1 and 1024')
  }

  const p0 = worldPosition(start.position)
  const p1 = worldPosition(end.position)
  const d0 = forwardDirection(start.rotation)
  const d1 = forwardDirection(end.rotation)
  const points: ScenePlanePoint[] = []

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    const x = h00 * p0.x + h10 * tangentScale * d0.x + h01 * p1.x + h11 * tangentScale * d1.x
    const z = h00 * p0.z + h10 * tangentScale * d0.z + h01 * p1.z + h11 * tangentScale * d1.z
    points.push({ point: { x, y: -z + 0 }, unit: 'map-world-unit' })
  }

  return { quality: 'estimated', unit: 'map-world-unit', points }
}

function worldPosition(raw: readonly [number, number, number]) {
  if (!raw.every((value) => Number.isSafeInteger(value))) {
    throw new RangeError('node position must contain safe integer coordinates')
  }
  return {
    x: raw[0] / MAP_POSITION_DIVISOR,
    z: raw[2] / MAP_POSITION_DIVISOR,
  }
}

/** Direction obtained by rotating the documented node-local travel axis (0, 0, -1). */
function forwardDirection(rotation: readonly [number, number, number, number]) {
  if (!rotation.every(Number.isFinite))
    throw new RangeError('node rotation must contain finite numbers')
  const [w, x, y, z] = rotation
  const norm = Math.hypot(w, x, y, z)
  if (Math.abs(norm - 1) > 1e-3) throw new RangeError('node rotation must be a unit quaternion')
  const scale = 2 / (norm * norm)
  return {
    x: -scale * (x * z + w * y),
    z: -(1 - scale * (x * x + y * y)),
  }
}
