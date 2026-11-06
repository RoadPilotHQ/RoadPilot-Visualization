import type { MapCurveSpatialIndex, MapPackageBounds, MapRoadCurve } from './mapPackage'

const MAX_CELLS_PER_CURVE = 4096
const MAX_INDEX_MEMBERSHIPS = 4_000_000
const MAX_QUERY_CELLS = 4096

/** Builds the same world-unit uniform grid described by RoadPilot-Map schema 1. */
export function buildMapCurveSpatialIndex(
  curves: readonly MapRoadCurve[],
  cellSize: number,
): MapCurveSpatialIndex {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError('cellSize must be a positive finite number')
  }

  const cells: Record<string, number[]> = Object.create(null) as Record<string, number[]>
  const overflowCurveIndices: number[] = []
  let memberships = 0
  let fullIndex = true

  curves.forEach((curve, curveIndex) => {
    if (curve.quality !== 'estimated' || !curve.bounds) return
    validateBounds(curve.bounds)
    const { minX, minY, maxX, maxY } = curve.bounds
    const x0 = Math.floor(minX / cellSize)
    const y0 = Math.floor(minY / cellSize)
    const x1 = Math.floor(maxX / cellSize)
    const y1 = Math.floor(maxY / cellSize)
    const cellCount = (x1 - x0 + 1) * (y1 - y0 + 1)
    if (!Number.isSafeInteger(cellCount) || cellCount < 1 || cellCount > MAX_CELLS_PER_CURVE) {
      overflowCurveIndices.push(curveIndex)
      return
    }
    if (!fullIndex || memberships + cellCount > MAX_INDEX_MEMBERSHIPS) {
      fullIndex = false
      overflowCurveIndices.push(curveIndex)
      return
    }

    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const key = cellKey(x, y)
        ;(cells[key] ??= []).push(curveIndex)
      }
    }
    memberships += cellCount
  })

  return { cellSize, cells, overflowCurveIndices }
}

/** Returns candidate curves whose estimated bounds intersect a viewport. */
export function queryMapCurveSpatialIndex(
  index: MapCurveSpatialIndex,
  viewport: MapPackageBounds,
): number[] {
  validateBounds(viewport)
  const x0 = Math.floor(viewport.minX / index.cellSize)
  const y0 = Math.floor(viewport.minY / index.cellSize)
  const x1 = Math.floor(viewport.maxX / index.cellSize)
  const y1 = Math.floor(viewport.maxY / index.cellSize)
  const cellCount = (x1 - x0 + 1) * (y1 - y0 + 1)
  const candidates = new Set<number>(index.overflowCurveIndices)

  if (!Number.isSafeInteger(cellCount) || cellCount > MAX_QUERY_CELLS) {
    for (const curveIndices of Object.values(index.cells)) {
      for (const curveIndex of curveIndices) candidates.add(curveIndex)
    }
  } else {
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (const curveIndex of index.cells[cellKey(x, y)] ?? []) candidates.add(curveIndex)
      }
    }
  }

  return [...candidates].sort((a, b) => a - b)
}

function cellKey(x: number, y: number) {
  return `${x},${y}`
}

function validateBounds(bounds: MapPackageBounds) {
  const values = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
  if (!values.every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new RangeError('viewport bounds must be finite and ordered')
  }
}
