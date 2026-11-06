/** Read-only map-package view data. Coordinates are map units, never metres. */
export interface MapRoadCurve {
  readonly id: string
  readonly quality: 'estimated' | 'unavailable'
  /** Offset into `coordinates`, in Float32 values (x/y pairs). */
  readonly coordinateOffset: number
  readonly pointCount: number
  readonly unavailableReason: string | null
  readonly lengthConsistent: boolean | null
}

export interface MapPackageBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface RoadPilotMapPackageV1 {
  readonly game: 'ats' | 'ets2'
  readonly mapName: string | null
  readonly schemaVersion: { readonly major: 1; readonly minor: number }
  readonly contentRevision: number
  readonly roadCount: number
  readonly coordinateUnit: 'map-world-unit'
  readonly bounds: MapPackageBounds | null
  /** Packed scene-plane x/y pairs, separate from metre-based simulation frames. */
  readonly coordinates: Float32Array
  readonly curves: readonly MapRoadCurve[]
}
