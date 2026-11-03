import { Settings2 } from 'lucide-react'
import { useScene } from '@/state/sceneStore'

export function Topbar() {
  const view = useScene((s) => s.view)
  const source = useScene((s) => s.source)
  const status = useScene((s) => s.status)
  const kind = (source?.kind ?? 'no source').toUpperCase()
  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">ROADPILOT ECOSYSTEM / DEBUG TOOLS</div>
        <h1>{view}</h1>
      </div>
      <div className="top-actions">
        <span className="live">
          <i /> {kind} {status.state === 'connected' ? 'LIVE' : status.state.toUpperCase()}
        </span>
        <button className="icon-btn" aria-label="Settings">
          <Settings2 size={18} />
        </button>
      </div>
    </header>
  )
}
