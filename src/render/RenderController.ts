import type { FrameScheduler } from '@/domain/scheduler'
import type { Viewport } from './camera'
import type { RenderInput, Renderer } from './Renderer'

/**
 * Draws on demand, outside of React. Callers invalidate whenever the scene, layers, view or size
 * change; at most one draw happens per animation frame, and it always uses the newest input.
 * Many store updates between two animation frames therefore cost one draw.
 */
export class RenderController {
  private handle: number | null = null
  private disposed = false
  private renderCount = 0

  constructor(
    private readonly renderer: Renderer,
    private readonly getInput: () => RenderInput,
    private readonly scheduler: FrameScheduler,
  ) {}

  /** Number of draws performed so far. */
  get draws(): number {
    return this.renderCount
  }

  invalidate(): void {
    if (this.disposed || this.handle !== null) return
    this.handle = this.scheduler.request(() => {
      this.handle = null
      if (this.disposed) return
      this.renderCount += 1
      this.renderer.render(this.getInput())
    })
  }

  resize(viewport: Viewport, devicePixelRatio: number): void {
    if (this.disposed) return
    this.renderer.resize(viewport, devicePixelRatio)
    this.invalidate()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.handle !== null) this.scheduler.cancel(this.handle)
    this.handle = null
    this.renderer.dispose()
  }
}
