import { CarFront, CircleGauge, Gauge, Route } from 'lucide-react'
import type { ReactNode } from 'react'
import { mpsToKmh } from '@/domain/coordinates'
import type { SceneFrame } from '@/domain/scene'
import { egoSpeedKmh, laneOffsetM, leadAgent } from '@/domain/selectors'
import { curvatureText, fixed, laneOffsetText, signed } from '../format'

function Metric(props: {
  icon: ReactNode
  label: string
  value: string
  unit: string
  detail: string
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="metric-value">
        {props.value}
        <small>{props.unit}</small>
      </div>
      <p>{props.detail}</p>
    </div>
  )
}

export function MetricsRow({ frame }: { frame: SceneFrame }) {
  const setSpeed = frame.acc?.setSpeedMps
  const lead = leadAgent(frame)
  const offset = laneOffsetM(frame)
  return (
    <div className="metrics">
      <Metric
        icon={<Gauge />}
        label="EGO SPEED"
        value={fixed(egoSpeedKmh(frame), 1)}
        unit="km/h"
        detail={
          setSpeed === null || setSpeed === undefined
            ? 'No target speed'
            : `Target ${fixed(mpsToKmh(setSpeed), 0)} km/h`
        }
      />
      <Metric
        icon={<Route />}
        label="LANE OFFSET"
        value={signed(offset, 2)}
        unit="m"
        detail={laneOffsetText(offset)}
      />
      <Metric
        icon={<CircleGauge />}
        label="CURVATURE"
        value={fixed(Math.abs(frame.ego.curvaturePerM), 4)}
        unit="1/m"
        detail={curvatureText(frame.ego.curvaturePerM)}
      />
      <Metric
        icon={<CarFront />}
        label="LEAD DISTANCE"
        value={fixed(frame.acc?.leadDistanceM, 1)}
        unit="m"
        detail={lead === null ? 'No lead vehicle' : `${lead.kind} · ${lead.id}`}
      />
    </div>
  )
}
