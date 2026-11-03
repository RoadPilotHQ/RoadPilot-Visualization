import { kmhToMps } from '@/domain/coordinates'
import type { Vec2 } from '@/domain/geometry'
import type {
  Agent,
  Lane,
  SceneFrame,
  SignalState,
  StatusEntry,
  TrafficSignal,
  TrajectoryPoint,
} from '@/domain/scene'
import { ROAD_START_S, roadCurvature, roadPoint, roadPose } from './road'

/**
 * "Highway follow": the ego truck follows a lead truck on a gently curving two-lane road.
 *
 * Everything in this file is mock input data. The scenario describes what a perception and
 * planning stack might report; it does not make any driving decision of its own, and the ego
 * vehicle does not react to the traffic lights (they are scenery with a fixed cycle).
 */

export const HIGHWAY_FOLLOW_DURATION_S = 60

const LANE_WIDTH_M = 3.5
const EGO_LANE_CENTER = -LANE_WIDTH_M / 2 // right lane
const LEFT_LANE_CENTER = LANE_WIDTH_M / 2
const EGO = { lengthM: 7.5, widthM: 2.55 }
const LEAD = { lengthM: 12, widthM: 2.55 }
const CAR = { lengthM: 4.5, widthM: 1.9 }
const WHEELBASE_M = 5
const MAX_STEER_RAD = 0.6
const BASE_SPEED_MPS = kmhToMps(72.4)
const SET_SPEED_MPS = kmhToMps(80)
const VIEW_BEHIND_M = 40
const VIEW_AHEAD_M = 130
const LANE_SAMPLE_M = 2
const TRAJECTORY_LENGTH_M = 38
const TRAJECTORY_STEP_M = 2

const TWO_PI = 2 * Math.PI
const SPEED_AMPLITUDE = 0.6
const SPEED_PERIOD_S = 20

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const smoothstep = (t: number) => {
  const c = clamp(t, 0, 1)
  return c * c * (3 - 2 * c)
}

/** Arc length of the ego vehicle at time t (integral of the speed profile). */
function egoArcLength(t: number): number {
  return (
    BASE_SPEED_MPS * t +
    ((SPEED_AMPLITUDE * SPEED_PERIOD_S) / TWO_PI) * (1 - Math.cos((TWO_PI * t) / SPEED_PERIOD_S))
  )
}

const egoSpeed = (t: number) =>
  BASE_SPEED_MPS + SPEED_AMPLITUDE * Math.sin((TWO_PI * t) / SPEED_PERIOD_S)
const egoAcceleration = (t: number) =>
  ((SPEED_AMPLITUDE * TWO_PI) / SPEED_PERIOD_S) * Math.cos((TWO_PI * t) / SPEED_PERIOD_S)

/** Lateral offset of the ego vehicle from its lane centre (positive = left). */
const laneOffset = (t: number) => 0.18 + 0.1 * Math.sin((TWO_PI * t) / 9)
const laneOffsetRate = (t: number) => ((0.1 * TWO_PI) / 9) * Math.cos((TWO_PI * t) / 9)

function laneSet(sEgo: number): Lane[] {
  const s0 = Math.max(ROAD_START_S, sEgo - VIEW_BEHIND_M)
  const s1 = sEgo + VIEW_AHEAD_M
  const line = (lateral: number): Vec2[] => {
    const points: Vec2[] = []
    for (let s = s0; s <= s1; s += LANE_SAMPLE_M) points.push(roadPoint(s, lateral))
    return points
  }
  const half = LANE_WIDTH_M / 2
  return [
    {
      id: 'lane-left',
      centerline: line(LEFT_LANE_CENTER),
      leftBoundary: line(LEFT_LANE_CENTER + half),
      rightBoundary: line(LEFT_LANE_CENTER - half),
    },
    {
      id: 'lane-right',
      centerline: line(EGO_LANE_CENTER),
      leftBoundary: line(EGO_LANE_CENTER + half),
      rightBoundary: line(EGO_LANE_CENTER - half),
    },
  ]
}

interface SignalSite {
  readonly id: string
  readonly s: number
  readonly phaseOffsetS: number
}

const SIGNAL_SITES: readonly SignalSite[] = [
  { id: 'signal-1', s: 38, phaseOffsetS: 48 },
  { id: 'signal-2', s: 450, phaseOffsetS: 10 },
  { id: 'signal-3', s: 840, phaseOffsetS: 70 },
]

const SIGNAL_CYCLE_S = 90
const GREEN_END_S = 40
const YELLOW_END_S = 44

function signalAt(site: SignalSite, t: number): TrafficSignal {
  const phase = (t + site.phaseOffsetS) % SIGNAL_CYCLE_S
  let state: SignalState
  let remainingS: number
  if (phase < GREEN_END_S) {
    state = 'green'
    remainingS = GREEN_END_S - phase
  } else if (phase < YELLOW_END_S) {
    state = 'yellow'
    remainingS = YELLOW_END_S - phase
  } else {
    state = 'red'
    remainingS = SIGNAL_CYCLE_S - phase
  }
  return { id: site.id, position: roadPoint(site.s, -(LANE_WIDTH_M + 2.5)), state, remainingS }
}

