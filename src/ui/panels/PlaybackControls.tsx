import { Pause, Play } from 'lucide-react'
import { useScene } from '@/state/sceneStore'
import { formatClock } from '../format'

const RATES: readonly number[] = [0.5, 1, 2]

/** Timeline controls for sources that have a timeline (simulation, replay). */
export function PlaybackControls() {
  const control = useScene((s) => s.playbackControl)
  const playback = useScene((s) => s.playback)
  const timeS = useScene((s) => s.frame?.timestampS ?? 0)
  if (control === null || playback === null) return null
  const duration = playback.durationS
  const nextRate = RATES[(RATES.indexOf(playback.rate) + 1) % RATES.length] ?? 1
  return (
    <div className="playback">
      <button
        className="icon-btn"
        aria-label={playback.playing ? 'Pause' : 'Play'}
        onClick={() => (playback.playing ? control.pause() : control.play())}
      >
        {playback.playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button
        className="icon-btn playback-rate"
        aria-label="Change playback speed"
        onClick={() => control.setRate(nextRate)}
      >
        {playback.rate}×
      </button>
      {duration !== null && (
        <input
          type="range"
          aria-label="Timeline position"
          min={0}
          max={duration}
          step={0.1}
          value={timeS}
          onChange={(e) => control.seek(Number(e.target.value))}
        />
      )}
      <span className="playback-time">
        {formatClock(timeS)}
        {duration !== null && ` / ${formatClock(duration)}`}
      </span>
    </div>
  )
}
