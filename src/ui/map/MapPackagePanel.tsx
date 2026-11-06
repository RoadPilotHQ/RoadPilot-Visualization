import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  WheelEvent,
} from 'react'
import type { RoadPilotMapPackageV1 } from '@/domain/mapPackage'
import { findMapGraphSelection } from '@/domain/mapGraphSelection'
import type { MapGraphSelection } from '@/domain/mapGraphSelection'
import { mapCurveSampleStride } from '@/domain/mapRendering'
import { queryMapCurveSpatialIndex } from '@/domain/mapSpatialIndex'

type MapPackageWorkerResponse =
  | { readonly type: 'loaded'; readonly data: RoadPilotMapPackageV1 }
  | { readonly type: 'error'; readonly message: string }

export function MapPackagePanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const [data, setData] = useState<RoadPilotMapPackageV1 | null>(null)
  const [status, setStatus] = useState(
    'Choose a local RoadPilot-Map package folder to inspect its road curves.',
  )
  const [error, setError] = useState<string | null>(null)
  const [loadGeneration, setLoadGeneration] = useState(0)

  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '')
    const worker = new Worker(new URL('../../sources/map/mapPackage.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<MapPackageWorkerResponse>) => {
      if (event.data.type === 'error') {
        setError(event.data.message)
        setStatus('The package could not be loaded.')
        return
      }
      setData(event.data.data)
      setLoadGeneration((generation) => generation + 1)
      setError(null)
      setStatus('Package verified and loaded locally.')
    }
    worker.onerror = () => {
      setError('The map package reader stopped unexpectedly.')
      setStatus('The package could not be loaded.')
    }
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const onSelectPackage = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    const manifest = files.find((file) => file.name === 'manifest.json')
    const geometry = files.find((file) => file.name === 'geometry.jsonl')
    if (!manifest || !geometry) {
      setError('The selected folder must contain manifest.json and geometry.jsonl.')
      setStatus('Choose a RoadPilot-Map package folder.')
      return
    }
    setError(null)
    setData(null)
    setStatus('Reading and verifying the local package in the background…')
    const request = {
      type: 'load',
      manifest,
      geometry,
      additionalFiles: files.filter((file) => file !== manifest && file !== geometry),
    }
    workerRef.current?.postMessage(request)
  }

  const counts = useMemo(() => {
    if (!data) return null
    return {
      estimated: data.curves.filter((curve) => curve.quality === 'estimated').length,
      unavailable: data.curves.filter((curve) => curve.quality === 'unavailable').length,
      lengthInconsistent: data.curves.filter((curve) => curve.lengthConsistent === false).length,
    }
  }, [data])

  return (
    <section className="panel map-package-panel" aria-labelledby="map-package-title">
      <div className="panel-head">
        <div>
          <h2 id="map-package-title">Offline RoadPilot-Map curves</h2>
          <p>Separate map view · no live driving data or game control</p>
        </div>
        <span className="tag">LOCAL PACKAGE</span>
      </div>
      <div className="map-package-picker">
        <label htmlFor="map-package-folder">RoadPilot-Map package folder</label>
        <input
          ref={inputRef}
          id="map-package-folder"
          type="file"
          multiple
          onChange={onSelectPackage}
          aria-describedby="map-package-status"
        />
        <span id="map-package-status" role="status">
          {status}
        </span>
      </div>
      {error && (
        <p className="map-package-error" role="alert">
          {error}
        </p>
      )}
      {data && counts && (
        <>
          <div className="map-package-summary">
            <span>
              {data.game.toUpperCase()}
              {data.mapName ? ` · ${data.mapName}` : ''}
            </span>
            <span>{data.roadCount.toLocaleString()} roads</span>
            <span>{counts.estimated.toLocaleString()} estimated curves</span>
            <span>{counts.unavailable.toLocaleString()} unavailable</span>
            {counts.lengthInconsistent > 0 && (
              <span>
                {counts.lengthInconsistent.toLocaleString()} length checks outside tolerance
              </span>
            )}
          </div>
          <NavigationGraphSummary graph={data.navigationGraph} />
          {data.navigationGraph && (
            <NavigationGraphCanvas key={loadGeneration} graph={data.navigationGraph} />
          )}
          <MapPackageCanvas key={loadGeneration} data={data} />
          <div className="map-package-legend">
            <span>
              <i className="map-curve-swatch consistent" /> Estimated curve
            </span>
            <span>
              <i className="map-curve-swatch inconsistent" /> Length check outside tolerance
            </span>
          </div>
          <p className="map-package-limitations">
            Curves are estimates, not confirmed game-road shapes. Map units are unconfirmed; lane
            geometry is unavailable. This view is for offline inspection only.
          </p>
        </>
      )}
    </section>
  )
}

