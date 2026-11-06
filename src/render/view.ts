import type { Vec2 } from '@/domain/geometry'
import type { EgoState } from '@/domain/scene'
import { anchorFor, screenToWorld } from './camera'
import type { Camera, Viewport } from './camera'

/**
 * User-controlled view of the scene (pan, zoom, follow). Pure data plus pure functions, so it
 * can be tested and reused by any renderer.
 *
 * - `follow`: the camera is centred on the ego vehicle and rotated so its heading points up.
 * - `free`: the camera is fixed in the world at `center` with the frozen `headingRad`. Panning
 *   switches to this mode; the ego vehicle then moves across the screen.
 */

export const ZOOM_MIN = 2 // pixels per metre
export const ZOOM_MAX = 60
export const ZOOM_DEFAULT = 9

export type ViewMode = 'follow' | 'free'

export interface ViewState {
  readonly mode: ViewMode
  /** World point shown at the screen anchor. Used in `free` mode only. */
  readonly center: Vec2
  /** World direction pointing up on screen. Used in `free` mode only. */
  readonly headingRad: number
  readonly pixelsPerMetre: number
}

export const DEFAULT_VIEW: ViewState = {
  mode: 'follow',
  center: { x: 0, y: 0 },
  headingRad: Math.PI / 2,
  pixelsPerMetre: ZOOM_DEFAULT,
}

export function clampZoom(pixelsPerMetre: number): number {
  if (!Number.isFinite(pixelsPerMetre)) return ZOOM_DEFAULT
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pixelsPerMetre))
}

/** Resolves the camera for a view. Without an ego vehicle, follow mode keeps the last centre. */
export function resolveCamera(view: ViewState, ego: EgoState | null, viewport: Viewport): Camera {
  const anchor = anchorFor(viewport)
  const pixelsPerMetre = clampZoom(view.pixelsPerMetre)
  if (
    view.mode === 'follow' &&
    ego?.position !== null &&
    ego?.position !== undefined &&
    ego.headingRad !== null
  ) {
    return { center: ego.position, headingRad: ego.headingRad, pixelsPerMetre, anchor }
  }
  return { center: view.center, headingRad: view.headingRad, pixelsPerMetre, anchor }
}

/**
 * Zooms by a factor (> 1 zooms in), limited to [ZOOM_MIN, ZOOM_MAX].
 * In `free` mode with a cursor position, the world point under the cursor stays fixed.
 * In `follow` mode the zoom is about the ego vehicle and the cursor is ignored.
 */
export function zoomView(
  view: ViewState,
  factor: number,
  cursor: Vec2 | null,
  ego: EgoState | null,
  viewport: Viewport,
): ViewState {
  if (!Number.isFinite(factor) || factor <= 0) return view
  const pixelsPerMetre = clampZoom(view.pixelsPerMetre * factor)
  if (view.mode === 'follow' || cursor === null) return { ...view, pixelsPerMetre }
  const before = resolveCamera(view, ego, viewport)
  const underCursor = screenToWorld(before, cursor)
  const after: Camera = { ...before, pixelsPerMetre }
  const shifted = screenToWorld(after, cursor)
  return {
    ...view,
    pixelsPerMetre,
    center: {
      x: before.center.x + (underCursor.x - shifted.x),
      y: before.center.y + (underCursor.y - shifted.y),
    },
  }
}

/**
 * Pans by a drag of (dxPx, dyPx) screen pixels: the scene follows the pointer. Switches to
 * `free` mode and freezes the current camera heading.
 */
export function panView(
  view: ViewState,
  dxPx: number,
  dyPx: number,
  ego: EgoState | null,
  viewport: Viewport,
): ViewState {
  if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) return view
  const camera = resolveCamera(view, ego, viewport)
  const center = screenToWorld(camera, {
    x: camera.anchor.x - dxPx,
    y: camera.anchor.y - dyPx,
  })
  return {
    mode: 'free',
    center,
    headingRad: camera.headingRad,
    pixelsPerMetre: camera.pixelsPerMetre,
  }
}

/** Returns to follow mode, keeping the zoom level. */
export function followView(view: ViewState): ViewState {
  return view.mode === 'follow' ? view : { ...view, mode: 'follow' }
}

/** Follow mode with the default zoom. */
export function resetView(): ViewState {
  return DEFAULT_VIEW
}
