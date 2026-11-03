import type { SceneFrame } from '@/domain/scene'
import type { PlaybackControl } from './playback/PlaybackClock'

export type SourceKind = 'simulation' | 'replay' | 'live'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'stale' | 'error' | 'closed'

export interface SourceStatus {
  readonly state: ConnectionState
  readonly message: string | null
}

/** Static description of a source, shown in the UI. */
export interface SourceInfo {
  readonly id: string
  readonly kind: SourceKind
  /** Short label, e.g. "SIMULATOR" or "MOCK DATA". */
  readonly label: string
  /** Text describing the scene, shown as an overlay, e.g. "SIMULATION · ETS2 SCENE". */
  readonly sceneLabel: string
}

export type Unsubscribe = () => void

/**
 * A producer of scene frames. Sources are strictly read-only with respect to the vehicle:
 * the interface has no way to send commands back to RoadPilot.
 */
export interface DataSource {
  readonly info: SourceInfo
  /** Present for sources with a controllable timeline (simulation, replay). */
  readonly playback: PlaybackControl | null
  getStatus(): SourceStatus
  subscribeStatus(listener: (status: SourceStatus) => void): Unsubscribe
  subscribe(listener: (frame: SceneFrame) => void): Unsubscribe
  /** Starts producing frames. Idempotent. */
  connect(): void
  /** Stops producing frames and releases resources. Idempotent. */
  disconnect(): void
}
