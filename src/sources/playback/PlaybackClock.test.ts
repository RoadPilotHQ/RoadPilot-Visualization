import { describe, expect, it } from 'vitest'
import { PlaybackClock } from './PlaybackClock'
import type { FrameScheduler } from './PlaybackClock'

/** Scheduler driven by hand: `step(ms)` runs the pending callback at a fake time. */
class ManualScheduler implements FrameScheduler {
  private callback: ((nowMs: number) => void) | null = null
  private nowMs = 0
  request(callback: (nowMs: number) => void): number {
    this.callback = callback
    return 1
  }
  cancel(): void {
    this.callback = null
  }
  step(ms: number): void {
    this.nowMs += ms
    const cb = this.callback
    this.callback = null
    cb?.(this.nowMs)
  }
  get pending(): boolean {
    return this.callback !== null
  }
}

describe('PlaybackClock', () => {
  it('advances while playing and honours the rate', () => {
    const scheduler = new ManualScheduler()
    const clock = new PlaybackClock({ durationS: 60, loop: true, scheduler })
    clock.setRate(2)
    clock.play()
    scheduler.step(0) // establishes the time base
    scheduler.step(100)
    scheduler.step(100)
    expect(clock.getSnapshot().timeS).toBeCloseTo(0.4)
  })

  it('stops scheduling when paused', () => {
    const scheduler = new ManualScheduler()
    const clock = new PlaybackClock({ durationS: 60, loop: true, scheduler })
    clock.play()
    expect(scheduler.pending).toBe(true)
    clock.pause()
    expect(scheduler.pending).toBe(false)
    expect(clock.getSnapshot().playing).toBe(false)
  })

  it('wraps around when looping', () => {
    const clock = new PlaybackClock({ durationS: 10, loop: true, scheduler: new ManualScheduler() })
    clock.seek(9.9)
    clock.advance(0.2)
    expect(clock.getSnapshot().timeS).toBeCloseTo(0.1)
  })

  it('stops at the end when not looping', () => {
    const scheduler = new ManualScheduler()
    const clock = new PlaybackClock({ durationS: 1, loop: false, scheduler })
    clock.play()
    clock.advance(0.2)
    clock.seek(0.9)
    clock.advance(0.2)
    expect(clock.getSnapshot()).toMatchObject({ timeS: 1, playing: false })
  })

  it('clamps seeks and limits very large steps', () => {
    const clock = new PlaybackClock({
      durationS: 10,
      loop: false,
      scheduler: new ManualScheduler(),
    })
    clock.seek(-5)
    expect(clock.getSnapshot().timeS).toBe(0)
    clock.seek(99)
    expect(clock.getSnapshot().timeS).toBe(10)
    clock.seek(0)
    clock.advance(30)
    expect(clock.getSnapshot().timeS).toBeCloseTo(0.25)
  })

  it('ignores invalid rates and notifies listeners', () => {
    const clock = new PlaybackClock({
      durationS: null,
      loop: false,
      scheduler: new ManualScheduler(),
    })
    const seen: number[] = []
    clock.subscribe((s) => seen.push(s.rate))
    clock.setRate(0)
    clock.setRate(Number.NaN)
    clock.setRate(2)
    expect(seen).toEqual([2])
  })
})
