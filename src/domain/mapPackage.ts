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
  readonly navigationGraph: MapNavigationGraph | null
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

export interface MapNavigationGraph extends MapNavigationGraphSummary {
  readonly topology: MapNavigationTopology | null
  readonly inspectionAvailable: boolean
}

export interface MapNavigationTopology {
  /** Packed x/z map-world coordinate pairs for graph nodes; missing positions are NaN. */
  readonly positions: Float64Array
  /** Node kind codes: lane_entry, lane_exit, prefab_input, prefab_output. */
  readonly nodeKinds: Uint8Array
  /** Packed edge id/from/to/status-code/category-code records for a deterministic sample. */
  readonly edges: Uint32Array
  readonly categories: readonly string[]
  readonly edgeSources: readonly string[]
  readonly sampleStride: number
  readonly sampledEdgeCount: number
  readonly bounds: MapPackageBounds | null
}
