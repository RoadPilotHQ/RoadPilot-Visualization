/**
 * `roadpilot-visualization-frame` schema version 1.
 *
 * The wire format is owned by this repository. See docs/contracts/visualization-frame-v1.md.
 * Rules for readers (implemented here):
 *  - unknown fields are ignored,
 *  - the same major version is required, any minor version is accepted,
 *  - unknown enum values degrade to "unknown" instead of failing the frame.
 */

import { z } from 'zod'
import type {
  AccState,
  Agent,
  AgentKind,
  Lane,
  SceneFrame,
  SignalState,
  StatusLevel,
} from '@/domain/scene'
import type { Vec2 } from '@/domain/geometry'

export const FRAME_FORMAT = 'roadpilot-visualization-frame'
export const FRAME_SCHEMA_MAJOR = 1
export const FRAME_SCHEMA_MINOR = 0
export const FRAME_SCHEMA_V2_MAJOR = 2

/** Builds a schema that maps unknown strings to a fallback value. */
function lenientEnum<const T extends readonly string[]>(values: T, fallback: T[number]) {
  return z.string().transform((v): T[number] => (values.includes(v) ? (v as T[number]) : fallback))
}

const agentKinds = ['car', 'truck', 'bus', 'motorcycle', 'pedestrian', 'unknown'] as const
const signalStates = ['red', 'yellow', 'green', 'off', 'unknown'] as const
const accStates = ['off', 'standby', 'active', 'overridden', 'fault'] as const
const statusLevels = ['active', 'idle', 'waiting', 'fault', 'unknown'] as const

const point = z.object({ x: z.number(), y: z.number() })
const polyline = z.array(point)
const nullableNumber = z
  .number()
  .nullish()
  .transform((v) => v ?? null)

const egoSchema = z.object({
  position: point,
  heading_rad: z.number(),
  speed_mps: z.number(),
  steering_angle_rad: z.number(),
  curvature_per_m: z.number(),
  length_m: z.number().positive(),
  width_m: z.number().positive(),
})

const agentSchema = z.object({
  id: z.string().min(1),
  kind: lenientEnum(agentKinds, 'unknown'),
  position: point,
  heading_rad: z.number(),
  speed_mps: z.number(),
  length_m: z.number().positive(),
  width_m: z.number().positive(),
})

const signalSchema = z.object({
  id: z.string().min(1),
  position: point,
  state: lenientEnum(signalStates, 'unknown'),
  remaining_s: nullableNumber,
})

const laneSchema = z.object({
  id: z.string().min(1),
  centerline: polyline,
  left_boundary: polyline,
  right_boundary: polyline,
})

const trajectorySchema = z.object({
  points: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      speed_mps: nullableNumber,
      curvature_per_m: nullableNumber,
    }),
  ),
})

const accSchema = z.object({
  state: lenientEnum(accStates, 'off'),
  set_speed_mps: nullableNumber,
  target_speed_mps: nullableNumber,
  target_gap_s: nullableNumber,
  lead_object_id: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  lead_distance_m: nullableNumber,
})

const inputsSchema = z.object({
  steering: z.number(),
  throttle: z.number(),
  brake: z.number(),
})

const statusSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  state: lenientEnum(statusLevels, 'unknown'),
  text: z.string(),
})

const versionSchema = z.object({
  major: z.number().int(),
  minor: z.number().int().nonnegative(),
})

const headerSchema = z.object({
  format: z.literal(FRAME_FORMAT),
  schema_version: versionSchema,
})

const frameSchema = z.object({
  format: z.literal(FRAME_FORMAT),
  schema_version: versionSchema,
  source: z.object({ id: z.string().min(1) }),
  sequence: z.number().int().nonnegative(),
  timestamp_s: z.number(),
  ego: egoSchema,
  agents: z.array(agentSchema).default([]),
  signals: z.array(signalSchema).default([]),
  lanes: z.array(laneSchema).default([]),
  trajectory: trajectorySchema.nullish().transform((v) => v ?? null),
  acc: accSchema.nullish().transform((v) => v ?? null),
  inputs: inputsSchema.nullish().transform((v) => v ?? null),
  status: z.array(statusSchema).default([]),
})

const optionalPoint = point.nullable()
const optionalPositiveNumber = z.number().positive().nullable()
const optionalFiniteNumber = z.number().nullable()
const sourceGame = z
  .string()
  .nullish()
  .transform((value): 'ats' | 'ets2' | null => (value === 'ats' || value === 'ets2' ? value : null))

