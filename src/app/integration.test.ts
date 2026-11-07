import { describe, expect, it } from 'vitest'
import { parseFrameV1, serializeFrameV1 } from '@/contract/frame'
import type { SceneFrame } from '@/domain/scene'
import { laneOffsetM, leadAgent, lookaheadM } from '@/domain/selectors'
import { sampleHighwayFollow } from '@/sources/simulation/highwayFollow'

const base: SceneFrame = { ...sampleHighwayFollow(0), sequence: 0, sourceId: 'test' }

describe('selectors', () => {
  it('derives the lane offset configured in the scenario', () => {
    expect(laneOffsetM(base)).toBeCloseTo(0.18, 1)
  })

  it('returns null without lanes', () => {
    expect(laneOffsetM({ ...base, lanes: [] })).toBeNull()
  })

  it('finds the lead agent and measures the lookahead', () => {
    expect(leadAgent(base)?.id).toBe('truck-0018')
    expect(leadAgent({ ...base, acc: null })).toBeNull()
    expect(lookaheadM(base)).toBeCloseTo(38, 0)
    expect(lookaheadM({ ...base, trajectory: null })).toBeNull()
  })
})

describe('wire format with simulated data', () => {
  it('round-trips full frames through JSON', () => {
    for (const t of [0, 7.5, 33.3, 59.9]) {
      const frame: SceneFrame = { ...sampleHighwayFollow(t), sequence: 42, sourceId: 'test-source' }
      const wire = JSON.parse(JSON.stringify(serializeFrameV1(frame)))
      expect(parseFrameV1(wire)).toEqual({ ok: true, frame })
    }
  })
})
