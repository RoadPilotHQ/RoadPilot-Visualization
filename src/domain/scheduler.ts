/**
 * Abstraction over requestAnimationFrame so that timelines and render loops can be driven
 * manually in tests. The browser implementation only touches the globals when it is called.
 */
export interface FrameScheduler {
  request(callback: (nowMs: number) => void): number
  cancel(handle: number): void
}

export const browserScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
}
