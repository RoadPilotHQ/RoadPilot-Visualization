/** Pure derived values for display. These only describe data; they never decide anything. */

import { mpsToKmh } from './coordinates'
import { polylineLength, projectOnPolyline } from './geometry'
import type { PolylineProjection } from './geometry'
import type { Agent, SceneFrame } from './scene'

export const egoSpeedKmh = (frame: SceneFrame): number => mpsToKmh(frame.ego.speedMps)

/**
 * Signed lateral offset of the ego vehicle from the centre line of the nearest lane, in metres
 * (positive = left of the lane centre). Null when no lane is available.
 */
export function laneOffsetM(frame: SceneFrame): number | null {
  let best: PolylineProjection | null = null
  for (const lane of frame.lanes) {
    const projection = projectOnPolyline(lane.centerline, frame.ego.position)
    if (projection !== null && (best === null || projection.distance < best.distance)) {
      best = projection
    }
  }
  return best === null ? null : best.lateralOffset
}

/** Length of the reported trajectory in metres, or null when there is none. */
export function lookaheadM(frame: SceneFrame): number | null {
  if (frame.trajectory === null || frame.trajectory.points.length < 2) return null
  return polylineLength(frame.trajectory.points.map((p) => p.position))
}

export function leadAgent(frame: SceneFrame): Agent | null {
  const id = frame.acc?.leadObjectId
  if (id === null || id === undefined) return null
  return frame.agents.find((agent) => agent.id === id) ?? null
}
