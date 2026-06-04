import { useState, useEffect } from 'react'
import type { BadgeDef } from '../api/player'
import './BadgeUnlockedToast.css'

interface Props {
  badges: BadgeDef[]
  onDismiss: (id: string) => void
}

function rarityClass(rarity: string) {
  return `badt-rarity-${rarity}`
}

function XPPill({ xp }: { xp: number }) {
  return <span className="badt-xp">+{xp} XP</span>
}

function SingleToast({ badge, onDismiss }: { badge: BadgeDef; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20)
    const t2 = setTimeout(() => {
      setLeaving(true)
      setTimeout(onDismiss, 400)
    }, 5000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDismiss])

  const cls = [
    'badt',
    rarityClass(badge.rarity),
    visible && !leaving ? 'badt--visible' : '',
    leaving ? 'badt--leaving' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} onClick={() => { setLeaving(true); setTimeout(onDismiss, 400) }}>
      <div className="badt-header">ACHIEVEMENT UNLOCKED</div>
      <div className="badt-body">
        <span className="badt-icon">{badge.icon}</span>
        <div className="badt-text">
          <span className="badt-name">{badge.name}</span>
          <span className="badt-desc">{badge.description}</span>
        </div>
        <XPPill xp={badge.xp_reward} />
      </div>
    </div>
  )
}

export function BadgeUnlockedToast({ badges, onDismiss }: Props) {
  const visible = badges.slice(0, 3)
  if (visible.length === 0) return null

  return (
    <div className="badt-stack">
      {visible.map(b => (
        <SingleToast key={b.id} badge={b} onDismiss={() => onDismiss(b.id)} />
      ))}
    </div>
  )
}
