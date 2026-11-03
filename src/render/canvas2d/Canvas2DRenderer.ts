import type { Viewport } from '../camera'
import type { RenderInput, Renderer } from '../Renderer'
import { resolveCamera } from '../view'
import { DEFAULT_PAINTERS } from './painters'
import type { Painter } from './painters'

/** The part of an HTMLCanvasElement the renderer needs (also satisfied by test doubles). */
export interface CanvasSurface {
  width: number
  height: number
}

/**
 * Canvas 2D implementation of `Renderer`. Draws one picture per `render` call from the layers'
 * painters, in order, skipping layers that are switched off. It keeps no scene state.
 */
export class Canvas2DRenderer implements Renderer {
  private viewport: Viewport = { width: 0, height: 0 }
  private pixelRatio = 1

  constructor(
    private readonly surface: CanvasSurface,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly painters: readonly Painter[] = DEFAULT_PAINTERS,
  ) {}

  resize(viewport: Viewport, devicePixelRatio: number): void {
    this.viewport = viewport
    this.pixelRatio = devicePixelRatio > 0 ? devicePixelRatio : 1
    this.surface.width = Math.max(1, Math.round(viewport.width * this.pixelRatio))
    this.surface.height = Math.max(1, Math.round(viewport.height * this.pixelRatio))
  }

  render(input: RenderInput): void {
    const { ctx, viewport } = this
    if (viewport.width <= 0 || viewport.height <= 0) return
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    ctx.clearRect(0, 0, viewport.width, viewport.height)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, viewport.width, viewport.height)
    ctx.clip()
    const camera = resolveCamera(input.view, input.frame?.ego ?? null, viewport)
    const scene = {
      frame: input.frame,
      camera,
      viewport,
      layers: input.layers,
      sceneLabel: input.sceneLabel,
    }
    for (const painter of this.painters) {
      if (painter.layer !== null && !input.layers[painter.layer]) continue
      ctx.save()
      painter.paint(ctx, scene)
      ctx.restore()
    }
    ctx.restore()
  }

  dispose(): void {
    // Nothing to release: the canvas is owned by the caller.
  }
}
