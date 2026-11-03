import { LocateFixed, Minus, Plus } from 'lucide-react'
import { useStore } from 'zustand'
import { ZOOM_MAX, ZOOM_MIN } from '@/render/view'
import { ZOOM_STEP } from './viewStore'
import type { SceneViewStoreApi } from './viewStore'

/** Camera controls shown on top of the scene: zoom, follow mode and the current scale. */
export function SceneToolbar({ store }: { store: SceneViewStoreApi }) {
  const mode = useStore(store, (s) => s.view.mode)
  const pixelsPerMetre = useStore(store, (s) => s.view.pixelsPerMetre)
  const { zoom, follow } = store.getState()
  return (
    <div className="scene-toolbar" role="toolbar" aria-label="Camera controls">
      <span className="scene-toolbar-readout">
        {mode === 'follow' ? 'FOLLOW' : 'FREE'} · {pixelsPerMetre.toFixed(1)} px/m
      </span>
      <button
        className="icon-btn"
        aria-label="Zoom in"
        disabled={pixelsPerMetre >= ZOOM_MAX}
        onClick={() => zoom(ZOOM_STEP, null)}
      >
        <Plus size={16} />
      </button>
      <button
        className="icon-btn"
        aria-label="Zoom out"
        disabled={pixelsPerMetre <= ZOOM_MIN}
        onClick={() => zoom(1 / ZOOM_STEP, null)}
      >
        <Minus size={16} />
      </button>
      <button
        className={`icon-btn ${mode === 'follow' ? 'active' : ''}`}
        aria-label="Follow ego vehicle"
        aria-pressed={mode === 'follow'}
        onClick={() => follow()}
      >
        <LocateFixed size={16} />
      </button>
    </div>
  )
}
