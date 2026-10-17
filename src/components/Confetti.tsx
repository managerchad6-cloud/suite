// Full-screen confetti, like the Studio publish and X share celebrations. Re-key it to fire again.
import { useMemo, type CSSProperties } from 'react'
import './Confetti.css'

const COLORS = ['#ff4d4d', '#ffd700', '#4dff91', '#4dc8ff', '#ff4dce', '#fff', '#F0A020', '#ff922b']

export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const styles = useMemo(() => Array.from({ length: pieces }, () => ({
    '--x':        `${Math.random() * 100}vw`,
    '--delay':    `${(Math.random() * 0.9).toFixed(2)}s`,
    '--duration': `${(1 + Math.random() * 1.1).toFixed(2)}s`,
    '--color':    COLORS[Math.floor(Math.random() * COLORS.length)],
    '--rot':      `${Math.floor(Math.random() * 360)}deg`,
  } as CSSProperties)), [pieces])
  return <>{styles.map((st, i) => <span key={i} className="vvc-confetti" style={st} />)}</>
}
