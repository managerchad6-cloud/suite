import { useEffect, useRef, useState } from 'react'
import { sendChat, WS_URL } from '../api/livestream'
import { subscribeOrchestrator, type ChatStage, type ChatStatus } from '../api/ws'
import { ApiError } from '../api/client'
import { MemberGate } from '../identity/gate'
import { ACTIONS, StreamActions, useMemeVoting, type ActionTab } from './live/StreamActions'

// The input clears as soon as you press send and never locks. Each message gets a "Sending
// message…" bar that fills on its own and completes once the stream's director has picked the
// message up ('chat:status' past the overlay/inbox stages); what happens after that is the show.
//
// Everything else a viewer can put on stream (memes, ideas, videos, list votes) sits behind the
// "+" (like attachments in a messenger), or a "/" command typed in the box.

interface Sent {
  key: number
  id: string | null
  text: string
  state: 'sending' | 'done' | 'failed'
  note?: string
}

type Target = 'auto' | 'chad' | 'virgin'

/** Stages that mean the director has taken the message into the pipeline */
const PICKED_UP = new Set<ChatStage>(['held', 'forming', 'ready', 'on-air', 'dropped'])
const DONE_FADE_MS = 700        // matches the .chat-sent--done transition
const FAILED_SHOW_MS = 5000
const GIVE_UP_MS = 90_000       // no word from the stream (socket down): finish the bar anyway
const MAX_SHOWN = 3

const TARGETS: { id: Target; label: string; img?: string }[] = [
  { id: 'auto',   label: 'Whoever fits' },
  { id: 'chad',   label: 'Chad',   img: '/assets/chars/chad.png' },
  { id: 'virgin', label: 'Virgin', img: '/assets/chars/virgin.png' },
]

/** "/" commands: open a tab of the actions modal (with the rest of the line as a draft) or pick who answers */
const COMMANDS: { cmd: string; hint: string; tab?: ActionTab; target?: Target }[] = [
  { cmd: '/meme',       hint: 'Put a Virgin vs Chad meme on stream', tab: 'meme' },
  { cmd: '/suggestion', hint: 'Pitch an idea to the show',           tab: 'idea' },
  { cmd: '/video',      hint: 'Queue a YouTube video',               tab: 'video' },
  { cmd: '/chad',       hint: 'Talk to Chad',                        target: 'chad' },
  { cmd: '/virgin',     hint: 'Talk to Virgin',                      target: 'virgin' },
]