function NavigationGraphSummary({ graph }: { graph: RoadPilotMapPackageV1['navigationGraph'] }) {
  return (
    <section className="map-graph-summary" aria-labelledby="map-graph-title">
      <div className="map-graph-head">
        <h3 id="map-graph-title">Navigation graph</h3>
        <span>
          {graph
            ? `Schema ${graph.schemaVersion.major}.${graph.schemaVersion.minor}`
            : 'Not included'}
        </span>
      </div>
      {graph ? (
        <>
          <div className="map-graph-counts">
            <span>{graph.nodeCount.toLocaleString()} graph nodes</span>
            <span>{graph.edgeCount.toLocaleString()} edges</span>
            <span>{graph.issueCount.toLocaleString()} issues</span>
            <span>
              {graph.positionedNodeCount.toLocaleString()} positioned ·{' '}
              {graph.missingPositionCount.toLocaleString()} without position
            </span>
          </div>
          <GraphCountGroup
            title="Edge evidence"
            counts={graph.edgesByStatus}
            includeZeroKeys={['confirmed', 'candidate', 'unknown', 'forbidden']}
          />
          <GraphCountGroup title="Edge categories" counts={graph.edgesByCategory} />
          <GraphCountGroup title="Node kinds" counts={graph.nodesByKind} />
          <GraphCountGroup title="Graph issues" counts={graph.issuesByKind} />
          <GraphListGroup title="Graph limitations" items={graph.limitations} />
          <p className="map-graph-limitations">
            Positions identify map nodes, not lane positions. Edge status describes evidence, not a
            drivable route. No lane geometry is inferred.
          </p>
        </>
      ) : (
        <p className="map-graph-limitations">This package has no navigation.jsonl graph.</p>
      )}
    </section>
  )
}

