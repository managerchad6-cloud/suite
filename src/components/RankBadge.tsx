import { RANK_DISPLAY } from '../api/player'
import './RankBadge.css'

interface Props {
  rank: string
  direction?: 'chad' | 'virgin' | 'neutral'
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export function RankBadge({ rank, size = 'sm' }: Props) {
  const display = RANK_DISPLAY[rank] ?? RANK_DISPLAY['basic']
  return (
    <span
      className={`rank-badge rank-badge--${size}`}
      style={{ color: display.color, background: display.bg, borderColor: display.color + '55' }}
    >
      {display.label}
    </span>
  )
}