const frameV2Schema = z.object({
  format: z.literal(FRAME_FORMAT),
  schema_version: versionSchema,
  source: z.object({ id: z.string().min(1), game: sourceGame }),
  sequence: z.number().int().nonnegative(),
  timestamp_s: z.number(),
  ego: z.object({
    position: optionalPoint,
    heading_rad: optionalFiniteNumber,
    speed_mps: optionalFiniteNumber,
    steering_angle_rad: optionalFiniteNumber,
    curvature_per_m: optionalFiniteNumber,
    length_m: optionalPositiveNumber,
    width_m: optionalPositiveNumber,
  }),
  agents: z.array(agentSchema).default([]),
  signals: z.array(signalSchema).default([]),
  lanes: z.array(laneSchema).default([]),
  trajectory: trajectorySchema.nullish().transform((v) => v ?? null),
  acc: accSchema.nullish().transform((v) => v ?? null),
  inputs: z
    .object({
      steering: optionalFiniteNumber,
      throttle: optionalFiniteNumber,
      brake: optionalFiniteNumber,
    })
    .nullish()
    .transform((v) => v ?? null),
  status: z.array(statusSchema).default([]),
})

export type ParseResult = { ok: true; frame: SceneFrame } | { ok: false; error: string }

/** Validates either supported major version, including v2's explicitly nullable readings. */
export function parseFrame(input: unknown): ParseResult {
  const header = headerSchema.safeParse(input)
  if (!header.success) return parseFrameV1(input)
  if (header.data.schema_version.major === FRAME_SCHEMA_V2_MAJOR) return parseFrameV2(input)
  return parseFrameV1(input)
}

/** Validates schema 2, where game telemetry may legitimately omit spatial readings. */
export function parseFrameV2(input: unknown): ParseResult {
  const header = headerSchema.safeParse(input)
  if (header.success && header.data.schema_version.major !== FRAME_SCHEMA_V2_MAJOR) {
    return {
      ok: false,
      error: `Unsupported schema major version ${header.data.schema_version.major} (supported: ${FRAME_SCHEMA_V2_MAJOR})`,
    }
  }
  const result = frameV2Schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return { ok: false, error: `Invalid frame: ${path}${issue?.message ?? 'unknown error'}` }
  }
  const w = result.data
  return {
    ok: true,
    frame: {
      sequence: w.sequence,
      timestampS: w.timestamp_s,
      sourceId: w.source.id,
      sourceGame: w.source.game,
      ego: {
        position: w.ego.position,
        headingRad: w.ego.heading_rad,
        speedMps: w.ego.speed_mps,
        steeringAngleRad: w.ego.steering_angle_rad,
        curvaturePerM: w.ego.curvature_per_m,
        lengthM: w.ego.length_m,
        widthM: w.ego.width_m,
      },
      agents: w.agents.map((a): Agent => ({
        id: a.id,
        kind: a.kind as AgentKind,
        position: a.position,
        headingRad: a.heading_rad,
        speedMps: a.speed_mps,
        lengthM: a.length_m,
        widthM: a.width_m,
      })),
      signals: w.signals.map((s) => ({
        id: s.id,
        position: s.position,
        state: s.state as SignalState,
        remainingS: s.remaining_s,
      })),
      lanes: w.lanes.map((l): Lane => ({
        id: l.id,
        centerline: l.centerline,
        leftBoundary: l.left_boundary,
        rightBoundary: l.right_boundary,
      })),
      trajectory: w.trajectory
        ? {
            points: w.trajectory.points.map((p) => ({
              position: { x: p.x, y: p.y },
              speedMps: p.speed_mps,
              curvaturePerM: p.curvature_per_m,
            })),
          }
        : null,
      acc: w.acc
        ? {
            state: w.acc.state as AccState,
            setSpeedMps: w.acc.set_speed_mps,
            targetSpeedMps: w.acc.target_speed_mps,
            targetGapS: w.acc.target_gap_s,
            leadObjectId: w.acc.lead_object_id,
            leadDistanceM: w.acc.lead_distance_m,
          }
        : null,
      inputs: w.inputs,
      status: w.status.map((s) => ({
        id: s.id,
        label: s.label,
        state: s.state as StatusLevel,
        text: s.text,
      })),
    },
  }
}

