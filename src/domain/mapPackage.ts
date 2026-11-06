/** Read-only map-package view data. Coordinates are map units, never metres. */
export interface MapRoadCurve {
  readonly id: string
  readonly quality: 'estimated' | 'unavailable'
  /** Offset into `coordinates`, in Float32 values (x/y pairs). */
  readonly coordinateOffset: number
  readonly pointCount: number
  readonly bounds: MapPackageBounds | null
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
  readonly spatialIndex: MapCurveSpatialIndex
  readonly navigationGraph: MapNavigationGraphSummary | null
}

export interface MapCurveSpatialIndex {
  readonly cellSize: number
  readonly cells: Readonly<Record<string, readonly number[]>>
  readonly overflowCurveIndices: readonly number[]
}

export interface MapNavigationGraphSummary {
  readonly schemaVersion: { readonly major: 1; readonly minor: number }
  readonly nodeCount: number
  readonly edgeCount: number
  readonly issueCount: number
  readonly positionedNodeCount: number
  readonly missingPositionCount: number
  readonly limitations: readonly string[]
  readonly nodesByKind: Readonly<Record<string, number>>
  readonly edgesByStatus: Readonly<Record<string, number>>
  readonly edgesByCategory: Readonly<Record<string, number>>
  readonly issuesByKind: Readonly<Record<string, number>>
}
