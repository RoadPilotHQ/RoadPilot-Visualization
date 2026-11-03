import {
  Activity,
  AudioWaveform,
  Crosshair,
  Map,
  Route,
  Settings2,
  TrafficCone,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useScene } from '@/state/sceneStore'
import type { ViewId } from '@/state/sceneStore'

const NAV: readonly { view: ViewId; icon: ReactNode }[] = [
  { view: 'Overview', icon: <Activity /> },
  { view: 'Map View', icon: <Map /> },
  { view: 'Traffic', icon: <TrafficCone /> },
  { view: 'Trajectory', icon: <Route /> },
  { view: 'Telemetry', icon: <AudioWaveform /> },
]

export function Sidebar() {
  const view = useScene((s) => s.view)
  const setView = useScene((s) => s.setView)
  const source = useScene((s) => s.source)
  const status = useScene((s) => s.status)
  const connected = status.state === 'connected'
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Crosshair size={22} />
        </div>
        <div>
          <b>RoadPilot</b>
          <small>VISUALIZATION</small>
        </div>
      </div>
      <div className="side-label">WORKSPACE</div>
      {NAV.map((item) => (
        <button
          key={item.view}
          className={`nav-item ${view === item.view ? 'active' : ''}`}
          onClick={() => setView(item.view)}
        >
          {item.icon}
          <span>{item.view}</span>
        </button>
      ))}
      <div className="side-bottom">
        <button className="nav-item">
          <Settings2 />
          <span>Settings</span>
        </button>
        <div className="connection">
          <span className="dot" /> {connected ? 'SOURCE CONNECTED' : 'NO SOURCE'}
          <small>{source?.label ?? 'NONE'}</small>
        </div>
      </div>
    </aside>
  )
}
