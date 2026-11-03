import type { SceneFrame } from '@/domain/scene'
import { lookaheadM } from '@/domain/selectors'
import { fixed, signed } from '../format'

function Cell(props: { label: string; value: string; unit: string }) {
  return (
    <div className="telemetry-cell">
      <small>{props.label}</small>
      <b>{props.value}</b>
      <span>{props.unit}</span>
    </div>
  )
}

export function TelemetryPanel({ frame, sourceKind }: { frame: SceneFrame; sourceKind: string }) {
  return (
    <section className="panel telemetry">
      <div className="panel-head">
        <div>
          <h2>Telemetry snapshot</h2>
          <p>Observed values · display only</p>
        </div>
        <span className="tag">
          {sourceKind === 'simulation' ? 'MOCK' : sourceKind.toUpperCase()}
        </span>
      </div>
      <div className="telemetry-grid">
        <Cell label="STEERING INPUT" value={signed(frame.inputs?.steering, 3)} unit="input" />
        <Cell label="THROTTLE" value={fixed(frame.inputs?.throttle, 2)} unit="0–1" />
        <Cell label="BRAKE" value={fixed(frame.inputs?.brake, 2)} unit="0–1" />
        <Cell label="LOOKAHEAD" value={fixed(lookaheadM(frame), 1)} unit="m" />
      </div>
    </section>
  )
}
