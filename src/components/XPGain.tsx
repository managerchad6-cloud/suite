import { useEffect, useRef } from 'react'
import './XPGain.css'

interface Props {
  amount: number
  alignment?: 'chad' | 'virgin' | 'neutral'
  onDone?: () => void
}

export function XPGain({ amount, alignment = 'neutral', onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.add('xp-gain--animate')
    const t = setTimeout(() => { onDone?.() }, 1000)
    return () => clearTimeout(t)
  }, [onDone])

  const color = alignment === 'chad' ? '#F0A020' : alignment === 'virgin' ? '#c060ff' : '#4acc7a'

  return (
    <div ref={ref} className="xp-gain" style={{ color }}>
      +{amount} XP
    </div>
  )
}