function GraphCountGroup({
  title,
  counts,
  includeZeroKeys = [],
}: {
  title: string
  counts: Readonly<Record<string, number>>
  includeZeroKeys?: readonly string[]
}) {
  const entries = [...new Set([...includeZeroKeys, ...Object.keys(counts)])]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => [key, counts[key] ?? 0] as const)
  if (entries.length === 0) return null
  return (
    <div className="map-graph-group">
      <strong>{title}</strong>
      <div>
        {entries.map(([name, count]) => (
          <span key={name}>
            {name} · {count.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  )
}

function GraphListGroup({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <div className="map-graph-group">
      <strong>{title}</strong>
      <div>
        {[...items]
          .sort((a, b) => a.localeCompare(b))
          .map((item) => (
            <span key={item}>{item}</span>
          ))}
      </div>
    </div>
  )
}

const GRAPH_NODE_KINDS = ['lane_entry', 'lane_exit', 'prefab_input', 'prefab_output'] as const
const GRAPH_EDGE_STATUSES = ['confirmed', 'candidate', 'unknown', 'forbidden'] as const

function NavigationGraphCanvas({
  graph,
}: {
  graph: NonNullable<RoadPilotMapPackageV1['navigationGraph']>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [selection, setSelection] = useState<MapGraphSelection | null>(null)
  const draggedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const topology = graph.topology
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.fillStyle = '#1d211d'
      ctx.fillRect(0, 0, rect.width, rect.height)
      if (!topology?.bounds || topology.sampledEdgeCount === 0) {
        ctx.fillStyle = '#9ba493'
        ctx.font = '12px "DM Sans", sans-serif'
        ctx.fillText(
          topology
            ? 'No sampled edges have positioned endpoints.'
            : 'Topology sample unavailable for this graph size.',
          16,
          28,
        )
        return
      }
      const { minX, minY, maxX, maxY } = topology.bounds
      const width = Math.max(maxX - minX, 1)
      const height = Math.max(maxY - minY, 1)
      const fit = Math.min((rect.width - 32) / width, (rect.height - 32) / height)
      const scale = Math.max(fit * zoom, 0.000001)
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      const screenX = (x: number) => rect.width / 2 + pan.x + (x - centerX) * scale
      const screenY = (y: number) => rect.height / 2 + pan.y + (y - centerY) * scale
      const colors = ['#65c7f2', '#e9a34c', '#c491f0', '#e56c64']
      ctx.lineWidth = Math.max(0.55, Math.min(1.4, scale * 0.06))
      ctx.globalAlpha = 0.68
      for (let status = 0; status < colors.length; status += 1) {
        ctx.beginPath()
        for (let index = 0; index < topology.edges.length; index += 5) {
          if (topology.edges[index + 3] !== status) continue
          const from = topology.edges[index + 1]! * 2
          const to = topology.edges[index + 2]! * 2
          ctx.moveTo(screenX(topology.positions[from]!), screenY(topology.positions[from + 1]!))
          ctx.lineTo(screenX(topology.positions[to]!), screenY(topology.positions[to + 1]!))
        }
        ctx.strokeStyle = colors[status]!
        ctx.stroke()
      }
      if (selection?.type === 'edge') {
        const edgeOffset = selection.sampleIndex * 5
        const from = topology.edges[edgeOffset + 1]! * 2
        const to = topology.edges[edgeOffset + 2]! * 2
        ctx.beginPath()
        ctx.moveTo(screenX(topology.positions[from]!), screenY(topology.positions[from + 1]!))
        ctx.lineTo(screenX(topology.positions[to]!), screenY(topology.positions[to + 1]!))
        ctx.strokeStyle = '#fff4a8'
        ctx.lineWidth = 3
        ctx.stroke()
      } else if (selection?.type === 'node') {
        const offset = selection.id * 2
        ctx.beginPath()
        ctx.arc(
          screenX(topology.positions[offset]!),
          screenY(topology.positions[offset + 1]!),
          5,
          0,
          Math.PI * 2,
        )
        ctx.fillStyle = '#fff4a8'
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = '#9ba493'
      ctx.font = '10px "DM Mono", monospace'
      ctx.fillText(
        `SCHEMATIC TOPOLOGY · MAP UNITS UNCONFIRMED · ${zoom.toFixed(1)}×`,
        12,
        rect.height - 10,
      )
    }
    let frame: number | null = null
    const scheduleDraw = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        draw()
      })
    }
    const observer = new ResizeObserver(scheduleDraw)
    observer.observe(canvas)
    scheduleDraw()
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [graph, pan, selection, zoom])

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    draggedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) draggedRef.current = true
      setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y })
    }
  }
  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }
  const onCanvasClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setSelection(
      graph.topology
        ? findMapGraphSelection(
            graph.topology,
            rect.width,
            rect.height,
            event.clientX - rect.left,
            event.clientY - rect.top,
            zoom,
            pan,
          )
        : null,
    )
  }
  const onCanvasKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const topology = graph.topology
    if (event.key === 'Escape') {
      setSelection(null)
      return
    }
    if (!topology || topology.sampledEdgeCount === 0) return
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const current = selection?.type === 'edge' ? selection.sampleIndex : -1
    const next =
      event.key === 'ArrowRight'
        ? (current + 1) % topology.sampledEdgeCount
        : current <= 0
          ? topology.sampledEdgeCount - 1
          : current - 1
    setSelection({ type: 'edge', sampleIndex: next })
  }

  return (
    <div className="map-graph-view" aria-label="Navigation graph topology view">
      <div className="map-graph-view-head">
        <strong>Sampled graph topology</strong>
        {graph.topology && (
          <span>
            {graph.topology.sampledEdgeCount.toLocaleString()} of {graph.edgeCount.toLocaleString()}{' '}
            edges
          </span>
        )}
      </div>
      <div className="map-graph-viewport">
        <canvas
          ref={canvasRef}
          className="map-package-canvas"
          role="application"
          tabIndex={0}
          aria-label="Sampled navigation graph topology from map-node positions; click a visible endpoint or connection for details, or focus this canvas and use left and right arrow keys to select sampled edges. Not lane geometry or a drivable route. Drag to pan and scroll to zoom."
          onClick={onCanvasClick}
          onKeyDown={onCanvasKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={(event: WheelEvent<HTMLCanvasElement>) => {
            event.preventDefault()
            setZoom((current) =>
              Math.max(0.25, Math.min(128, current * Math.exp(-event.deltaY * 0.001))),
            )
          }}
        />
        <div className="map-package-controls" role="toolbar" aria-label="Graph map controls">
          <button type="button" onClick={() => setZoom((current) => Math.min(128, current * 1.5))}>
            +
          </button>
          <button type="button" onClick={() => setZoom((current) => Math.max(0.25, current / 1.5))}>
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
          >
            Fit
          </button>
        </div>
      </div>
      <div className="map-graph-legend">
        <span>
          <i className="graph-edge-swatch confirmed" />
          Confirmed
        </span>
        <span>
          <i className="graph-edge-swatch candidate" />
          Candidate
        </span>
        <span>
          <i className="graph-edge-swatch unknown" />
          Unknown
        </span>
        <span>
          <i className="graph-edge-swatch forbidden" />
          Forbidden
        </span>
      </div>
      <GraphSelectionDetails
        graph={graph}
        selection={selection}
        onClear={() => setSelection(null)}
      />
      <p className="map-graph-limitations">
        Schematic sample of connections between map-node positions. Lines are not lane geometry,
        validated routes, or drivable-road shapes. Map units are unconfirmed.
      </p>
    </div>
  )
}

