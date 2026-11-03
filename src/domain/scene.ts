/**
 * Renderer-independent scene model. Everything here is read-only data that describes what
 * RoadPilot (or a simulation) reports. This application never produces driving decisions.
 *
 * Frame: x = east, y = north, metres, seconds, radians (see coordinates.ts).
 */

import type { Vec2 } from './geometry'

export interface EgoState {
  readonly position: Vec2
  /** Radians counter-clockwise from +x (east). */
  readonly headingRad: number
  readonly speedMps: number
  /** Observed road-wheel angle, radians, positive = left. */
  readonly steeringAngleRad: number
  /** Signed path curvature in 1/m, positive = left. */
  readonly curvaturePerM: number
  readonly lengthM: number
  readonly widthM: number
}

export type AgentKind = 'car' | 'truck' | 'bus' | 'motorcycle' | 'pedestrian' | 'unknown'

export interface Agent {
  readonly id: string
  readonly kind: AgentKind
  readonly position: Vec2
  readonly headingRad: number
  readonly speedMps: number
  readonly lengthM: number
  readonly widthM: number
}

export type SignalState = 'red' | 'yellow' | 'green' | 'off' | 'unknown'

export interface TrafficSignal {
  readonly id: string
  readonly position: Vec2
  readonly state: SignalState
  /** Seconds until the state is expected to change, if known. */
  readonly remainingS: number | null
}

export interface Lane {
  readonly id: string
  readonly centerline: readonly Vec2[]
  readonly leftBoundary: readonly Vec2[]
  readonly rightBoundary: readonly Vec2[]
}

export interface TrajectoryPoint {
  readonly position: Vec2
  readonly speedMps: number | null
  readonly curvaturePerM: number | null
}

/** The trajectory as reported by the planner. Display only. */
export interface Trajectory {
  readonly points: readonly TrajectoryPoint[]
}

export type AccState = 'off' | 'standby' | 'active' | 'overridden' | 'fault'

/** Adaptive Cruise Control information as reported by the system. Display only. */
export interface AccInfo {
  readonly state: AccState
  readonly setSpeedMps: number | null
  readonly targetSpeedMps: number | null
  readonly targetGapS: number | null
  readonly leadObjectId: string | null
  readonly leadDistanceM: number | null
}

/** Observed vehicle inputs. These are readings, never commands. */
export interface VehicleInputs {
  /** Normalized steering input; positive = left, matching `steeringAngleRad`. */
  readonly steering: number
  /** 0 to 1 */
  readonly throttle: number
  /** 0 to 1 */
  readonly brake: number
}

export type StatusLevel = 'active' | 'idle' | 'waiting' | 'fault' | 'unknown'

export interface StatusEntry {
  readonly id: string
  readonly label: string
  readonly state: StatusLevel
  /** Short text to display, e.g. "ACTIVE" or "TRACKING". */
  readonly text: string
}

export interface SceneFrame {
  /** Monotonic per source. */
  readonly sequence: number
  /** Seconds on the source's own clock. */
  readonly timestampS: number
  readonly sourceId: string
  readonly ego: EgoState
  readonly agents: readonly Agent[]
  readonly signals: readonly TrafficSignal[]
  readonly lanes: readonly Lane[]
  readonly trajectory: Trajectory | null
  readonly acc: AccInfo | null
  readonly inputs: VehicleInputs | null
  readonly status: readonly StatusEntry[]
}
