import { useEffect, useRef, useState } from 'react'
import { sendChat, WS_URL } from '../api/livestream'
import { subscribeOrchestrator, type ChatStage, type ChatStatus } from '../api/ws'
import { ApiError } from '../api/client'
import { MemberGate } from '../identity/gate'

// The input clears as soon as you press send and never locks; each message you sent shows where
// it is (on screen → being voiced → up next → on air) from the stream's 'chat:status' events.

type Stage = 'sending' | ChatStage | 'failed'

interface Sent {
  key: number
  id: string | null
  text: string
  stage: Stage
  note?: string
  /** For 'ready': when the reply is expected on air */
  dueAt?: number
  /** Finished messages linger this long, then go */
  expiresAt?: number
}

// Later stages never go back to earlier ones (events can arrive out of order)
const ORDER: Record<Stage, number> = {
  sending: 0, shown: 1, review: 2, held: 2, forming: 3, ready: 4, 'on-air': 5, dropped: 5, failed: 5,
}
const DONE = new Set<Stage>(['on-air', 'dropped', 'failed'])
const KEEP_DONE_MS = 8000
const MAX_SHOWN = 3

function label(s: Sent, now: number): string {
  switch (s.stage) {
    case 'sending': return 'Sending…'
    case 'shown': return 'On screen · writing a reply'
    case 'review': return 'On screen · waiting for the director'
    case 'held': return 'On screen · after the video reaction'
    case 'forming': return 'Voicing the reply…'
    case 'ready': {
      const secs = s.dueAt ? Math.max(0, Math.round((s.dueAt - now) / 1000)) : 0
      return secs > 0 ? `Up next · ~${secs}s` : 'Up next'
    }
    case 'on-air': return 'On air now'
    case 'dropped': return s.note ?? 'Not picked up'
    case 'failed': return s.note ?? 'Couldn’t send'
  }
}

function dropNote(reason?: string): string {
  if (reason === 'rate_limit' || reason === 'busy') return 'Chat is busy — try again in a bit'
  if (reason === 'duplicate') return 'Already said recently'
  return 'Filtered out'
}

function advance(s: Sent, stage: Stage, extra: Partial<Sent> = {}): Sent {
  if (ORDER[stage] < ORDER[s.stage]) return s
  return { ...s, ...extra, stage, expiresAt: DONE.has(stage) ? Date.now() + KEEP_DONE_MS : undefined }
}

function applyStatus(s: Sent, st: ChatStatus): Sent {
  return advance(s, st.stage, {
    note: st.stage === 'dropped' ? dropNote(st.reason) : s.note,
    dueAt: st.stage === 'ready' ? Date.now() + (st.queueMs ?? 0) : s.dueAt,
  })
}

export function ChatInput() {
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState<Sent[]>([])
  const [now, setNow] = useState(Date.now())
  const nextKey = useRef(0)
  // Statuses that arrived before POST /api/chat returned the id
  const early = useRef(new Map<string, ChatStatus>())

  useEffect(() => subscribeOrchestrator(WS_URL, (m) => {
    if (m.event !== 'chat:status') return
    const st = m.data as ChatStatus
    setSent((list) => {
      if (!list.some((s) => s.id === st.id)) {
        const prev = early.current.get(st.id)
        if (!prev || ORDER[st.stage] >= ORDER[prev.stage]) early.current.set(st.id, st)
        if (early.current.size > 50) early.current.delete(early.current.keys().next().value!)
        return list
      }
      return list.map((s) => (s.id === st.id ? applyStatus(s, st) : s))
    })
  }), [])

  // Tick countdowns; finished messages leave after a few seconds
  const active = sent.length > 0
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      setSent((list) => {
        const kept = list.filter((s) => !s.expiresAt || n < s.expiresAt)
        return kept.length === list.length ? list : kept
      })
    }, 1000)
    return () => clearInterval(t)
  }, [active])

  const update = (key: number, fn: (s: Sent) => Sent) =>
    setSent((list) => list.map((s) => (s.key === key ? fn(s) : s)))

  const handleSend = async () => {
    const text = msg.trim()
    if (!text) return
    const key = nextKey.current++
    setMsg('')
    setSent((list) => [...list, { key, id: null, text, stage: 'sending' as Stage }].slice(-MAX_SHOWN))
    try {
      const res = await sendChat(text)
      if (res?.filtered) return update(key, (s) => advance(s, 'dropped', { note: dropNote('busy') }))
      const id = res?.id ?? null
      // A chat server without status events: it's delivered, nothing more to follow
      if (!id) return update(key, (s) => ({ ...advance(s, 'shown'), expiresAt: Date.now() + KEEP_DONE_MS }))
      update(key, (s) => {
        let next = advance({ ...s, id }, 'shown')
        const st = early.current.get(id)
        if (st) { next = applyStatus(next, st); early.current.delete(st.id) }
        return next
      })
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      const note = status === 429 ? 'Slow down — a few messages a minute'
        : status === 401 || status === 403 ? 'Join to chat with the stream'
        : 'Couldn’t send — try again'
      update(key, (s) => advance(s, 'failed', { note }))
      setMsg((cur) => cur || text) // give the text back so it can be resent
    }
  }

  return (
    <div className="chat-input-wrap">
      {sent.length > 0 && (
        <ul className="chat-sent" aria-live="polite">
          {sent.map((s) => (
            <li key={s.key} className={`chat-sent-item chat-sent--${s.stage}`}>
              <span className="chat-sent-text">{s.text}</span>
              <span className="chat-sent-stage">{label(s, now)}</span>
            </li>
          ))}
        </ul>
      )}
      <MemberGate reason="chat with the stream">
        <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); handleSend() }}>
          <input
            className="chat-input"
            placeholder="Say something… they're listening"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            maxLength={300}
            enterKeyHint="send"
          />
          <button type="submit" className="chat-send-btn" disabled={!msg.trim()}>
            ▶ SEND
          </button>
        </form>
      </MemberGate>
    </div>
  )
}
