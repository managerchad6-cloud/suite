import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './NotificationPanel.css'

interface Notification {
  id: string
  type: string
  payload: Record<string, unknown>
  read: number
  created_at: string
}

const TYPE_ICON: Record<string, string> = {
  tier_climbed:        '📈',
  meme_voted:          '▲',
  rank_up:             '⚡',
  scout_payoff:        '🔭',
  streak_warning:      '⏰',
  daily_prompt:        '🎯',
  pantheon_induction:  '👑',
  character_unlocked:  '🔓',
  achievement_unlocked:'🏆',
  default:             '🔔',
}

function formatNotif(n: Notification): string {
  const p = n.payload
  switch (n.type) {
    case 'rank_up':            return `Ranked up to ${p.to}!`
    case 'tier_climbed':       return `Your meme reached ${p.tier}!`
    case 'scout_payoff':       return `Scout bonus — your early vote paid off (+${p.xp} XP)`
    case 'character_unlocked': return `${p.name} unlocked!`
    case 'streak_warning':     return 'Your streak expires in 4 hours — log in!'
    default:                   return n.type.replace(/_/g, ' ')
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface Props { wallet: string }

export function NotificationBell({ wallet }: Props) {
  const [open,   setOpen]   = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  // anchor = distance from viewport bottom/left so panel grows upward
  const [pos, setPos] = useState({ bottom: 0, left: 0 })
  const bellRef  = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = () => {
    fetch(`/api/notifications/${encodeURIComponent(wallet)}?limit=20`)
      .then(r => r.ok ? r.json() : { items: [], unread: 0 })
      .then(d => { setNotifs(d.items ?? []); setUnread(d.unread ?? 0) })
      .catch(() => {})
  }

  useEffect(() => { load() }, [wallet])  // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    if (!open && bellRef.current) {
      const r = bellRef.current.getBoundingClientRect()
      // Panel grows upward from just above the button
      const bottom = window.innerHeight - r.top + 8
      setPos({ bottom: Math.max(8, bottom), left: r.right + 10 })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    load()
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        bellRef.current  && !bellRef.current.contains(target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

  async function markAll() {
    await fetch('/api/notifications/read_all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    })
    setUnread(0)
    setNotifs(prev => prev.map(n => ({ ...n, read: 1 })))
  }

  return (
    <>
      <button ref={bellRef} className="notif-bell" onClick={toggle} aria-label="Notifications">
        🔔
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="notif-panel"
          style={{ bottom: pos.bottom, left: pos.left }}
        >
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unread > 0 && (
              <button className="notif-mark-all" onClick={markAll}>Mark all read</button>
            )}
          </div>
          <div className="notif-list">
            {notifs.length === 0 ? (
              <p className="notif-empty">Nothing yet.</p>
            ) : notifs.map(n => (
              <div key={n.id} className={`notif-item ${!n.read ? 'notif-item--unread' : ''}`}>
                <span className="notif-icon">{TYPE_ICON[n.type] ?? TYPE_ICON.default}</span>
                <div className="notif-body">
                  <span className="notif-text">{formatNotif(n)}</span>
                  <span className="notif-time">{timeAgo(n.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