export function ChatInput() {
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState<Sent[]>([])
  const [target, setTarget] = useState<Target>('auto')
  const [sheet, setSheet] = useState(false)
  const [modal, setModal] = useState<{ tab: ActionTab; draft?: string } | null>(null)
  const [cmdIndex, setCmdIndex] = useState(0)
  const voting = useMemeVoting()
  const sentRef = useRef(sent)
  sentRef.current = sent
  const nextKey = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  // Pick-ups that arrived before POST /api/chat returned the id
  const early = useRef(new Set<string>())

  // The "/" menu: while the first word is a command being typed
  const slash = msg.startsWith('/') && !/\s/.test(msg) ? COMMANDS.filter(c => c.cmd.startsWith(msg.toLowerCase())) : []

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

  // Close the "+" sheet on an outside click or Escape
  useEffect(() => {
    if (!sheet) return
    const onDown = (e: MouseEvent) => { if (!sheetRef.current?.contains(e.target as Node)) setSheet(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [sheet])

  useEffect(() => setCmdIndex(0), [msg])

  const openTab = (tab: ActionTab, draft?: string) => { setSheet(false); setModal({ tab, draft }) }

  const runCommand = (c: (typeof COMMANDS)[number], rest = '') => {
    setMsg('')
    if (c.target) { setTarget(c.target); setMsg(rest); inputRef.current?.focus() }
    else if (c.tab) openTab(c.tab, rest || undefined)
  }

  const handleSend = async () => {
    const raw = msg.trim()
    if (!raw) return
    // "/meme virgin x vs chad y" and friends open the matching form, filled in
    const typed = raw.match(/^(\/\S+)\s*(.*)$/s)
    const command = typed && COMMANDS.find(c => c.cmd === typed[1].toLowerCase())
    if (typed && command) return runCommand(command, typed[2])

    const text = raw
    const voice = target === 'auto' ? undefined : target
    const key = nextKey.current++
    setMsg('')
    setSent((list) => [...list, { key, id: null, text: voice ? `→ ${voice === 'chad' ? 'Chad' : 'Virgin'}: ${text}` : text, state: 'sending' as const }].slice(-MAX_SHOWN))
    setTimeout(() => finish(key), GIVE_UP_MS)
    try {
      const res = await sendChat(text, voice)
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slash.length === 0) {
      if (e.key === 'Backspace' && !msg && target !== 'auto') setTarget('auto')
      // Escape hands the keyboard back to the stream (its shortcuts work again; typing comes back here)
      if (e.key === 'Escape') { inputRef.current?.blur(); inputRef.current?.closest<HTMLElement>('.live-center')?.focus() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIndex(i => (i + 1) % slash.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCmdIndex(i => (i - 1 + slash.length) % slash.length) }
    else if (e.key === 'Tab' || (e.key === 'Enter' && slash[cmdIndex])) { e.preventDefault(); runCommand(slash[cmdIndex]) }
    else if (e.key === 'Escape') setMsg('')
  }

  const targetInfo = TARGETS.find(t => t.id === target)!

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

      <div className="chat-composer">
        <div className="chat-plus-wrap" ref={sheetRef}>
          <button type="button" className={`chat-plus${sheet ? ' chat-plus--open' : ''}`} onClick={() => setSheet(s => !s)}
            aria-label="Add to the stream" aria-expanded={sheet} title="Memes, ideas, videos and votes">
            <span className="chat-plus-icon" aria-hidden>+</span>
            {voting.state === 'voting' && !sheet && <span className="chat-plus-badge">VOTE</span>}
          </button>

          {sheet && (
            <div className="chat-sheet" role="menu">
              <div className="chat-sheet-grid">
                {ACTIONS.filter(a => a.id !== 'lists').map(a => (
                  <button key={a.id} type="button" role="menuitem" className={`chat-sheet-tile chat-sheet-tile--${a.id}`} onClick={() => openTab(a.id)}>
                    <span className="chat-sheet-icon" aria-hidden>{a.icon}</span>
                    <span className="chat-sheet-label">{a.label}</span>
                    <span className="chat-sheet-hint">{a.hint}</span>
                    {a.id === 'meme' && voting.state === 'voting' && <span className="chat-sheet-live">Voting now</span>}
                  </button>
                ))}
              </div>
              <div className="chat-sheet-talk">
                <span className="chat-sheet-talk-label">Talk to</span>
                {TARGETS.map(t => (
                  <button key={t.id} type="button" className={`chat-target-opt${target === t.id ? ' chat-target-opt--on' : ''}`}
                    onClick={() => { setTarget(t.id); setSheet(false); inputRef.current?.focus() }}>
                    {t.img && <img src={t.img} alt="" />}{t.label}
                  </button>
                ))}
              </div>
              <div className="chat-sheet-foot">Tip: type <kbd>/</kbd> in the chat for shortcuts</div>
            </div>
          )}
        </div>

        <MemberGate reason="chat with the stream" className="chat-input-gate">
          <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); handleSend() }}>
            <div className={`chat-field${target !== 'auto' ? ` chat-field--${target}` : ''}`}>
              {target !== 'auto' && (
                <button type="button" className="chat-target-chip" onClick={() => setTarget('auto')} title="Back to whoever fits">
                  {targetInfo.img && <img src={targetInfo.img} alt="" />}{targetInfo.label}<span aria-hidden>×</span>
                </button>
              )}
              <input
                ref={inputRef}
                className="chat-input"
                placeholder={target === 'auto' ? "Say something… they're listening  ( / for commands )" : `Say something to ${targetInfo.label}…`}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={300}
                enterKeyHint="send"
                aria-autocomplete="list"
              />
            </div>
            <button type="submit" className="chat-send-btn" disabled={!msg.trim()}>
              ▶ SEND
            </button>
          </form>
        </MemberGate>

        {slash.length > 0 && (
          <ul className="chat-cmds" role="listbox">
            {slash.map((c, i) => (
              <li key={c.cmd} role="option" aria-selected={i === cmdIndex}
                className={`chat-cmd${i === cmdIndex ? ' chat-cmd--on' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); runCommand(c) }} onMouseEnter={() => setCmdIndex(i)}>
                <code>{c.cmd}</code><span>{c.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <StreamActions tab={modal.tab} draft={modal.draft} voting={voting}
          onTab={(tab) => setModal({ tab })} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
