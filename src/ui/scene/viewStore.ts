import { createStore } from 'zustand'
import type { StoreApi } from 'zustand'
import type { Vec2 } from '@/domain/geometry'
import type { EgoState } from '@/domain/scene'
import type { Viewport } from '@/render/camera'
import { DEFAULT_VIEW, followView, panView, resetView, zoomView } from '@/render/view'
import type { ViewState } from '@/render/view'

/** Zoom factor of the toolbar buttons and of one keyboard step. */
export const ZOOM_STEP = 1.25

export interface SceneViewStore {
  readonly view: ViewState
  readonly viewport: Viewport
  setViewport(viewport: Viewport): void
  /** Drag by screen pixels; switches to free mode. */
  pan(dxPx: number, dyPx: number): void
  /** Zoom by a factor; `cursor` is a screen position in CSS pixels, or null for the anchor. */
  zoom(factor: number, cursor: Vec2 | null): void
  follow(): void
  reset(): void
}

export type SceneViewStoreApi = StoreApi<SceneViewStore>

/**
 * Pan/zoom/follow state of one scene view. It is a local store, separate from the scene store,
 * so that dragging does not re-render React components. `getEgo` supplies the latest ego vehicle.
 */
export function createSceneViewStore(getEgo: () => EgoState | null): SceneViewStoreApi {
  return createStore<SceneViewStore>()((set, get) => ({
    view: DEFAULT_VIEW,
    viewport: { width: 0, height: 0 },
    setViewport: (viewport) => set({ viewport }),
    pan: (dxPx, dyPx) => {
      const { view, viewport } = get()
      set({ view: panView(view, dxPx, dyPx, getEgo(), viewport) })
    },
    zoom: (factor, cursor) => {
      const { view, viewport } = get()
      set({ view: zoomView(view, factor, cursor, getEgo(), viewport) })
    },
    follow: () => set((s) => ({ view: followView(s.view) })),
    reset: () => set({ view: resetView() }),
  }))
}
