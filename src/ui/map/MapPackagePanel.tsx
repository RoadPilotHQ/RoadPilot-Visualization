import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  WheelEvent,
} from 'react'
import type { RoadPilotMapPackageV1 } from '@/domain/mapPackage'
import type { MapNavigationGraph } from '@/domain/mapPackage'
import { findMapGraphSelection } from '@/domain/mapGraphSelection'
import type { MapGraphSelection } from '@/domain/mapGraphSelection'
import type {
  NavigationGraphEdgeDetails,
  NavigationGraphNodeDetails,
  NavigationGraphPathResult,
} from '@/domain/mapNavigationInspection'
import { mapCurveSampleStride } from '@/domain/mapRendering'
import { queryMapCurveSpatialIndex } from '@/domain/mapSpatialIndex'

type MapPackageWorkerResponse =
  | { readonly type: 'loaded'; readonly data: RoadPilotMapPackageV1 }
  | { readonly type: 'error'; readonly message: string }
  | {
      readonly type: 'node-inspected'
      readonly requestId: number
      readonly result: NavigationGraphNodeDetails | null
    }
  | {
      readonly type: 'edge-inspected'
      readonly requestId: number
      readonly result: NavigationGraphEdgeDetails | null
    }
  | {
      readonly type: 'path-inspected'
      readonly requestId: number
      readonly result: NavigationGraphPathResult
    }

type GraphInspectionCommand =
  | { readonly type: 'inspect-node'; readonly id: number }
  | { readonly type: 'inspect-edge'; readonly id: number }
  | {
      readonly type: 'inspect-path'
      readonly from: number
      readonly to: number
      readonly statuses: readonly string[]
    }

type GraphInspectionResult =
  | { readonly type: 'node'; readonly result: NavigationGraphNodeDetails | null }
  | { readonly type: 'edge'; readonly result: NavigationGraphEdgeDetails | null }

