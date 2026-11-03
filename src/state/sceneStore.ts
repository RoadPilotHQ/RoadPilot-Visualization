import { createStore, useStore } from 'zustand'
import type { StoreApi } from 'zustand'
import { DEFAULT_LAYERS } from '@/domain/layers'
import type { LayerId, LayerVisibility } from '@/domain/layers'
import type { SceneFrame } from '@/domain/scene'
import type { PlaybackControl, PlaybackSnapshot } from '@/sources/playback/PlaybackClock'
import type { DataSource, SourceInfo, SourceStatus } from '@/sources/DataSource'

export type ViewId = 'Overview' | 'Map View' | 'Traffic' | 'Trajectory' | 'Telemetry'

export interface SceneState {
  /** Latest frame from the active source, or null before the first frame. */
  readonly frame: SceneFrame | null
  readonly source: SourceInfo | null
  readonly status: SourceStatus
  /** Playback state without the (high-frequency) time; time comes from `frame.timestampS`. */
  readonly playback: Pick<PlaybackSnapshot, 'playing' | 'rate' | 'durationS'> | null
  /** Timeline controls of the active source, or null when it has no timeline. */
  readonly playbackControl: PlaybackControl | null
  readonly layers: LayerVisibility
  readonly view: ViewId
}

export interface SceneActions {
  setFrame(frame: SceneFrame): void
  setStatus(status: SourceStatus): void
  setSource(
    source: SourceInfo | null,
    playback: SceneState['playback'],
    control: PlaybackControl | null,
  ): void
  toggleLayer(layer: LayerId): void
  setView(view: ViewId): void
}

export type SceneStore = SceneState & SceneActions
export type SceneStoreApi = StoreApi<SceneStore>

export function createSceneStore(): SceneStoreApi {
  return createStore<SceneStore>()((set) => ({
    frame: null,
    source: null,
    status: { state: 'idle', message: null },
    playback: null,
    playbackControl: null,
    layers: DEFAULT_LAYERS,
    view: 'Overview',
    setFrame: (frame) => set({ frame }),
    setStatus: (status) => set({ status }),
    setSource: (source, playback, playbackControl) =>
      set({ source, playback, playbackControl, frame: null }),
    toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
    setView: (view) => set({ view }),
  }))
}

/** Application-wide store instance. Tests create their own with `createSceneStore`. */
export const sceneStore = createSceneStore()

export function useScene<T>(selector: (state: SceneStore) => T): T {
  return useStore(sceneStore, selector)
}

const playbackStateOf = (p: PlaybackSnapshot) => ({
  playing: p.playing,
  rate: p.rate,
  durationS: p.durationS,
})

/**
 * Connects a data source to a store: frames and status flow into the store.
 * Returns a function that disconnects the source and detaches the listeners.
 * Data only flows from the source into the store; nothing is sent back to the source.
 */
export function attachSource(store: SceneStoreApi, source: DataSource): () => void {
  const control: PlaybackControl | null = source.playback
  store
    .getState()
    .setSource(
      source.info,
      control === null ? null : playbackStateOf(control.getSnapshot()),
      control,
    )
  store.getState().setStatus(source.getStatus())

  const offFrame = source.subscribe((frame) => store.getState().setFrame(frame))
  const offStatus = source.subscribeStatus((status) => store.getState().setStatus(status))
  const offPlayback =
    control === null
      ? null
      : control.subscribe((snapshot) => {
          // The timeline ticks continuously; only publish changes of the discrete state.
          const current = store.getState().playback
          const next = playbackStateOf(snapshot)
          if (
            current === null ||
            current.playing !== next.playing ||
            current.rate !== next.rate ||
            current.durationS !== next.durationS
          ) {
            store.setState({ playback: next })
          }
        })

  source.connect()

  return () => {
    // Disconnect first so that the final "closed" status still reaches the store.
    source.disconnect()
    offFrame()
    offStatus()
    offPlayback?.()
  }
}
