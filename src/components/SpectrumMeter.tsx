import './SpectrumMeter.css'

interface Props {
  position: number  // 0.0 (pure virgin) → 1.0 (pure chad)
  rank: string
  progress: number  // 0..1 within current rank
  size?: 'sm' | 'md'
}

export function SpectrumMeter({ position, progress, rank, size = 'md' }: Props) {
  const pct = Math.round(position * 100)

  return (
    <div className={`spectrum-meter spectrum-meter--${size}`}>
      <div className="spectrum-track">
        <div className="spectrum-fill spectrum-fill--virgin" style={{ width: `${100 - pct}%` }} />
        <div className="spectrum-fill spectrum-fill--chad"   style={{ width: `${pct}%` }} />
        <div className="spectrum-cursor" style={{ left: `${pct}%` }} />
      </div>
      <div className="spectrum-labels">
        <span className="spectrum-label spectrum-label--virgin">Virgin</span>
        <span className="spectrum-rank">{rank.replace('_rank','')}</span>
        <span className="spectrum-label spectrum-label--chad">Chad</span>
      </div>
      {rank !== 'basic' && (
        <div className="spectrum-xp-bar">
          <div className="spectrum-xp-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
