import { Layers3 } from 'lucide-react'
import type { SceneFrame, StatusLevel } from '@/domain/scene'
import { LAYER_IDS } from '@/domain/layers'
import type { LayerId, LayerVisibility } from '@/domain/layers'
import { useScene } from '@/state/sceneStore'
import { fixed } from '../format'

const LAYER_LABELS: Record<LayerId, string> = {
  road: 'Road surface',
  lanes: 'Lane boundaries',
  traffic: 'Other vehicles',
  lights: 'Traffic lights',
  trajectory: 'Planned trajectory',
  labels: 'Labels and overlay',
  grid: 'Grid',
}

const STATUS_CLASS: Record<StatusLevel, string> = {
  active: 'good',
  idle: 'good',
  waiting: 'warn',
  fault: 'warn',
  unknown: 'warn',
}

function ObjectRow(props: { color: string; name: string; meta: string; state: string }) {
  return (
    <div className="object-row">
      <i className={`object-dot ${props.color}`} />
      <div>
        <b>{props.name}</b>
        <small>{props.meta}</small>
      </div>
      <span className="object-state">{props.state}</span>
    </div>
  )
}

export function InspectorPanel({ frame, layers }: { frame: SceneFrame; layers: LayerVisibility }) {
  const toggleLayer = useScene((s) => s.toggleLayer)
  const leadId = frame.acc?.leadObjectId
  return (
    <section className="panel inspector">
      <div className="panel-head">
        <div>
          <h2>Scene layers</h2>
          <p>Visualization controls</p>
        </div>
        <Layers3 size={18} />
      </div>
      {LAYER_IDS.map((key) => (
        <label className="layer-row" key={key}>
          <span>
            <i className={`layer-swatch ${key}`} />
            {LAYER_LABELS[key]}
          </span>
          <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />
        </label>
      ))}
      <div className="divider" />
      <h3>Detected objects</h3>
      <ObjectRow color="orange" name="Ego vehicle" meta="Truck" state="SELF" />
      {frame.agents.map((agent) => {
        const isLead = agent.id === leadId
        const distance = isLead ? ` · ${fixed(frame.acc?.leadDistanceM, 1)} m` : ''
        return (
          <ObjectRow
            key={agent.id}
            color="blue"
            name={isLead ? 'Leading vehicle' : 'Other vehicle'}
            meta={`${agent.kind} · ${agent.id}${distance}`}
            state="DETECTED"
          />
        )
      })}
      {frame.signals.map((signal) => {
        const remaining = signal.remainingS === null ? '' : ` · ${fixed(signal.remainingS, 0)} s`
        return (
          <ObjectRow
            key={signal.id}
            color="red"
            name="Traffic light"
            meta={`${signal.id} · ${signal.state.toUpperCase()}${remaining}`}
            state="DETECTED"
          />
        )
      })}
      <div className="divider" />
      <h3>Planner status</h3>
      {frame.status.map((entry) => (
        <div className="status-line" key={entry.id}>
          <span>{entry.label}</span>
          <b className={STATUS_CLASS[entry.state]}>{entry.text}</b>
        </div>
      ))}
    </section>
  )
}
