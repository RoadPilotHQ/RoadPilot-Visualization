import type { Vec2 } from '@/domain/geometry'
import { radToDeg } from '@/domain/coordinates'

/**
 * Renderer-independent top-down camera. The world point `center` is shown at the screen
 * position `anchor`, rotated so that `headingRad` points up on screen.
 * Screen space has the origin at the top-left with y pointing down (pixels).
 */
export interface Camera {
  readonly center: Vec2
  /** World direction (radians CCW from east) that points up on screen. */
  readonly headingRad: number
  readonly pixelsPerMetre: number
  /** Screen position (pixels) of `center`. */
  readonly anchor: Vec2
}

/** Size of the drawing area in CSS pixels. */
export interface Viewport {
  readonly width: number
  readonly height: number
}

/**
 * Where the camera centre sits on screen, as a fraction of the viewport. It is placed low so
 * that more of the road ahead is visible.
 */
export const ANCHOR_FRACTION: Vec2 = { x: 0.5, y: 0.85 }

export function anchorFor(viewport: Viewport): Vec2 {
  return { x: viewport.width * ANCHOR_FRACTION.x, y: viewport.height * ANCHOR_FRACTION.y }
}

export function worldToScreen(camera: Camera, p: Vec2): Vec2 {
  const dx = p.x - camera.center.x
  const dy = p.y - camera.center.y
  const forward = dx * Math.cos(camera.headingRad) + dy * Math.sin(camera.headingRad)
  const right = dx * Math.sin(camera.headingRad) - dy * Math.cos(camera.headingRad)
  return {
    x: camera.anchor.x + right * camera.pixelsPerMetre,
    y: camera.anchor.y - forward * camera.pixelsPerMetre,
  }
}

/** Inverse of `worldToScreen`. */
export function screenToWorld(camera: Camera, s: Vec2): Vec2 {
  const right = (s.x - camera.anchor.x) / camera.pixelsPerMetre
  const forward = (camera.anchor.y - s.y) / camera.pixelsPerMetre
  const cos = Math.cos(camera.headingRad)
  const sin = Math.sin(camera.headingRad)
  return {
    x: camera.center.x + forward * cos + right * sin,
    y: camera.center.y + forward * sin - right * cos,
  }
}

/** Clockwise rotation in degrees (as used by SVG/CSS/canvas) for an object with a world heading. */
export function screenRotationDeg(camera: Camera, headingRad: number): number {
  return -radToDeg(headingRad - camera.headingRad)
}
