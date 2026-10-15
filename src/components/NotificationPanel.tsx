import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useIdentity } from '../identity/IdentityProvider'
import { createPortal } from 'react-dom'
import { respondToFriendRequest } from '../api/friends'
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
  friend_request:           '🤝',
  friend_request_accepted:  '✅',
  friend_published:         '📣',
  profile_comment:          '💬',
  dm:                       '✉️',
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
    case 'friend_request':          return `${truncWallet(String(p.from))} sent you a friend request`
    case 'friend_request_accepted': return `${truncWallet(String(p.by))} accepted your friend request`
    case 'friend_published':        return `${truncWallet(String(p.wallet))} published a new meme`
    case 'profile_comment':         return `${truncWallet(String(p.from))} commented on your profile`
    case 'dm':                      return `${truncWallet(String(p.from))}: ${p.preview}`
    default:                   return n.type.replace(/_/g, ' ')
  }
}

function truncWallet(w: string): string {
  return w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w
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

interface Props {
  onNavigate?: (path: string) => void
  onOpenChat?: (wallet: string) => void
  onOpenMessages?: (rect: DOMRect) => void
}

// Member-only (rendered in the member nav): the session decides whose notifications these are
export function NotificationBell({ onNavigate, onOpenChat, onOpenMessages }: Props) {
  const { memberWallet: wallet } = useIdentity()
  const [open,   setOpen]   = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [resolving, setResolving] = useState<string | null>(null)
  const [pos, setPos] = useState<React.CSSProperties>({})
  const bellRef  = useRef<HTMLButtonElement>(null)
  const msgBtnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = () => {
    api<{ items: Notification[]; unread: number }>('/api/notifications?limit=20')
      .then(d => { setNotifs(d.items ?? []); setUnread(d.unread ?? 0) })
      .catch(() => {})
  }

  useEffect(() => { load() }, [wallet])  // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    if (!open && bellRef.current) {
      const r = bellRef.current.getBoundingClientRect()
      const inTopHalf = r.top < window.innerHeight / 2
      if (inTopHalf) {
        // Drop down from below the button; right-align to button's right edge
        const right = window.innerWidth - r.right
        setPos({ top: r.bottom + 8, right: Math.max(8, right) })
      } else {
        // Grow upward; appear to the right of the button
        setPos({ bottom: Math.max(8, window.innerHeight - r.top + 8), left: r.right + 10 })
      }
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
    await api('/api/notifications/read_all', { method: 'POST' }).catch(() => {})
    setUnread(0)
    setNotifs(prev => prev.map(n => ({ ...n, read: 1 })))
  }

  function navPathFor(n: Notification): string | null {
    const p = n.payload
    switch (n.type) {
      case 'friend_request_accepted': return `/u/${p.by}`
      case 'friend_published':        return `/memes/${p.meme_source}/${p.meme_id}`
      case 'profile_comment':         return '/profile'
      default: return null
    }
  }

  function handleItemClick(n: Notification) {
    if (n.type === 'friend_request') return
    if (n.type === 'dm') {
      if (onOpenChat) { onOpenChat(String(n.payload.from)); setOpen(false) }
      return
    }
    const path = navPathFor(n)
    if (path && onNavigate) { onNavigate(path); setOpen(false) }
  }

  async function respond(n: Notification, action: 'accept' | 'decline') {
    const requestId = n.payload.request_id as number | undefined
    if (!requestId) return
    setResolving(n.id)
    try {
      await respondToFriendRequest(requestId, action)
      setNotifs(prev => prev.filter(x => x.id !== n.id))
    } catch { /* leave it in the list, user can retry */ }
    finally { setResolving(null) }
  }

  return (
    <>
      <div className="notif-btn-group">
        <button ref={bellRef} className="notif-bell" onClick={toggle} aria-label="Notifications">
          🔔
          {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button
          ref={msgBtnRef}
          className="notif-msg-btn"
          onClick={() => {
            if (onOpenMessages && msgBtnRef.current) {
              onOpenMessages(msgBtnRef.current.getBoundingClientRect())
            } else if (onOpenChat) {
              onOpenChat('')
            }
          }}
          aria-label="Messages"
        >
          💬
        </button>
      </div>

      {open && createPortal(
        <div
          ref={panelRef}
          className="notif-panel"
          style={pos}
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
              <div
                key={n.id}
                className={`notif-item ${!n.read ? 'notif-item--unread' : ''} ${(navPathFor(n) || n.type === 'dm') ? 'notif-item--clickable' : ''}`}
                onClick={() => handleItemClick(n)}
              >
                <span className="notif-icon">{TYPE_ICON[n.type] ?? TYPE_ICON.default}</span>
                <div className="notif-body">
                  <span className="notif-text">{formatNotif(n)}</span>
                  <span className="notif-time">{timeAgo(n.created_at)}</span>
                  {n.type === 'friend_request' && (
                    <div className="notif-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="notif-action notif-action--accept"
                        disabled={resolving === n.id}
                        onClick={() => respond(n, 'accept')}
                      >Accept</button>
                      <button
                        className="notif-action notif-action--decline"
                        disabled={resolving === n.id}
                        onClick={() => respond(n, 'decline')}
                      >Decline</button>
                    </div>
                  )}
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
