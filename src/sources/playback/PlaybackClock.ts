import { browserScheduler } from '@/domain/scheduler'
import type { FrameScheduler } from '@/domain/scheduler'

export interface PlaybackSnapshot {
  /** Current position on the timeline in seconds. */
  readonly timeS: number
  readonly playing: boolean
  /** Playback speed multiplier, e.g. 0.5, 1, 2. */
  readonly rate: number
  /** Length of the timeline, or null for an open-ended timeline. */
  readonly durationS: number | null
}

/** Controls exposed to the UI. */
export interface PlaybackControl {
  getSnapshot(): PlaybackSnapshot
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void
  play(): void
  pause(): void
  seek(timeS: number): void
  setRate(rate: number): void
}

export type { FrameScheduler }

export interface PlaybackClockOptions {
  readonly durationS: number | null
  /** When true and a duration is set, time wraps around at the end. */
  readonly loop: boolean
  readonly scheduler?: FrameScheduler
}

/** The longest wall-clock step applied in one tick, to avoid jumps after tab suspension. */
const MAX_STEP_S = 0.25

export class PlaybackClock implements PlaybackControl {
  private timeS = 0
  private playing = false
  private rate = 1
  private handle: number | null = null
  private lastNowMs: number | null = null
  private readonly listeners = new Set<(snapshot: PlaybackSnapshot) => void>()
  private readonly durationS: number | null
  private readonly loop: boolean
  private readonly scheduler: FrameScheduler

  constructor(options: PlaybackClockOptions) {
    this.durationS = options.durationS
    this.loop = options.loop
    this.scheduler = options.scheduler ?? browserScheduler
  }

  getSnapshot(): PlaybackSnapshot {
    return { timeS: this.timeS, playing: this.playing, rate: this.rate, durationS: this.durationS }
  }

  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  play(): void {
    if (this.playing) return
    this.playing = true
    this.lastNowMs = null
    this.schedule()
    this.emit()
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.cancel()
    this.emit()
  }

  seek(timeS: number): void {
    this.timeS = this.clampTime(timeS)
    this.emit()
  }

  setRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return
    this.rate = rate
    this.emit()
  }

  /** Advances the timeline by a wall-clock step in seconds. Public for tests and manual driving. */
  advance(wallDtS: number): void {
    const dt = Math.min(Math.max(wallDtS, 0), MAX_STEP_S) * this.rate
    this.timeS = this.clampTime(this.timeS + dt)
    if (!this.loop && this.durationS !== null && this.timeS >= this.durationS && this.playing) {
      this.playing = false
      this.cancel()
    }
    this.emit()
  }

  dispose(): void {
    this.playing = false
    this.cancel()
    this.listeners.clear()
  }

  private clampTime(timeS: number): number {
    if (this.durationS === null) return Math.max(0, timeS)
    if (this.loop) {
      const wrapped = timeS % this.durationS
      return wrapped < 0 ? wrapped + this.durationS : wrapped
    }
    return Math.min(Math.max(0, timeS), this.durationS)
  }

  private schedule(): void {
    this.handle = this.scheduler.request((nowMs) => {
      this.handle = null
      if (!this.playing) return
      if (this.lastNowMs !== null) this.advance((nowMs - this.lastNowMs) / 1000)
      this.lastNowMs = nowMs
      if (this.playing) this.schedule()
    })
  }

  private cancel(): void {
    if (this.handle !== null) this.scheduler.cancel(this.handle)
    this.handle = null
    this.lastNowMs = null
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
