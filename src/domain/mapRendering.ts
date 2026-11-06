/** Simplifies sampled curves as they approach sub-pixel scale. */
export function mapCurveSampleStride(pixelsPerMapUnit: number): number {
  if (!Number.isFinite(pixelsPerMapUnit) || pixelsPerMapUnit <= 0) {
    throw new RangeError('pixelsPerMapUnit must be a positive finite number')
  }

  if (pixelsPerMapUnit < 0.005) return 32
  if (pixelsPerMapUnit < 0.02) return 8
  if (pixelsPerMapUnit < 0.1) return 4
  if (pixelsPerMapUnit < 1) return 2
  return 1
}
