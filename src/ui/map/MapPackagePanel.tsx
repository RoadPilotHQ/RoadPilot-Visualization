import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent, WheelEvent } from 'react'
import type { RoadPilotMapPackageV1 } from '@/domain/mapPackage'
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
      const stride = scale < 0.2 ? 4 : scale < 1 ? 2 : 1
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
