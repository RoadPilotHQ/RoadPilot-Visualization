/**
 * Central place for every coordinate and unit conversion.
 *
 * Two coordinate systems exist in this application:
 *
 * 1. Scene frame (used by SceneFrame, rendering and all panels)
 *    - x = east, y = north, units = METRES, heading in radians counter-clockwise from +x.
 *    - This is the frame defined by the `roadpilot-visualization-frame` contract.
 *
 * 2. RoadPilot-Map world frame
 *    - Axes: x = east, y = up, z = south (confirmed by RoadPilot-Map).
 *    - Positions are stored as integers; dividing by 256 yields the "world unit".
 *    - The physical size of one world unit is NOT CONFIRMED (RoadPilot-Map open question G2).
 *      It must not be assumed to be one metre.
 *
 * Because of (2), map data is only converted through `mapWorldToScenePlane`, which keeps
 * track of the unit. Until the scale is confirmed, converted points are tagged
 * `map-world-unit` and consumers must not present them as metres.
 * When the scale is confirmed, change `MAP_UNIT_SCALE` here and nowhere else.
 */

import type { Vec2 } from './geometry'

/** Divisor applied to raw integer map positions to obtain world units. */
export const MAP_POSITION_DIVISOR = 256

export interface MapUnitScale {
  /** Metres per map world unit, or null while unconfirmed. */
  readonly metresPerUnit: number | null
  readonly status: 'confirmed' | 'unconfirmed'
}

/** UNCONFIRMED. See RoadPilot-Map open question G2. Do not guess a value here. */
export const MAP_UNIT_SCALE: MapUnitScale = { metresPerUnit: null, status: 'unconfirmed' }

/** A position in the RoadPilot-Map world frame, already divided by MAP_POSITION_DIVISOR. */
export interface MapWorldPoint {
  readonly x: number // east
  readonly y: number // up
  readonly z: number // south
}

export type ScenePointUnit = 'metre' | 'map-world-unit'

export interface ScenePlanePoint {
  readonly point: Vec2
  /** `map-world-unit` means the physical scale is unknown and the point is NOT in metres. */
  readonly unit: ScenePointUnit
}

export function mapRawToWorld(raw: number): number {
  return raw / MAP_POSITION_DIVISOR
}

/**
 * Converts a map world point to the scene plane (x east, y north).
 * Height (map y) is dropped; map z points south, so scene y = -map z.
 */
export function mapWorldToScenePlane(
  p: MapWorldPoint,
  scale: MapUnitScale = MAP_UNIT_SCALE,
): ScenePlanePoint {
  // `+ 0` normalizes -0 to 0.
  if (scale.metresPerUnit === null) {
    return { point: { x: p.x, y: -p.z + 0 }, unit: 'map-world-unit' }
  }
  const k = scale.metresPerUnit
  return { point: { x: p.x * k, y: -p.z * k + 0 }, unit: 'metre' }
}

// --- Display conversions (scene frame, metres) -------------------------------------------

export const mpsToKmh = (mps: number): number => mps * 3.6
export const kmhToMps = (kmh: number): number => kmh / 3.6
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI

/** Converts a scene heading (radians CCW from east) to a compass bearing in degrees [0, 360). */
export function headingToCompassDeg(headingRad: number): number {
  const deg = 90 - radToDeg(headingRad)
  return ((deg % 360) + 360) % 360
}
