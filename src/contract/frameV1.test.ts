import { describe, expect, it } from 'vitest'
import { parseFrameV1 } from './frameV1'

const minimalWire = () => ({
  format: 'roadpilot-visualization-frame',
  schema_version: { major: 1, minor: 0 },
  source: { id: 'live' },
  sequence: 1,
  timestamp_s: 0.5,
  ego: {
    position: { x: 1, y: 2 },
    heading_rad: 0,
    speed_mps: 10,
    steering_angle_rad: 0,
    curvature_per_m: 0,
    length_m: 7,
    width_m: 2.5,
  },
})

describe('roadpilot-visualization-frame v1', () => {
  it('accepts a minimal frame and fills defaults', () => {
    const result = parseFrameV1(minimalWire())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.frame.agents).toEqual([])
    expect(result.frame.lanes).toEqual([])
    expect(result.frame.trajectory).toBeNull()
    expect(result.frame.acc).toBeNull()
    expect(result.frame.inputs).toBeNull()
  })

  it('ignores unknown fields and accepts newer minor versions', () => {
    const wire = { ...minimalWire(), schema_version: { major: 1, minor: 7 }, future_field: [1, 2] }
    expect(parseFrameV1(wire).ok).toBe(true)
  })

  it('rejects a different major version with a clear message', () => {
    const result = parseFrameV1({ ...minimalWire(), schema_version: { major: 2, minor: 0 } })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('major version 2') })
  })

  it('rejects a major version it cannot read even if the layout differs', () => {
    const result = parseFrameV1({
      format: 'roadpilot-visualization-frame',
      schema_version: { major: 2, minor: 0 },
      something_else: true,
    })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('major version 2') })
  })

  it('degrades unknown enum values to "unknown" instead of failing', () => {
    const wire = {
      ...minimalWire(),
      agents: [
        {
          id: 'a',
          kind: 'hovercraft',
          position: { x: 0, y: 0 },
          heading_rad: 0,
          speed_mps: 0,
          length_m: 3,
          width_m: 2,
        },
      ],
      signals: [{ id: 's', position: { x: 0, y: 0 }, state: 'flashing-blue' }],
    }
    const result = parseFrameV1(wire)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.frame.agents[0]?.kind).toBe('unknown')
    expect(result.frame.signals[0]).toMatchObject({ state: 'unknown', remainingS: null })
  })

  it('returns errors instead of throwing for invalid input', () => {
    expect(parseFrameV1(null).ok).toBe(false)
    expect(parseFrameV1('text').ok).toBe(false)
    expect(parseFrameV1({}).ok).toBe(false)
    const bad = minimalWire()
    bad.ego.speed_mps = Number.NaN
    expect(parseFrameV1(bad).ok).toBe(false)
    const result = parseFrameV1({ ...minimalWire(), ego: { ...minimalWire().ego, length_m: -1 } })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('ego.length_m') })
  })
})
