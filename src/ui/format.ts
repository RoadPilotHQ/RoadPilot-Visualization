/** Text formatting helpers for the UI. Presentation only. */

import { headingToCompassDeg } from '@/domain/coordinates'

export const NO_VALUE = '—'

export function fixed(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? NO_VALUE
    : value.toFixed(digits)
}

export function signed(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(digits)}`
}

export function compass(headingRad: number): string {
  return `${headingToCompassDeg(headingRad).toFixed(1).padStart(5, '0')}°`
}

export function curvatureText(curvaturePerM: number | null): string {
  if (curvaturePerM === null) return 'No curvature reading'
  const magnitude = Math.abs(curvaturePerM)
  if (magnitude < 0.0002) return 'Straight'
  const strength = magnitude < 0.004 ? 'Gentle' : magnitude < 0.01 ? 'Moderate' : 'Tight'
  return `${strength} ${curvaturePerM < 0 ? 'right' : 'left'} bend`
}

export function laneOffsetText(offsetM: number | null): string {
  if (offsetM === null) return 'No lane data'
  if (Math.abs(offsetM) < 0.05) return 'Centred'
  return offsetM > 0 ? 'Left of lane centre' : 'Right of lane centre'
}

export function formatClock(timeS: number): string {
  const total = Math.max(0, Math.floor(timeS))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
