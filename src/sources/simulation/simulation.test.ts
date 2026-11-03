import { describe, expect, it } from 'vitest'
import { distance } from '@/domain/geometry'
import type { SceneFrame } from '@/domain/scene'
import { HIGHWAY_FOLLOW_DURATION_S, sampleHighwayFollow } from './highwayFollow'
import { SimulationSource } from './SimulationSource'
import { roadCurvature, roadPose } from './road'

describe('road', () => {
  it('starts north-facing with a gentle right bend', () => {
    expect(roadPose(0).heading).toBeCloseTo(Math.PI / 2)
    expect(roadPose(0).position.x).toBeCloseTo(12458.2)
    expect(roadCurvature(0)).toBeCloseTo(-0.0024)
  })

  it('turns right (decreasing heading) in the bend', () => {
    expect(roadPose(400).heading).toBeLessThan(roadPose(0).heading)
    expect(roadCurvature(400)).toBeLessThan(0)
  })
})

describe('highway-follow scenario', () => {
  it('is deterministic', () => {
    expect(sampleHighwayFollow(12.345)).toEqual(sampleHighwayFollow(12.345))
  })

  it('matches the prototype start values', () => {
    const f = sampleHighwayFollow(0)
    expect(f.ego.speedMps * 3.6).toBeCloseTo(72.4, 1)
    expect(f.acc?.leadDistanceM).toBeCloseTo(46.8, 1)
    expect(f.signals.some((s) => s.state === 'red')).toBe(true)
  })

  it('produces finite, sane values over the whole timeline', () => {
    for (let t = 0; t <= HIGHWAY_FOLLOW_DURATION_S; t += 0.5) {
      const f = sampleHighwayFollow(t)
      const numbers = [
        f.ego.position.x,
        f.ego.position.y,
        f.ego.headingRad,
        f.ego.speedMps,
        f.ego.steeringAngleRad,
        f.ego.curvaturePerM,
        f.inputs?.throttle ?? 0,
      ]
      expect(numbers.every(Number.isFinite)).toBe(true)
      expect(f.inputs?.throttle).toBeGreaterThanOrEqual(0)
      expect(f.inputs?.throttle).toBeLessThanOrEqual(1)
      expect(f.acc?.leadDistanceM).toBeGreaterThan(30)
      expect(f.lanes).toHaveLength(2)
    }
  })

  it('keeps the ego vehicle in its lane and the lead vehicle ahead', () => {
    for (let t = 0; t < HIGHWAY_FOLLOW_DURATION_S; t += 3) {
      const f = sampleHighwayFollow(t)
      const lane = f.lanes.find((l) => l.id === 'lane-right')!
      const nearest = Math.min(...lane.centerline.map((p) => distance(p, f.ego.position)))
      expect(nearest).toBeLessThan(0.5)
      const lead = f.agents.find((a) => a.id === 'truck-0018')!
      expect(distance(lead.position, f.ego.position)).toBeGreaterThan(40)
    }
  })

  it('reports right-hand curvature and steering as negative values', () => {
    const f = sampleHighwayFollow(20)
    expect(f.ego.curvaturePerM).toBeLessThan(0)
    expect(f.ego.steeringAngleRad).toBeLessThan(0)
    expect(f.inputs?.steering).toBeLessThan(0)
  })
})

describe('SimulationSource', () => {
  const manualScheduler = () => {
    let cb: ((nowMs: number) => void) | null = null
    return {
      request: (c: (nowMs: number) => void) => {
        cb = c
        return 1
      },
      cancel: () => {
        cb = null
      },
      run: (nowMs: number) => {
        const c = cb
        cb = null
        c?.(nowMs)
      },
    }
  }

  it('emits an initial frame on connect and monotonically increasing sequences', () => {
    const scheduler = manualScheduler()
    const source = new SimulationSource({ scheduler })
    const frames: SceneFrame[] = []
    source.subscribe((f) => frames.push(f))
    source.connect()
    expect(source.getStatus().state).toBe('connected')
    expect(frames).toHaveLength(1)
    scheduler.run(0)
    for (let i = 1; i <= 10; i += 1) scheduler.run(i * 34)
    expect(frames.length).toBeGreaterThan(5)
    const sequences = frames.map((f) => f.sequence)
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b))
    expect(new Set(sequences).size).toBe(sequences.length)
    source.disconnect()
    expect(source.getStatus().state).toBe('closed')
  })

  it('emits a frame when seeking while paused', () => {
    const source = new SimulationSource({ autoPlay: false, scheduler: manualScheduler() })
    const frames: SceneFrame[] = []
    source.subscribe((f) => frames.push(f))
    source.connect()
    source.playback.seek(30)
    expect(frames.at(-1)?.timestampS).toBe(30)
    expect(frames.at(-1)).toMatchObject({ ...sampleHighwayFollow(30), sequence: 1 })
  })

  it('connect and disconnect are idempotent', () => {
    const source = new SimulationSource({ autoPlay: false, scheduler: manualScheduler() })
    const frames: SceneFrame[] = []
    source.subscribe((f) => frames.push(f))
    source.connect()
    source.connect()
    expect(frames).toHaveLength(1)
    source.disconnect()
    source.disconnect()
    expect(source.getStatus().state).toBe('closed')
  })
})