function statusFor(signals: readonly TrafficSignal[], sEgo: number): StatusEntry[] {
  const ahead = SIGNAL_SITES.filter((site) => site.s > sEgo && site.s - sEgo < 100)
  const blocking = ahead.some((site) => {
    const signal = signals.find((s) => s.id === site.id)
    return signal !== undefined && (signal.state === 'red' || signal.state === 'yellow')
  })
  return [
    { id: 'path-planner', label: 'Path planner', state: 'active', text: 'ACTIVE' },
    { id: 'lane-keeping', label: 'Lane keeping', state: 'active', text: 'TRACKING' },
    {
      id: 'traffic-handling',
      label: 'Traffic handling',
      state: blocking ? 'waiting' : 'idle',
      text: blocking ? 'WAITING' : 'CLEAR',
    },
  ]
}

/** Samples the scenario at `timeS`. Pure and deterministic. */
export function sampleHighwayFollow(timeS: number): Omit<SceneFrame, 'sequence' | 'sourceId'> {
  const t = timeS
  const sEgo = egoArcLength(t)
  const vEgo = egoSpeed(t)
  const accel = egoAcceleration(t)
  const lateralEgo = EGO_LANE_CENTER + laneOffset(t)

  const pose = roadPose(sEgo)
  const yaw = Math.atan2(laneOffsetRate(t), vEgo)
  const curvature = roadCurvature(sEgo)
  const steeringAngle = Math.atan(WHEELBASE_M * curvature)

  const ego = {
    position: roadPoint(sEgo, lateralEgo),
    headingRad: pose.heading + yaw,
    speedMps: vEgo,
    steeringAngleRad: steeringAngle,
    curvaturePerM: curvature,
    lengthM: EGO.lengthM,
    widthM: EGO.widthM,
  }

  // Lead truck in the ego lane. The reported gap is bumper to bumper.
  const gapPhase = (TWO_PI * t) / 40
  const gapM = 46.8 + 4 * Math.sin(gapPhase)
  const gapRate = 4 * (TWO_PI / 40) * Math.cos(gapPhase)
  const sLead = sEgo + gapM + EGO.lengthM / 2 + LEAD.lengthM / 2
  const leadPose = roadPose(sLead)
  const lead: Agent = {
    id: 'truck-0018',
    kind: 'truck',
    position: roadPoint(sLead, EGO_LANE_CENTER),
    headingRad: leadPose.heading,
    speedMps: vEgo + gapRate,
    lengthM: LEAD.lengthM,
    widthM: LEAD.widthM,
  }

  // A passenger car in the left lane, drifting back and forth relative to the ego vehicle.
  const carPhase = (TWO_PI * t) / 60
  const sCar = sEgo + 18 + 14 * Math.sin(carPhase)
  const car: Agent = {
    id: 'car-0021',
    kind: 'car',
    position: roadPoint(sCar, LEFT_LANE_CENTER),
    headingRad: roadPose(sCar).heading,
    speedMps: vEgo + 14 * (TWO_PI / 60) * Math.cos(carPhase),
    lengthM: CAR.lengthM,
    widthM: CAR.widthM,
  }

  const signals = SIGNAL_SITES.filter(
    (site) => site.s > sEgo - 20 && site.s < sEgo + VIEW_AHEAD_M,
  ).map((site) => signalAt(site, t))
  const allSignals = SIGNAL_SITES.map((site) => signalAt(site, t))

  const trajectoryPoints: TrajectoryPoint[] = []
  for (let d = 0; d <= TRAJECTORY_LENGTH_M + 1e-9; d += TRAJECTORY_STEP_M) {
    const blend = smoothstep(d / 30)
    const lateral = lateralEgo + (EGO_LANE_CENTER - lateralEgo) * blend
    trajectoryPoints.push({
      position: roadPoint(sEgo + d, lateral),
      speedMps: vEgo,
      curvaturePerM: roadCurvature(sEgo + d),
    })
  }

  const throttle = clamp(0.4 + 0.8 * accel, 0, 1)

  return {
    timestampS: t,
    ego,
    agents: [lead, car],
    signals,
    lanes: laneSet(sEgo),
    trajectory: { points: trajectoryPoints },
    acc: {
      state: 'active',
      setSpeedMps: SET_SPEED_MPS,
      targetSpeedMps: SET_SPEED_MPS,
      targetGapS: 2,
      leadObjectId: lead.id,
      leadDistanceM: gapM,
    },
    inputs: {
      steering: clamp(steeringAngle / MAX_STEER_RAD, -1, 1),
      throttle,
      brake: 0,
    },
    status: statusFor(allSignals, sEgo),
  }
}