function GraphSelectionDetails({
  graph,
  selection,
  onClear,
}: {
  graph: NonNullable<RoadPilotMapPackageV1['navigationGraph']>
  selection: MapGraphSelection | null
  onClear: () => void
}) {
  const topology = graph.topology
  let details: { title: string; values: readonly [string, string][] } | null = null
  if (topology && selection?.type === 'node') {
    const offset = selection.id * 2
    const kind = GRAPH_NODE_KINDS[topology.nodeKinds[selection.id] ?? 255] ?? 'unknown'
    details = {
      title: `Graph node ${selection.id}`,
      values: [
        ['Kind', kind],
        [
          'Map-node position',
          `${topology.positions[offset]!.toFixed(2)}, ${topology.positions[offset + 1]!.toFixed(2)} map units (x, z)`,
        ],
      ],
    }
  } else if (topology && selection?.type === 'edge') {
    const offset = selection.sampleIndex * 5
    const edgeId = topology.edges[offset]!
    const from = topology.edges[offset + 1]!
    const to = topology.edges[offset + 2]!
    const status = GRAPH_EDGE_STATUSES[topology.edges[offset + 3]!] ?? 'unknown'
    const category = topology.categories[topology.edges[offset + 4]!] ?? 'unknown'
    const fromKind = GRAPH_NODE_KINDS[topology.nodeKinds[from] ?? 255] ?? 'unknown'
    const toKind = GRAPH_NODE_KINDS[topology.nodeKinds[to] ?? 255] ?? 'unknown'
    details = {
      title: `Graph edge ${edgeId}`,
      values: [
        ['Evidence status', status],
        ['Category', category],
        ['From → to', `${from} (${fromKind}) → ${to} (${toKind})`],
        ['Source UID', `0x${topology.edgeSources[selection.sampleIndex]}`],
      ],
    }
  }

  return (
    <section className="map-graph-selection" aria-live="polite" aria-label="Selected graph item">
      {details ? (
        <>
          <div className="map-graph-selection-head">
            <strong>{details.title}</strong>
            <button type="button" onClick={onClear}>
              Clear selection
            </button>
          </div>
          <dl>
            {details.values.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p>
          Click a visible sampled node or edge to inspect it. Only the displayed sample can be
          selected.
        </p>
      )}
    </section>
  )
}

function MapPackageCanvas({ data }: { data: RoadPilotMapPackageV1 }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.fillStyle = '#1d211d'
      ctx.fillRect(0, 0, rect.width, rect.height)
      if (!data.bounds || data.coordinates.length === 0) {
        ctx.fillStyle = '#9ba493'
        ctx.font = '13px "DM Sans", sans-serif'
        ctx.fillText('No estimated road curves are available in this package.', 20, 32)
        return
      }

      const width = Math.max(data.bounds.maxX - data.bounds.minX, 1)
      const height = Math.max(data.bounds.maxY - data.bounds.minY, 1)
      const fit = Math.min((rect.width - 40) / width, (rect.height - 40) / height)
      const scale = Math.max(fit * zoom, 0.000001)
      const centerX = (data.bounds.minX + data.bounds.maxX) / 2
      const centerY = (data.bounds.minY + data.bounds.maxY) / 2
      const screenX = (x: number) => rect.width / 2 + pan.x + (x - centerX) * scale
      const screenY = (y: number) => rect.height / 2 + pan.y + (y - centerY) * scale
      const viewport = {
        minX: centerX + (-rect.width / 2 - pan.x) / scale,
        minY: centerY + (-rect.height / 2 - pan.y) / scale,
        maxX: centerX + (rect.width / 2 - pan.x) / scale,
        maxY: centerY + (rect.height / 2 - pan.y) / scale,
      }
      const visibleCurveIndices = queryMapCurveSpatialIndex(data.spatialIndex, viewport)

      ctx.globalAlpha = 0.72
      ctx.lineWidth = Math.max(0.45, Math.min(1.5, scale * 0.08))
      const stride = mapCurveSampleStride(scale)
      for (const inconsistent of [false, true]) {
        ctx.beginPath()
        for (const curveIndex of visibleCurveIndices) {
          const curve = data.curves[curveIndex]!
          if (
            curve.quality !== 'estimated' ||
            curve.pointCount < 2 ||
            (curve.lengthConsistent === false) !== inconsistent
          ) {
            continue
          }
          for (let i = 0; i < curve.pointCount; i += stride) {
            const index = curve.coordinateOffset + i * 2
            const x = screenX(data.coordinates[index]!)
            const y = screenY(data.coordinates[index + 1]!)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          if ((curve.pointCount - 1) % stride !== 0) {
            const index = curve.coordinateOffset + (curve.pointCount - 1) * 2
            ctx.lineTo(screenX(data.coordinates[index]!), screenY(data.coordinates[index + 1]!))
          }
        }
        ctx.strokeStyle = inconsistent ? '#e9a34c' : '#72d59b'
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = '#9ba493'
      ctx.font = '10px "DM Mono", monospace'
      ctx.fillText(`MAP UNITS · ${zoom.toFixed(1)}×`, 14, rect.height - 12)
    }

    let frame: number | null = null
    const scheduleDraw = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        draw()
      })
    }
    const observer = new ResizeObserver(scheduleDraw)
    observer.observe(canvas)
    scheduleDraw()
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [data, pan, zoom])

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y })
  }

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    setZoom((current) => Math.max(0.25, Math.min(128, current * Math.exp(-event.deltaY * 0.001))))
  }

  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return (
    <div className="map-package-viewport">
      <canvas
        ref={canvasRef}
        className="map-package-canvas"
        role="img"
        aria-label="Offline map showing estimated RoadPilot-Map road curves. Drag to pan and scroll to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      />
      <div className="map-package-controls" role="toolbar" aria-label="Map controls">
        <button type="button" onClick={() => setZoom((current) => Math.min(128, current * 1.5))}>
          +
        </button>
        <button type="button" onClick={() => setZoom((current) => Math.max(0.25, current / 1.5))}>
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          Fit
        </button>
      </div>
    </div>
  )
}
