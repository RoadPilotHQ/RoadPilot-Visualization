import { describe, expect, it, vi } from 'vitest'
import { serializeFrameV1 } from '@/contract/frame'
import { sampleHighwayFollow } from '@/sources/simulation/highwayFollow'
import { WebSocketFrameSource } from './WebSocketFrameSource'

class FakeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  closed = false

  close() {
    this.closed = true
  }

  open() {
    this.onopen?.()
  }

  message(data: unknown) {
    this.onmessage?.({ data })
  }

  remoteClose() {
    this.onclose?.()
  }
}

describe('WebSocketFrameSource', () => {
  it('only accepts loopback websocket addresses', () => {
    expect(() => new WebSocketFrameSource({ url: 'ws://example.com:8765' })).toThrow(
      'must use ws(s)://localhost',
    )
    expect(() => new WebSocketFrameSource({ url: 'ws://user@localhost:8765' })).toThrow(
      'must not contain credentials',
    )
    expect(() => new WebSocketFrameSource({ url: 'http://localhost:8765' })).toThrow(
      'must use ws(s)://localhost',
    )
  })

  it('validates incoming frames and reports malformed data without emitting it', () => {
    const socket = new FakeSocket()
    const source = new WebSocketFrameSource({
      url: 'ws://127.0.0.1:8765',
      createSocket: () => socket,
    })
    const frames: unknown[] = []
    source.subscribe((frame) => frames.push(frame))

    source.connect()
    expect(source.getStatus().state).toBe('connecting')
    socket.open()
    expect(source.getStatus()).toMatchObject({
      state: 'connecting',
      message: 'Connected; waiting for a valid scene frame',
    })
    socket.message(
      JSON.stringify(
        serializeFrameV1({ ...sampleHighwayFollow(3), sequence: 12, sourceId: 'test-producer' }),
      ),
    )
    expect(frames).toHaveLength(1)
    expect(source.getStatus().state).toBe('connected')

    socket.message('{bad json')
    expect(frames).toHaveLength(1)
    expect(source.getStatus()).toMatchObject({
      state: 'error',
      message: 'The local frame stream sent invalid JSON',
    })
  })

  it('accepts schema 2 with missing readings and preserves null values', () => {
    const socket = new FakeSocket()
    const source = new WebSocketFrameSource({
      url: 'ws://127.0.0.1:8765',
      createSocket: () => socket,
    })
    const frames: Array<{ ego: { position: unknown; widthM: unknown } }> = []
    source.subscribe((frame) => frames.push(frame))
    source.connect()
    socket.open()
    socket.message(
      JSON.stringify({
        format: 'roadpilot-visualization-frame',
        schema_version: { major: 2, minor: 0 },
        source: { id: 'roadpilot' },
        sequence: 1,
        timestamp_s: 5,
        ego: {
          position: null,
          heading_rad: null,
          speed_mps: 3,
          steering_angle_rad: null,
          curvature_per_m: null,
          length_m: null,
          width_m: null,
        },
      }),
    )
    expect(frames).toHaveLength(1)
    expect(frames[0]?.ego).toMatchObject({ position: null, speedMps: 3, widthM: null })
  })

  it('reconnects with a delay and stops retrying after disconnect', () => {
    vi.useFakeTimers()
    try {
      const sockets: FakeSocket[] = []
      const source = new WebSocketFrameSource({
        url: 'ws://localhost:8765',
        createSocket: () => {
          const socket = new FakeSocket()
          sockets.push(socket)
          return socket
        },
      })

      source.connect()
      sockets[0]!.remoteClose()
      expect(source.getStatus().state).toBe('stale')
      vi.advanceTimersByTime(499)
      expect(sockets).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(sockets).toHaveLength(2)

      sockets[1]!.remoteClose()
      source.disconnect()
      vi.runOnlyPendingTimers()
      expect(sockets).toHaveLength(2)
      expect(source.getStatus().state).toBe('closed')
      expect(sockets[1]!.closed).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
