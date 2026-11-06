import { parseFrame } from '@/contract/frameV1'
import type { SceneFrame } from '@/domain/scene'
import type { DataSource, SourceInfo, SourceStatus, Unsubscribe } from '../DataSource'

interface SocketMessageEvent {
  readonly data: unknown
}

interface SocketLike {
  onopen: (() => void) | null
  onmessage: ((event: SocketMessageEvent) => void) | null
  onerror: (() => void) | null
  onclose: (() => void) | null
  close(): void
}

export interface WebSocketFrameSourceOptions {
  readonly url: string
  readonly createSocket?: (url: string) => SocketLike
  readonly schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  readonly cancel?: (timer: ReturnType<typeof setTimeout>) => void
}

const MIN_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 10_000

/**
 * Read-only consumer for `roadpilot-visualization-frame` v1/v2 over a loopback WebSocket.
 * It never sends data to the producer and discards malformed or unsupported frames.
 */
export class WebSocketFrameSource implements DataSource {
  readonly info: SourceInfo = {
    id: 'live:roadpilot-visualization-frame',
    kind: 'live',
    label: 'LIVE STREAM',
    sceneLabel: 'LIVE · ROADPILOT FRAME STREAM',
  }
  readonly playback = null

  private status: SourceStatus = { state: 'idle', message: null }
  private readonly frameListeners = new Set<(frame: SceneFrame) => void>()
  private readonly statusListeners = new Set<(status: SourceStatus) => void>()
  private readonly url: string
  private readonly createSocket: (url: string) => SocketLike
  private readonly schedule: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>
  private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void
  private socket: SocketLike | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelayMs = MIN_RECONNECT_DELAY_MS
  private connected = false

  constructor(options: WebSocketFrameSourceOptions) {
    this.url = validateLoopbackWebSocketUrl(options.url)
    this.createSocket = options.createSocket ?? createBrowserSocket
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.cancel = options.cancel ?? ((timer) => clearTimeout(timer))
  }

  getStatus(): SourceStatus {
    return this.status
  }

  subscribeStatus(listener: (status: SourceStatus) => void): Unsubscribe {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  subscribe(listener: (frame: SceneFrame) => void): Unsubscribe {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  connect(): void {
    if (this.connected) return
    this.connected = true
    this.openSocket()
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    if (this.reconnectTimer !== null) {
      this.cancel(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const socket = this.socket
    this.socket = null
    if (socket !== null) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.close()
    }
    this.setStatus({ state: 'closed', message: null })
  }

  private openSocket(): void {
    if (!this.connected) return
    this.setStatus({ state: 'connecting', message: 'Connecting to the local frame stream' })
    let socket: SocketLike
    try {
      socket = this.createSocket(this.url)
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error.message : String(error))
      return
    }
    this.socket = socket
    socket.onopen = () => {
      if (this.socket !== socket || !this.connected) return
      this.setStatus({ state: 'connecting', message: 'Connected; waiting for a valid scene frame' })
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket || !this.connected) return
      void this.receive(event.data)
    }
    socket.onerror = () => {
      if (this.socket === socket && this.connected) {
        this.setStatus({
          state: 'error',
          message: 'The local frame stream reported a connection error',
        })
      }
    }
    socket.onclose = () => {
      if (this.socket !== socket || !this.connected) return
      this.socket = null
      this.scheduleReconnect('The local frame stream closed; retrying')
    }
  }

  private receive(data: unknown): void {
    let value: unknown = data
    if (typeof data === 'string') {
      try {
        value = JSON.parse(data) as unknown
      } catch {
        this.setStatus({ state: 'error', message: 'The local frame stream sent invalid JSON' })
        return
      }
    }
    const parsed = parseFrame(value)
    if (!parsed.ok) {
      this.setStatus({ state: 'error', message: parsed.error })
      return
    }
    this.reconnectDelayMs = MIN_RECONNECT_DELAY_MS
    this.setStatus({ state: 'connected', message: 'Receiving read-only scene frames' })
    for (const listener of this.frameListeners) listener(parsed.frame)
  }

  private scheduleReconnect(message: string): void {
    if (!this.connected || this.reconnectTimer !== null) return
    this.setStatus({ state: 'stale', message })
    const delayMs = this.reconnectDelayMs
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
    this.reconnectTimer = this.schedule(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delayMs)
  }

  private setStatus(status: SourceStatus): void {
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }
}

function validateLoopbackWebSocketUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Live frame URL must be a valid loopback WebSocket URL')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  if (!['ws:', 'wss:'].includes(url.protocol) || !loopback) {
    throw new Error('Live frame URL must use ws(s)://localhost, 127.0.0.1 or [::1]')
  }
  if (url.username || url.password) {
    throw new Error('Live frame URL must not contain credentials')
  }
  return url.toString()
}

function createBrowserSocket(url: string): SocketLike {
  const socket = new WebSocket(url)
  const handlers: SocketLike = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    close: () => socket.close(),
  }
  socket.onopen = () => handlers.onopen?.()
  socket.onmessage = (event) => handlers.onmessage?.(event)
  socket.onerror = () => handlers.onerror?.()
  socket.onclose = () => handlers.onclose?.()
  return handlers
}
