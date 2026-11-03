import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { browserScheduler } from '@/domain/scheduler'
import { Canvas2DRenderer } from '@/render/canvas2d/Canvas2DRenderer'
import { RenderController } from '@/render/RenderController'
import { sceneStore } from '@/state/sceneStore'
import { SceneToolbar } from './SceneToolbar'
import { createSceneViewStore, ZOOM_STEP } from './viewStore'

/** Pointer movement in CSS pixels before a press becomes a drag (so clicks do not unfollow). */
const DRAG_THRESHOLD_PX = 3
/** Zoom per wheel delta unit (one 100 px wheel notch is about 1.16x). */
const WHEEL_SENSITIVITY = 0.0015

/**
 * Canvas 2D view of the scene. Drawing happens outside React: scene, layer and view changes only
 * invalidate a render controller, which draws at most once per animation frame. React re-renders
 * only the toolbar, and only when the zoom level or camera mode changes.
 */
export function CanvasSceneView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewStore] = useState(() =>
    createSceneViewStore(() => sceneStore.getState().frame?.ego ?? null),
  )
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const controller = new RenderController(
      new Canvas2DRenderer(canvas, ctx),
      () => {
        const scene = sceneStore.getState()
        return {
          frame: scene.frame,
          layers: scene.layers,
          sceneLabel: scene.source?.sceneLabel ?? '',
          view: viewStore.getState().view,
        }
      },
      browserScheduler,
    )
    const offScene = sceneStore.subscribe(() => controller.invalidate())
    const offView = viewStore.subscribe(() => controller.invalidate())

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const viewport = { width: entry.contentRect.width, height: entry.contentRect.height }
      viewStore.getState().setViewport(viewport)
      controller.resize(viewport, window.devicePixelRatio || 1)
    })
    observer.observe(canvas)

    // Wheel zoom needs a non-passive listener so the page does not scroll at the same time.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      viewStore.getState().zoom(Math.exp(-event.deltaY * WHEEL_SENSITIVITY), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // Web fonts load asynchronously; redraw once they are available.
    void document.fonts?.ready.then(() => controller.invalidate())
    controller.invalidate()

    return () => {
      canvas.removeEventListener('wheel', onWheel)
      observer.disconnect()
      offScene()
      offView()
      controller.dispose()
    }
  }, [viewStore])

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const dx = event.clientX - d.x
    const dy = event.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    d.moved = true
    d.x = event.clientX
    d.y = event.clientY
    viewStore.getState().pan(dx, dy)
  }
  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null
  }
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const { zoom, follow, reset } = viewStore.getState()
    if (event.key === '+' || event.key === '=') zoom(ZOOM_STEP, null)
    else if (event.key === '-') zoom(1 / ZOOM_STEP, null)
    else if (event.key === 'f' || event.key === 'F') follow()
    else if (event.key === '0') reset()
    else return
    event.preventDefault()
  }

  return (
    <div className="scene-viewport">
      <canvas
        ref={canvasRef}
        className="road-scene"
        tabIndex={0}
        role="img"
        aria-label="Top-down road scene with lanes, vehicles, traffic lights and planned trajectory. Drag to pan, scroll to zoom, press F to follow the ego vehicle."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => viewStore.getState().reset()}
        onKeyDown={onKeyDown}
      />
      <SceneToolbar store={viewStore} />
    </div>
  )
}