export function MapPackagePanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRequestIdRef = useRef<number | null>(null)
  const [data, setData] = useState<RoadPilotMapPackageV1 | null>(null)
  const [status, setStatus] = useState(
    'Choose a local RoadPilot-Map package folder to inspect its road curves.',
  )
  const [error, setError] = useState<string | null>(null)
  const [loadGeneration, setLoadGeneration] = useState(0)
  const [inspectionResult, setInspectionResult] = useState<GraphInspectionResult | null>(null)
  const [pathResult, setPathResult] = useState<NavigationGraphPathResult | null>(null)
  const [inspectionBusy, setInspectionBusy] = useState(false)

  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '')
    const worker = new Worker(new URL('../../sources/map/mapPackage.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<MapPackageWorkerResponse>) => {
      const response = event.data
      if (response.type === 'error') {
        pendingRequestIdRef.current = null
        setInspectionBusy(false)
        setError(response.message)
        setStatus('The package could not be loaded.')
        return
      }
      if (response.type === 'loaded') {
        pendingRequestIdRef.current = null
        setInspectionBusy(false)
        setInspectionResult(null)
        setPathResult(null)
        setData(response.data)
        setLoadGeneration((generation) => generation + 1)
        setError(null)
        setStatus('Package verified and loaded locally.')
        return
      }
      if (response.requestId !== pendingRequestIdRef.current) return
      pendingRequestIdRef.current = null
      setInspectionBusy(false)
      if (response.type === 'node-inspected') {
        setInspectionResult({ type: 'node', result: response.result })
        setPathResult(null)
      } else if (response.type === 'edge-inspected') {
        setInspectionResult({ type: 'edge', result: response.result })
        setPathResult(null)
      } else {
        setPathResult(response.result)
        setInspectionResult(null)
      }
    }
    worker.onerror = () => {
      pendingRequestIdRef.current = null
      setInspectionBusy(false)
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
    setInspectionResult(null)
    setPathResult(null)
    setInspectionBusy(false)
    pendingRequestIdRef.current = null
    requestIdRef.current += 1
    setStatus('Reading and verifying the local package in the background…')
    const request = {
      type: 'load',
      manifest,
      geometry,
      additionalFiles: files.filter((file) => file !== manifest && file !== geometry),
    }
    workerRef.current?.postMessage(request)
  }

  const sendInspectionCommand = (command: GraphInspectionCommand) => {
    const requestId = ++requestIdRef.current
    pendingRequestIdRef.current = requestId
    setInspectionBusy(true)
    setInspectionResult(null)
    setPathResult(null)
    workerRef.current?.postMessage({ ...command, requestId })
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
          {data.navigationGraph && (
            <NavigationGraphExplorer
              graph={data.navigationGraph}
              busy={inspectionBusy}
              result={inspectionResult}
              pathResult={pathResult}
              onInspectNode={(id) => sendInspectionCommand({ type: 'inspect-node', id })}
              onInspectEdge={(id) => sendInspectionCommand({ type: 'inspect-edge', id })}
              onInspectPath={(from, to, statuses) =>
                sendInspectionCommand({ type: 'inspect-path', from, to, statuses })
              }
            />
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

function NavigationGraphExplorer({
  graph,
  busy,
  result,
  pathResult,
  onInspectNode,
  onInspectEdge,
  onInspectPath,
}: {
  graph: MapNavigationGraph
  busy: boolean
  result: GraphInspectionResult | null
  pathResult: NavigationGraphPathResult | null
  onInspectNode: (id: number) => void
  onInspectEdge: (id: number) => void
  onInspectPath: (from: number, to: number, statuses: readonly string[]) => void
}) {
  const [nodeId, setNodeId] = useState('')
  const [edgeId, setEdgeId] = useState('')
  const [pathFrom, setPathFrom] = useState('')
  const [pathTo, setPathTo] = useState('')
  const [statuses, setStatuses] = useState<string[]>([])
  const nodeValue = parseGraphIndex(nodeId, graph.nodeCount)
  const edgeValue = parseGraphIndex(edgeId, graph.edgeCount)
  const fromValue = parseGraphIndex(pathFrom, graph.nodeCount)
  const toValue = parseGraphIndex(pathTo, graph.nodeCount)

  return (
    <section className="map-graph-explorer" aria-labelledby="map-graph-explorer-title">
      <div className="map-graph-view-head">
        <strong id="map-graph-explorer-title">Full graph inspection</strong>
        <span>
          {graph.inspectionAvailable ? 'All exported IDs' : 'Unavailable at this graph size'}
        </span>
      </div>
      {!graph.inspectionAvailable ? (
        <p className="map-graph-limitations">
          Full inspection is disabled above 2 million nodes or 3 million edges. The bounded topology
          sample remains available where positions exist.
        </p>
      ) : (
        <>
          <div className="map-graph-inspect-forms">
            <form
              onSubmit={(event: ReactFormEvent<HTMLFormElement>) => {
                event.preventDefault()
                if (nodeValue !== null) onInspectNode(nodeValue)
              }}
            >
              <label htmlFor="graph-node-id">
                Inspect any graph node ID (0–{Math.max(0, graph.nodeCount - 1).toLocaleString()})
              </label>
              <div>
                <input
                  id="graph-node-id"
                  type="number"
                  min="0"
                  max={graph.nodeCount - 1}
                  step="1"
                  value={nodeId}
                  onChange={(event) => setNodeId(event.currentTarget.value)}
                />
                <button type="submit" disabled={busy || nodeValue === null}>
                  Inspect node
                </button>
              </div>
            </form>
            <form
              onSubmit={(event: ReactFormEvent<HTMLFormElement>) => {
                event.preventDefault()
                if (edgeValue !== null) onInspectEdge(edgeValue)
              }}
            >
              <label htmlFor="graph-edge-id">
                Inspect any graph edge ID (0–{Math.max(0, graph.edgeCount - 1).toLocaleString()})
              </label>
              <div>
                <input
                  id="graph-edge-id"
                  type="number"
                  min="0"
                  max={graph.edgeCount - 1}
                  step="1"
                  value={edgeId}
                  onChange={(event) => setEdgeId(event.currentTarget.value)}
                />
                <button type="submit" disabled={busy || edgeValue === null}>
                  Inspect edge
                </button>
              </div>
            </form>
          </div>
          <form
            className="map-graph-path-form"
            onSubmit={(event: ReactFormEvent<HTMLFormElement>) => {
              event.preventDefault()
              if (fromValue !== null && toValue !== null && statuses.length > 0)
                onInspectPath(fromValue, toValue, statuses)
            }}
          >
            <strong>Inspect a directed graph path</strong>
            <div className="map-graph-path-inputs">
              <label>
                From node ID
                <input
                  type="number"
                  min="0"
                  max={graph.nodeCount - 1}
                  step="1"
                  value={pathFrom}
                  onChange={(event) => setPathFrom(event.currentTarget.value)}
                />
              </label>
              <label>
                To node ID
                <input
                  type="number"
                  min="0"
                  max={graph.nodeCount - 1}
                  step="1"
                  value={pathTo}
                  onChange={(event) => setPathTo(event.currentTarget.value)}
                />
              </label>
              <button
                type="submit"
                disabled={busy || fromValue === null || toValue === null || statuses.length === 0}
              >
                Inspect path
              </button>
            </div>
            <fieldset>
              <legend>Include exported edge statuses</legend>
              {GRAPH_EDGE_STATUSES.map((status) => (
                <label key={status}>
                  <input
                    type="checkbox"
                    checked={statuses.includes(status)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked
                      setStatuses((current) =>
                        checked ? [...current, status] : current.filter((item) => item !== status),
                      )
                    }}
                  />
                  {status}
                </label>
              ))}
            </fieldset>
            <p className="map-graph-limitations">
              This examines directed connectivity in the selected statuses. It is not route guidance
              and does not establish that a path is drivable.
            </p>
          </form>
          {busy && (
            <p className="map-graph-query-result" role="status">
              Inspecting the full graph in the background…
            </p>
          )}
          {result && <GraphInspectionDetails result={result} />}
          {pathResult && <GraphPathDetails result={pathResult} />}
        </>
      )}
    </section>
  )
}

function GraphInspectionDetails({ result }: { result: GraphInspectionResult }) {
  if (!result.result) {
    return (
      <p className="map-graph-query-result" role="status">
        That exported ID is unavailable.
      </p>
    )
  }
  const values: readonly [string, string][] =
    result.type === 'node'
      ? [
          ['Kind', result.result.kind],
          ['Map node UID', `0x${result.result.mapNodeId}`],
          [
            'Position',
            result.result.position
              ? result.result.position.map((value) => value.toFixed(2)).join(', ') +
                ' map units (x, y, z)'
              : 'Unavailable',
          ],
          ...(result.result.ownerId
            ? [
                [
                  result.result.kind.startsWith('lane_') ? 'Road UID' : 'Prefab UID',
                  `0x${result.result.ownerId}`,
                ] as [string, string],
              ]
            : []),
          ...(result.result.side ? [['Side', result.result.side] as [string, string]] : []),
          ...(result.result.index !== null
            ? [['Lane index', String(result.result.index)] as [string, string]]
            : []),
          ...(result.result.arm !== null
            ? [['Prefab arm', String(result.result.arm)] as [string, string]]
            : []),
          ...(result.result.slot !== null
            ? [['Prefab slot', String(result.result.slot)] as [string, string]]
            : []),
        ]
      : [
          ['Evidence status', result.result.status],
          ['Category', result.result.category],
          ['From → to', `${result.result.from} → ${result.result.to}`],
          ['Source UID', `0x${result.result.sourceId}`],
          [
            'Traffic rules',
            result.result.rules.length > 0
              ? result.result.rules
                  .map((rule) => `${rule.name} (${rule.resolved ? 'resolved' : 'unresolved'})`)
                  .join(', ')
              : 'None exported',
          ],
        ]
  return (
    <dl className="map-graph-query-result" aria-live="polite">
      <dt>
        {result.type === 'node'
          ? `Graph node ${result.result.id}`
          : `Graph edge ${result.result.id}`}
      </dt>
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function GraphPathDetails({ result }: { result: NavigationGraphPathResult }) {
  const labels: Record<NavigationGraphPathResult['status'], string> = {
    found: `Found a directed graph chain with ${result.totalEdges.toLocaleString()} edges.`,
    'not-found': 'No directed graph chain exists for the selected statuses.',
    invalid: 'Enter node IDs that exist in this graph.',
    unavailable: 'Full graph inspection is unavailable for this package size.',
  }
  return (
    <div className="map-graph-query-result" aria-live="polite">
      <p>
        <strong>Topology result:</strong> {labels[result.status]} Searched{' '}
        {result.exploredNodes.toLocaleString()} nodes.
      </p>
      {result.status === 'found' && result.steps.length > 0 && (
        <div className="map-graph-path-table-wrap">
          <table className="map-graph-path-table">
            <thead>
              <tr>
                <th>Edge</th>
                <th>From → to</th>
                <th>Status</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {result.steps.map((edge) => (
                <tr key={edge.id}>
                  <td>{edge.id}</td>
                  <td>
                    {edge.from} → {edge.to}
                  </td>
                  <td>{edge.status}</td>
                  <td>{edge.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.truncated && (
            <p>Showing the first {result.steps.length} edges of this graph chain.</p>
          )}
        </div>
      )}
      <p className="map-graph-limitations">A graph chain is not a validated or drivable route.</p>
    </div>
  )
}

function parseGraphIndex(value: string, count: number): number | null {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed < count ? parsed : null
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
