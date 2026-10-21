import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchTrollHistory, sendTroll, deleteTroll, muteTroll, subscribeTrollbox, MAX_LEN,
  type TrollMessage, type TrollHistory,
} from '../api/trollbox'
import { ApiError } from '../api/client'
import { bestImage, getPublicProfiles, type PublicProfile } from '../identity/api'
import { displayName } from '../identity/archetypes'
import { useIdentity } from '../identity/IdentityProvider'
import { MemberGate } from '../identity/gate'
import { truncateAddress } from '../wallet'
import './Trollbox.css'

const OPEN_KEY = 'vvc:trollbox-open'
const KEEP = 300                       // messages held in memory
const NEAR_BOTTOM_PX = 80
const SUITE_LINK = /(https?:\/\/(?:suite\.)?virginvschad\.vip\/?[^\s]*)/gi

const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }
const writeOpen = (v: boolean) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* private mode */ } }
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Merge new messages in by id, oldest first, capped. */
function merge(list: TrollMessage[], add: TrollMessage[]): TrollMessage[] {
  const byId = new Map(list.map(m => [m.id, m]))
  for (const m of add) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-KEEP)
}

// The trollbox: one room for everyone in the suite. Guests read along; members talk.
export function Trollbox() {
  const navigate = useNavigate()
  const { memberWallet } = useIdentity()
  const [open, setOpenState] = useState(readOpen)
  const [messages, setMessages] = useState<TrollMessage[]>([])
  const [more, setMore] = useState(false)
  const [online, setOnline] = useState(0)
  const [live, setLive] = useState(true)
  const [you, setYou] = useState<TrollHistory['you']>(null)
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({})
  const [unread, setUnread] = useState(0)
  const [below, setBelow] = useState(0)          // new messages while scrolled up
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef(open)
  const stickRef = useRef(true)                    // follow new messages (we're at the bottom)
  const restoreRef = useRef<number | null>(null)   // scrollHeight before older messages were prepended

  const setOpen = useCallback((v: boolean) => {
    openRef.current = v
    setOpenState(v)
    writeOpen(v)
    if (v) { setUnread(0); stickRef.current = true }
  }, [])

  // While open, Zad steps aside (Trollbox.css) so he doesn't sit on the send button
  useEffect(() => {
    document.documentElement.classList.toggle('trollbox-open', open)
    return () => document.documentElement.classList.remove('trollbox-open')
  }, [open])

  // History (again when who you are changes: admin/muted come with it)
  useEffect(() => {
    let stop = false
    fetchTrollHistory().then(h => {
      if (stop) return
      setMessages(prev => merge(prev, h.items))
      setMore(h.more)
      setOnline(h.online)
      setYou(h.you)
    }).catch(() => {})
    return () => { stop = true }
  }, [memberWallet])

  // Live
  useEffect(() => subscribeTrollbox(e => {
    if (e.type === 'message') {
      setMessages(prev => merge(prev, [e.message]))
      if (!openRef.current) setUnread(n => n + 1)
      else if (!stickRef.current) setBelow(n => n + 1)
    } else if (e.type === 'delete') {
      setMessages(prev => prev.filter(m => m.id !== e.id))
    } else if (e.type === 'online') {
      setOnline(e.count)
    } else if (e.type === 'connection') {
      setLive(e.live)
    }
  }), [])

  // Who's talking: profiles in batches, each wallet asked once (non-members have none)
  const askedRef = useRef(new Set<string>())
  useEffect(() => {
    const missing = [...new Set(messages.map(m => m.wallet).filter((w): w is string => !!w && !askedRef.current.has(w)))]
    if (!missing.length) return
    missing.forEach(w => askedRef.current.add(w))
    getPublicProfiles(missing).then(found => { if (Object.keys(found).length) setProfiles(p => ({ ...p, ...found })) })
  }, [messages])

  // Keep the view where it belongs: at the bottom when following, in place after loading older ones
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || !open) return
    if (restoreRef.current !== null) {
      el.scrollTop = el.scrollHeight - restoreRef.current
      restoreRef.current = null
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, open])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (stickRef.current) setBelow(0)
    if (el.scrollTop < 40 && more && restoreRef.current === null && messages.length) {
      restoreRef.current = el.scrollHeight
      fetchTrollHistory(messages[0].id).then(h => {
        setMore(h.more)
        setMessages(prev => [...h.items.filter(m => !prev.some(p => p.id === m.id)), ...prev])
      }).catch(() => { restoreRef.current = null })
    }
  }

  const jumpDown = () => {
    stickRef.current = true
    setBelow(0)
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const m = await sendTroll(body)
      setDraft('')
      stickRef.current = true
      setMessages(prev => merge(prev, [m]))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'muted') {
        setYou(y => (y ? { ...y, muted_until: String(err.data.muted_until ?? '') || null } : y))
      }
      setError(err instanceof ApiError ? err.message : 'Could not send')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const remove = (id: number) => { deleteTroll(id).catch(err => setError(err instanceof ApiError ? err.message : 'Could not delete')) }
  const mute = (wallet: string) => {
    if (!window.confirm(`Mute ${truncateAddress(wallet)} for 1 hour?`)) return
    muteTroll(wallet, 60).catch(err => setError(err instanceof ApiError ? err.message : 'Could not mute'))
  }

  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 4000); return () => clearTimeout(t) } }, [error])

  // Suite links in a message open in place
  const renderBody = (body: string): ReactNode[] =>
    body.split(SUITE_LINK).map((part, i) => {
      if (i % 2 === 0) return part
      let path = '/'
      try { const u = new URL(part); path = u.hostname.startsWith('suite.') ? u.pathname + u.search : '' } catch { /* not a url */ }
      return path
        ? <a key={i} href={path} onClick={e => { e.preventDefault(); navigate(path) }}>{part}</a>
        : <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    })

  const mutedUntil = you?.muted_until && new Date(you.muted_until) > new Date() ? you.muted_until : null

  if (!open) {
    return (
      <button className="trollbox-tab" onClick={() => setOpen(true)} title="Open the trollbox">
        <span className="trollbox-tab-icon" aria-hidden>💬</span>
        <span className="trollbox-tab-label">TROLLBOX</span>
        {online > 0 && <span className="trollbox-tab-online"><i />{online}</span>}
        {unread > 0 && <span className="trollbox-tab-unread">{unread > 99 ? '99+' : unread}</span>}
      </button>
    )
  }

  return (
    <aside className="trollbox" aria-label="Trollbox">
      <header className="trollbox-head">
        <span className="trollbox-title">TROLLBOX</span>
        <span className={`trollbox-online${live ? '' : ' trollbox-online--off'}`} title={live ? 'Live' : 'Reconnecting…'}>
          <i />{live ? `${online} here` : 'reconnecting…'}
        </span>
        <button className="trollbox-close" onClick={() => setOpen(false)} aria-label="Close the trollbox">✕</button>
      </header>

      <div className="trollbox-list" ref={listRef} onScroll={onScroll}>
        {more && <div className="trollbox-more">Scroll up for older messages</div>}
        {!messages.length && <div className="trollbox-empty">Nobody's said anything yet. Be first.</div>}
        {messages.map((m, i) => {
          if (m.kind === 'system') return <div key={m.id} className="trollbox-system">{m.body}</div>
          const w = m.wallet!
          const p = profiles[w]
          const prev = messages[i - 1]
          const grouped = prev?.wallet === w && prev.kind === 'user' && Date.parse(m.created_at) - Date.parse(prev.created_at) < 120_000
          return (
            <div key={m.id} className={`trollbox-msg${grouped ? ' trollbox-msg--grouped' : ''}${w === memberWallet ? ' trollbox-msg--mine' : ''}`}>
              {!grouped && (
                <button className="trollbox-author" onClick={() => navigate(`/u/${encodeURIComponent(w)}`)} title={w}>
                  {p ? <img src={bestImage(p)} alt="" /> : <span className="trollbox-av-fb">{w.slice(0, 2).toUpperCase()}</span>}
                  <span className="trollbox-name">{p ? displayName(p) : truncateAddress(w)}</span>
                  <time dateTime={m.created_at}>{clock(m.created_at)}</time>
                </button>
              )}
              <div className="trollbox-body" title={grouped ? clock(m.created_at) : undefined}>{renderBody(m.body)}</div>
              {you?.admin && (
                <span className="trollbox-mod">
                  <button onClick={() => remove(m.id)} title="Delete message">🗑</button>
                  {w !== memberWallet && <button onClick={() => mute(w)} title="Mute for 1 hour">🔇</button>}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {below > 0 && <button className="trollbox-below" onClick={jumpDown}>↓ {below} new</button>}

      <MemberGate reason="chat" className="trollbox-compose">
        {mutedUntil ? (
          <div className="trollbox-muted">🔇 You're muted until {clock(mutedUntil)}</div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void send() }}>
            <input
              ref={inputRef}
              className="trollbox-input"
              value={draft}
              maxLength={MAX_LEN}
              placeholder="Say something…"
              onChange={e => setDraft(e.target.value)}
            />
            <button type="submit" className="trollbox-send" disabled={!draft.trim() || sending} aria-label="Send">➤</button>
          </form>
        )}
        {draft.length > MAX_LEN - 40 && <span className="trollbox-count">{MAX_LEN - draft.length}</span>}
        {error && <div className="trollbox-error" role="alert">{error}</div>}
      </MemberGate>
    </aside>
  )
}