/** Validates untrusted input and converts it into the domain model. Never throws. */
export function parseFrameV1(input: unknown): ParseResult {
  // Check the version first so that a future major version reports a clear error
  // instead of a field error from a layout this reader does not know.
  const header = headerSchema.safeParse(input)
  if (header.success && header.data.schema_version.major !== FRAME_SCHEMA_MAJOR) {
    return {
      ok: false,
      error: `Unsupported schema major version ${header.data.schema_version.major} (supported: ${FRAME_SCHEMA_MAJOR})`,
    }
  }
  const result = frameSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return { ok: false, error: `Invalid frame: ${path}${issue?.message ?? 'unknown error'}` }
  }
  const w = result.data
  const frame: SceneFrame = {
    sequence: w.sequence,
    timestampS: w.timestamp_s,
    sourceId: w.source.id,
    ego: {
      position: w.ego.position,
      headingRad: w.ego.heading_rad,
      speedMps: w.ego.speed_mps,
      steeringAngleRad: w.ego.steering_angle_rad,
      curvaturePerM: w.ego.curvature_per_m,
      lengthM: w.ego.length_m,
      widthM: w.ego.width_m,
    },
    agents: w.agents.map((a): Agent => ({
      id: a.id,
      kind: a.kind as AgentKind,
      position: a.position,
      headingRad: a.heading_rad,
      speedMps: a.speed_mps,
      lengthM: a.length_m,
      widthM: a.width_m,
    })),
    signals: w.signals.map((s) => ({
      id: s.id,
      position: s.position,
      state: s.state as SignalState,
      remainingS: s.remaining_s,
    })),
    lanes: w.lanes.map((l): Lane => ({
      id: l.id,
      centerline: l.centerline,
      leftBoundary: l.left_boundary,
      rightBoundary: l.right_boundary,
    })),
    trajectory:
      w.trajectory === null
        ? null
        : {
            points: w.trajectory.points.map((p) => ({
              position: { x: p.x, y: p.y },
              speedMps: p.speed_mps,
              curvaturePerM: p.curvature_per_m,
            })),
          },
    acc:
      w.acc === null
        ? null
        : {
            state: w.acc.state as AccState,
            setSpeedMps: w.acc.set_speed_mps,
            targetSpeedMps: w.acc.target_speed_mps,
            targetGapS: w.acc.target_gap_s,
            leadObjectId: w.acc.lead_object_id,
            leadDistanceM: w.acc.lead_distance_m,
          },
    inputs: w.inputs,
    status: w.status.map((s) => ({
      id: s.id,
      label: s.label,
      state: s.state as StatusLevel,
      text: s.text,
    })),
  }
  return { ok: true, frame }
}

const toPoint = (p: Vec2) => ({ x: p.x, y: p.y })
const requiredV1 = <T>(value: T | null, field: string): T => {
  if (value === null)
    throw new Error(`Cannot serialize schema 2 unavailable value as schema 1: ${field}`)
  return value
}

/** Serializes a frame to the wire format, e.g. for recording sessions for later replay. */
export function serializeFrameV1(frame: SceneFrame): Record<string, unknown> {
  return {
    format: FRAME_FORMAT,
    schema_version: { major: FRAME_SCHEMA_MAJOR, minor: FRAME_SCHEMA_MINOR },
    source: { id: frame.sourceId },
    sequence: frame.sequence,
    timestamp_s: frame.timestampS,
    ego: {
      position: toPoint(requiredV1(frame.ego.position, 'ego.position')),
      heading_rad: requiredV1(frame.ego.headingRad, 'ego.headingRad'),
      speed_mps: requiredV1(frame.ego.speedMps, 'ego.speedMps'),
      steering_angle_rad: requiredV1(frame.ego.steeringAngleRad, 'ego.steeringAngleRad'),
      curvature_per_m: requiredV1(frame.ego.curvaturePerM, 'ego.curvaturePerM'),
      length_m: requiredV1(frame.ego.lengthM, 'ego.lengthM'),
      width_m: requiredV1(frame.ego.widthM, 'ego.widthM'),
    },
    agents: frame.agents.map((a) => ({
      id: a.id,
      kind: a.kind,
      position: toPoint(a.position),
      heading_rad: a.headingRad,
      speed_mps: a.speedMps,
      length_m: a.lengthM,
      width_m: a.widthM,
    })),
    signals: frame.signals.map((s) => ({
      id: s.id,
      position: toPoint(s.position),
      state: s.state,
      remaining_s: s.remainingS,
    })),
    lanes: frame.lanes.map((l) => ({
      id: l.id,
      centerline: l.centerline.map(toPoint),
      left_boundary: l.leftBoundary.map(toPoint),
      right_boundary: l.rightBoundary.map(toPoint),
    })),
    trajectory:
      frame.trajectory === null
        ? null
        : {
            points: frame.trajectory.points.map((p) => ({
              x: p.position.x,
              y: p.position.y,
              speed_mps: p.speedMps,
              curvature_per_m: p.curvaturePerM,
            })),
          },
    acc:
      frame.acc === null
        ? null
        : {
            state: frame.acc.state,
            set_speed_mps: frame.acc.setSpeedMps,
            target_speed_mps: frame.acc.targetSpeedMps,
            target_gap_s: frame.acc.targetGapS,
            lead_object_id: frame.acc.leadObjectId,
            lead_distance_m: frame.acc.leadDistanceM,
          },
    inputs:
      frame.inputs === null ||
      frame.inputs.steering === null ||
      frame.inputs.throttle === null ||
      frame.inputs.brake === null
        ? null
        : frame.inputs,
    status: frame.status.map((s) => ({ id: s.id, label: s.label, state: s.state, text: s.text })),
  }
}
