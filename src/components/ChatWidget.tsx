import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  fetchConversations, fetchThread, sendMessage, markThreadRead,
  type Conversation, type DirectMessage,
} from '../api/messages'
import { getPublicProfiles, type PublicProfile } from '../identity/api'
import { displayName } from '../identity/archetypes'
import { useIdentity } from '../identity/IdentityProvider'
import './ChatWidget.css'

const POLL_MS = 6000

interface Props {
  open: boolean
  partner: string | null
  anchorRect?: DOMRect | null
  onOpenChange: (open: boolean) => void
  onPartnerChange: (partner: string | null) => void
}

// Your direct messages (rendered for members only)
export function ChatWidget({ open, partner, anchorRect, onOpenChange, onPartnerChange }: Props) {
  const address = useIdentity().memberWallet ?? ''
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({})
  const [thread, setThread] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const panelRef     = useRef<HTMLDivElement>(null)

  // Click-outside to close when in popup mode
  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  useEffect(() => {
    if (!open || !anchorRect) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, anchorRect, close])

  // Conversation list — always polling (drives the unread badge even when collapsed)
  useEffect(() => {
    let stop = false
    const load = () => {
      fetchConversations().then(async d => {
        if (stop) return
        setConversations(d.items)
        setUnreadTotal(d.unread_total)
        const wallets = d.items.map(i => i.partner)
        if (partner && !wallets.includes(partner)) wallets.push(partner)
        if (wallets.length) setProfiles(await getPublicProfiles(wallets))
      })
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [address, partner])

  // Active thread — poll only while open and a partner is selected
  useEffect(() => {
    if (!open || !partner) return
    let stop = false
    const load = () => {
      fetchThread(partner).then(rows => { if (!stop) setThread(rows) })
    }
    load()
    markThreadRead(partner)
    const id = setInterval(load, POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [address, partner, open])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [thread])

  const handleSend = async () => {
    if (!partner || !draft.trim() || sending) return
    setSending(true)
    try {
      const msg = await sendMessage(partner, draft.trim())
      setThread(prev => [...prev, msg])
      setDraft('')
    } catch { /* ignore */ } finally { setSending(false) }
  }

  function profileFor(wallet: string) {
    const p = profiles[wallet]
    return p ? displayName(p) : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
  }

  if (!open) return null

  const popupStyle: React.CSSProperties | undefined = anchorRect ? {
    top:   anchorRect.bottom + 8,
    right: window.innerWidth - anchorRect.right,
    left:  'unset',
    height: 460,
    width:  340,
  } : undefined

  return (
    <div
      ref={panelRef}
      className={`chatw-panel${anchorRect ? ' chatw-panel--popup' : ''}`}
      style={popupStyle}
    >
      <div className="chatw-header">
        {partner ? (
          <>
            <button className="chatw-back" onClick={() => onPartnerChange(null)}>←</button>
            <span className="chatw-header-title">{profileFor(partner)}</span>
          </>
        ) : (
          <span className="chatw-header-title">Messages</span>
        )}
        <button className="chatw-close" onClick={() => onOpenChange(false)}>✕</button>
      </div>

      {!partner ? (
        <div className="chatw-list">
          {conversations.length === 0 ? (
            <p className="chatw-empty">No conversations yet.</p>
          ) : conversations.map(c => (
            <button key={c.partner} className="chatw-convo" onClick={() => onPartnerChange(c.partner)}>
              <span className="chatw-convo-name">{profileFor(c.partner)}</span>
              <span className="chatw-convo-preview">{c.last_message?.body ?? ''}</span>
              {c.unread_count > 0 && <span className="chatw-convo-unread">{c.unread_count}</span>}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="chatw-thread">
            {thread.map(m => (
              <div key={m.id} className={`chatw-bubble-msg ${m.from_wallet === address ? 'chatw-bubble-msg--mine' : ''}`}>
                {m.body}
              </div>
            ))}
            <div ref={threadEndRef} />
          </div>
          <div className="chatw-composer">
            <input
              className="chatw-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
              placeholder="Type a message…"
              autoFocus
            />
            <button className="chatw-send-btn" onClick={handleSend} disabled={sending || !draft.trim()}>Send</button>
          </div>
        </>
      )}
    </div>
  )
}
