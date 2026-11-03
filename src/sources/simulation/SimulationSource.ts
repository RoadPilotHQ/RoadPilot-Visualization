import type { SceneFrame } from '@/domain/scene'
import type { DataSource, SourceInfo, SourceStatus, Unsubscribe } from '../DataSource'
import { PlaybackClock } from '../playback/PlaybackClock'
import type { FrameScheduler } from '../playback/PlaybackClock'
import { HIGHWAY_FOLLOW_DURATION_S, sampleHighwayFollow } from './highwayFollow'

export interface SimulationSourceOptions {
  /** Frame emission rate while playing. Default 30 Hz. */
  readonly frameRateHz?: number
  /** Start playing as soon as the source connects. Default true. */
  readonly autoPlay?: boolean
  readonly scheduler?: FrameScheduler
}

/**
 * Deterministic simulated data source. Produces frames as a pure function of the timeline,
 * so a given time always yields identical data. It never reads from or writes to RoadPilot.
 */
export class SimulationSource implements DataSource {
  readonly info: SourceInfo = {
    id: 'simulation:highway-follow',
    kind: 'simulation',
    label: 'MOCK DATA',
    sceneLabel: 'SIMULATION · HIGHWAY FOLLOW',
  }
  readonly playback: PlaybackClock

  private status: SourceStatus = { state: 'idle', message: null }
  private sequence = 0
  private lastTick: number | null = null
  private lastTimeS: number | null = null
  private unsubscribeClock: Unsubscribe | null = null
  private readonly frameListeners = new Set<(frame: SceneFrame) => void>()
  private readonly statusListeners = new Set<(status: SourceStatus) => void>()
  private readonly frameRateHz: number
  private readonly autoPlay: boolean

  constructor(options: SimulationSourceOptions = {}) {
    this.frameRateHz = options.frameRateHz ?? 30
    this.autoPlay = options.autoPlay ?? true
    this.playback = new PlaybackClock({
      durationS: HIGHWAY_FOLLOW_DURATION_S,
      loop: true,
      ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    })
  }

  getStatus(): SourceStatus {
    return this.status
  }

  subscribeStatus(listener: (status: SourceStatus) => void): Unsubscribe {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  subscribe(listener: (frame: SceneFrame) => void): Unsubscribe {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  connect(): void {
    if (this.unsubscribeClock !== null) return
    this.setStatus({ state: 'connected', message: 'Deterministic simulation' })
    this.unsubscribeClock = this.playback.subscribe((snapshot) => {
      const tick = Math.floor(snapshot.timeS * this.frameRateHz)
      const timeChanged = snapshot.timeS !== this.lastTimeS
      if (timeChanged && (!snapshot.playing || tick !== this.lastTick)) {
        this.emitFrame(snapshot.timeS)
        this.lastTick = tick
      }
      this.lastTimeS = snapshot.timeS
    })
    const initialTimeS = this.playback.getSnapshot().timeS
    this.emitFrame(initialTimeS)
    this.lastTick = Math.floor(initialTimeS * this.frameRateHz)
    this.lastTimeS = initialTimeS
    if (this.autoPlay) this.playback.play()
  }

  disconnect(): void {
    if (this.unsubscribeClock === null) return
    this.playback.pause()
    this.unsubscribeClock()
    this.unsubscribeClock = null
    this.lastTick = null
    this.lastTimeS = null
    this.setStatus({ state: 'closed', message: null })
  }

  private emitFrame(timeS: number): void {
    const frame: SceneFrame = {
      ...sampleHighwayFollow(timeS),
      sequence: this.sequence,
      sourceId: this.info.id,
    }
    this.sequence += 1
    for (const listener of this.frameListeners) listener(frame)
  }

  private setStatus(status: SourceStatus): void {
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }
}
