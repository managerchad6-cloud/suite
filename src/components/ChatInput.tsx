import { useEffect, useRef, useState } from 'react'
import { sendChat, WS_URL } from '../api/livestream'
import { subscribeOrchestrator, type ChatStage, type ChatStatus } from '../api/ws'
import { ApiError } from '../api/client'
import { MemberGate } from '../identity/gate'

// The input clears as soon as you press send and never locks. Each message gets a "Sending
// message…" bar that fills on its own and completes once the stream's director has picked the
// message up ('chat:status' past the overlay/inbox stages); what happens after that is the show.

interface Sent {
  key: number
  id: string | null
  text: string
  state: 'sending' | 'done' | 'failed'
  note?: string
}

/** Stages that mean the director has taken the message into the pipeline */
const PICKED_UP = new Set<ChatStage>(['held', 'forming', 'ready', 'on-air', 'dropped'])
const DONE_FADE_MS = 700        // matches the .chat-sent--done transition
const FAILED_SHOW_MS = 5000
const GIVE_UP_MS = 90_000       // no word from the stream (socket down): finish the bar anyway
const MAX_SHOWN = 3

export function ChatInput() {
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState<Sent[]>([])
  const sentRef = useRef(sent)
  sentRef.current = sent
  const nextKey = useRef(0)
  // Pick-ups that arrived before POST /api/chat returned the id
  const early = useRef(new Set<string>())

  const remove = (key: number) => setSent((list) => list.filter((s) => s.key !== key))

  const finish = (key: number) => {
    setSent((list) => list.map((s) => (s.key === key && s.state === 'sending' ? { ...s, state: 'done' } : s)))
    setTimeout(() => remove(key), DONE_FADE_MS)
  }

  useEffect(() => subscribeOrchestrator(WS_URL, (m) => {
    if (m.event !== 'chat:status') return
    const st = m.data as ChatStatus
    if (!PICKED_UP.has(st.stage)) return
    const mine = sentRef.current.find((s) => s.id === st.id)
    if (mine) return finish(mine.key)
    early.current.add(st.id)
    if (early.current.size > 50) early.current.delete(early.current.values().next().value!)
  }), [])

  const handleSend = async () => {
    const text = msg.trim()
    if (!text) return
    const key = nextKey.current++
    setMsg('')
    setSent((list) => [...list, { key, id: null, text, state: 'sending' as const }].slice(-MAX_SHOWN))
    setTimeout(() => finish(key), GIVE_UP_MS)
    try {
      const res = await sendChat(text)
      const id = res?.id ?? null
      // Filtered, or a chat server without status events: nothing more to wait for
      if (res?.filtered || !id) return finish(key)
      setSent((list) => list.map((s) => (s.key === key ? { ...s, id } : s)))
      if (early.current.delete(id)) finish(key)
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      const note = status === 429 ? 'Slow down — a few messages a minute'
        : status === 401 || status === 403 ? 'Join to chat with the stream'
        : 'Couldn’t send — try again'
      setSent((list) => list.map((s) => (s.key === key ? { ...s, state: 'failed', note } : s)))
      setTimeout(() => remove(key), FAILED_SHOW_MS)
      setMsg((cur) => cur || text) // give the text back so it can be resent
    }
  }

  return (
    <div className="chat-input-wrap">
      {sent.length > 0 && (
        <ul className="chat-sent" aria-live="polite">
          {sent.map((s) => (
            <li key={s.key} className={`chat-sent-item chat-sent--${s.state}`}>
              <div className="chat-sent-row">
                <span className="chat-sent-text">{s.text}</span>
                <span className="chat-sent-stage">{s.state === 'failed' ? s.note : 'Sending message…'}</span>
              </div>
              {s.state !== 'failed' && <div className="chat-sent-bar"><span /></div>}
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
