import type { LayerVisibility } from '@/domain/layers'
import type { SceneFrame } from '@/domain/scene'
import type { Viewport } from './camera'
import type { ViewState } from './view'

/** Everything a renderer needs to draw one picture. Renderers hold no scene state of their own. */
export interface RenderInput {
  /** The frame to draw, or null before the first frame has arrived. */
  readonly frame: SceneFrame | null
  readonly layers: LayerVisibility
  readonly view: ViewState
  /** Text for the scene label overlay, e.g. "SIMULATION · HIGHWAY FOLLOW". */
  readonly sceneLabel: string
}

/**
 * A drawing backend (Canvas 2D now, Three.js later). It only reads the scene model; it has no
 * way to produce driving decisions or to send anything to RoadPilot.
 */
export interface Renderer {
  /** Sets the drawing area in CSS pixels and the device pixel ratio. */
  resize(viewport: Viewport, devicePixelRatio: number): void
  /** Draws the input. Must not retain or mutate it. */
  render(input: RenderInput): void
  dispose(): void
}
