import { useEffect } from 'react'
import { RANK_DISPLAY } from '../api/player'
import { RankBadge } from './RankBadge'
import './RankUpModal.css'

interface Props {
  from: string
  to: string
  direction: string
  onClose: () => void
}

export function RankUpModal({ from, to, direction, onClose }: Props) {
  const display = RANK_DISPLAY[to] ?? RANK_DISPLAY['basic']

  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => { clearTimeout(t); window.removeEventListener('keydown', handler) }
  }, [onClose])

  return (
    <div className="rankup-overlay" onClick={onClose}>
      <div className="rankup-modal" style={{ '--rank-color': display.color } as React.CSSProperties} onClick={e => e.stopPropagation()}>
        <div className="rankup-particles">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="rankup-particle" style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
        <div className="rankup-label">RANK UP</div>
        <RankBadge rank={to} size="lg" />
        <div className="rankup-from">
          {RANK_DISPLAY[from]?.label ?? from} → <strong style={{ color: display.color }}>{display.label}</strong>
        </div>
        <div className="rankup-direction">
          You are moving {direction === 'chad' ? 'toward Chad ▶' : direction === 'virgin' ? '◀ toward Virgin' : '⬤ Balanced'}
        </div>
        <button className="rankup-close" onClick={onClose}>Continue</button>
      </div>
    </div>
  )
}
