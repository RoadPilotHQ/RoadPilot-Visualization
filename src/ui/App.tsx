import { useScene } from '@/state/sceneStore'
import { InspectorPanel } from './panels/InspectorPanel'
import { MetricsRow } from './panels/MetricsRow'
import { ScenePanel } from './panels/ScenePanel'
import { Sidebar } from './panels/Sidebar'
import { TelemetryPanel } from './panels/TelemetryPanel'
import { Topbar } from './panels/Topbar'
import { MapPackagePanel } from './map/MapPackagePanel'

export function App() {
  const frame = useScene((s) => s.frame)
  const source = useScene((s) => s.source)
  const layers = useScene((s) => s.layers)
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="content">
        <Topbar />
        {frame === null || source === null ? (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Waiting for data</h2>
                <p>No frame has been received from the data source yet.</p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <MetricsRow frame={frame} />
            <div className="main-grid">
              <ScenePanel />
              <InspectorPanel frame={frame} layers={layers} />
            </div>
            <MapPackagePanel />
            <TelemetryPanel frame={frame} sourceKind={source.kind} />
          </>
        )}
        <footer>
          ROADPILOT VISUALIZATION <span>PHASE 1 Â· FOUNDATION</span>
          <span>DATA SOURCE: {source?.kind.toUpperCase() ?? 'NONE'}</span>
        </footer>
      </section>
    </main>
  )
}
