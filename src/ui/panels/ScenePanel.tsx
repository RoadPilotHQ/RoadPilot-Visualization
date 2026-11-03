import { CanvasSceneView } from '../scene/CanvasSceneView'
import { PlaybackControls } from './PlaybackControls'

export function ScenePanel() {
  return (
    <section className="panel map-panel">
      <div className="panel-head">
        <div>
          <h2>World visualization</h2>
          <p>Top-down scene · drag to pan, scroll to zoom</p>
        </div>
        <span className="tag">2D RENDER</span>
      </div>
      <CanvasSceneView />
      <div className="map-legend">
        <span>
          <i className="legend-line green" />
          Lane boundaries
        </span>
        <span>
          <i className="legend-line orange" />
          Planned trajectory
        </span>
        <span>
          <i className="legend-dot" />
          Ego vehicle
        </span>
      </div>
      <PlaybackControls />
    </section>
  )
}
