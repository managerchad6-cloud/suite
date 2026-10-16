// Everything a viewer can put into the stream, behind the chat's "+": one modal with a tab per
// input (meme, idea, YouTube video, on-stream lists). Each tab is a form on top and the live queue
// you can vote on below it. Browsing is open to everyone; submitting and voting are for members.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getMemeIntake, voteMeme, submitMemeToLivestream,
  getSuggestions, voteOnSuggestion, submitSuggestion,
  getYtQueue, submitYtVideo, voteYtQueue,
  getLists, voteList,
  WS_URL,
  type Suggestion, type YtQueueItem, type StreamLists,
} from '../../api/livestream'
import { subscribeOrchestrator, type MemeIntakeState, type MemeVoteItem } from '../../api/ws'
import { ApiError } from '../../api/client'
import { MemberGate, useMemberGate } from '../../identity/gate'
import './live-actions.css'

export type ActionTab = 'meme' | 'idea' | 'video' | 'lists'

export const ACTIONS: { id: ActionTab; icon: string; label: string; hint: string }[] = [
  { id: 'meme',  icon: '🎭', label: 'Meme',    hint: 'Put a Virgin vs Chad on stream' },
  { id: 'idea',  icon: '💡', label: 'Idea',    hint: 'Pitch something to the show' },
  { id: 'video', icon: '▶',  label: 'YouTube', hint: 'Queue a video to react to' },
  { id: 'lists', icon: '🗳', label: 'Lists',   hint: 'Vote on the on-stream lists' },
]

const errText = (e: unknown, fallback: string) => {
  if (e instanceof ApiError && e.status === 429) return 'Slow down a little, try again in a minute.'
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return 'Join to take part.'
  return e instanceof Error && e.message ? e.message : fallback
}

// ── Meme voting state, shared with the composer (badge on the "+") ─────────────────────────────

export interface MemeVoting { pool: MemeVoteItem[]; state: 'idle' | 'voting' | 'rolling'; endsAt: number | null }

export function useMemeVoting(): MemeVoting {
  const [v, setV] = useState<MemeVoting>({ pool: [], state: 'idle', endsAt: null })
  useEffect(() => {
    const apply = (d: MemeIntakeState | null) => {
      if (!d) return
      setV({ pool: d.mimo?.pool ?? [], state: d.mimo?.votingState ?? 'idle', endsAt: d.mimo?.countdownEndsAt ?? null })
    }
    getMemeIntake().then(apply)
    return subscribeOrchestrator(WS_URL, msg => {
      if (msg.event === 'meme:intake-update') apply((msg as { event: string; data: MemeIntakeState }).data)
    })
  }, [])
  return v
}

function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endsAt) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [endsAt])
  return endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : null
}

// ── The modal ──────────────────────────────────────────────────────────────────────────────────

interface Props {
  tab: ActionTab
  onTab: (t: ActionTab) => void
  onClose: () => void
  voting: MemeVoting
  /** Text typed after a slash command, to start the form with */
  draft?: string
}

export function StreamActions({ tab, onTab, onClose, voting, draft }: Props) {
  const [lists, setLists] = useState<StreamLists>({ videos: [], roadmap: [] })
  const hasLists = lists.videos.length + lists.roadmap.length > 0
  const reloadLists = useCallback(() => getLists().then(setLists), [])
  useEffect(() => { reloadLists() }, [reloadLists])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs = ACTIONS.filter(a => a.id !== 'lists' || hasLists || tab === 'lists')

  return (
    <div className="lsa-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lsa-modal" role="dialog" aria-modal="true" aria-label="Add to the stream">
        <div className="lsa-grabber" aria-hidden />
        <div className="lsa-head">
          <span className="lsa-title">Add to the stream</span>
          <button className="lsa-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="lsa-tabs" role="tablist">
          {tabs.map(a => (
            <button key={a.id} role="tab" aria-selected={tab === a.id}
              className={`lsa-tab lsa-tab--${a.id}${tab === a.id ? ' lsa-tab--on' : ''}`} onClick={() => onTab(a.id)}>
              <span className="lsa-tab-icon" aria-hidden>{a.icon}</span>{a.label}
              {a.id === 'meme' && voting.state === 'voting' && <span className="lsa-live-dot" title="Voting now" />}
            </button>
          ))}
        </div>
        <div className="lsa-body">
          {tab === 'meme'  && <MemeTab voting={voting} draft={draft} />}
          {tab === 'idea'  && <IdeaTab draft={draft} />}
          {tab === 'video' && <VideoTab draft={draft} />}
          {tab === 'lists' && <ListsTab lists={lists} reload={reloadLists} />}
        </div>
      </div>
    </div>
  )
}

function Sent({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return <div className={`lsa-flash${msg.ok ? ' lsa-flash--ok' : ' lsa-flash--err'}`} role="status">{msg.text}</div>
}

function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(t.current), [])
  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    clearTimeout(t.current)
    t.current = setTimeout(() => setMsg(null), ok ? 3500 : 6000)
  }
  return [msg, flash] as const
}

// ── Meme ───────────────────────────────────────────────────────────────────────────────────────

/** "virgin X vs chad Y" typed in one go → the two sides */
function splitMeme(text: string): [string, string] {
  const m = text.match(/^\s*(?:virgin\s+)?(.*?)\s+vs\.?\s+(?:chad\s+)?(.*)$/i)
  return m ? [m[1], m[2]] : [text, '']
}

function MemeTab({ voting, draft }: { voting: MemeVoting; draft?: string }) {
  const gate = useMemberGate()
  const [[virgin, chad], setSides] = useState<[string, string]>(() => (draft ? splitMeme(draft) : ['', '']))
  const [busy, setBusy] = useState(false)
  const [msg, flash] = useFlash()
  const [votingFor, setVotingFor] = useState<number | null>(null)
  const left = useCountdown(voting.state === 'voting' ? voting.endsAt : null)
  const ready = virgin.trim() && chad.trim()
  const text = `virgin ${virgin.trim()} vs chad ${chad.trim()}`

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      const r = await submitMemeToLivestream(text)
      setSides(['', ''])
      flash(true, r?.voting ? 'In the vote pool. Get people to vote for it! 🗳' : 'Sent to the meme machine 🎭 Watch the stream.')
    } catch (e) { flash(false, errText(e, 'Could not send the meme.')) } finally { setBusy(false) }
  }

  const vote = async (n: number) => {
    if (votingFor !== null) return
    setVotingFor(n)
    try { await voteMeme(n) } catch (e) { flash(false, errText(e, 'Vote not counted.')) } finally { setVotingFor(null) }
  }

  return (
    <>
      <MemberGate reason="put a meme on stream" className="lsa-form">
        <form onSubmit={e => { e.preventDefault(); submit() }}>
          <div className="lsa-vs">
            <label className="lsa-side lsa-side--virgin">
              <span className="lsa-side-tag">VIRGIN</span>
              <textarea value={virgin} onChange={e => setSides([e.target.value, chad])} placeholder="drinks oat latte, journals about it"
                maxLength={180} rows={3} autoFocus />
            </label>
            <span className="lsa-vs-badge" aria-hidden>VS</span>
            <label className="lsa-side lsa-side--chad">
              <span className="lsa-side-tag">CHAD</span>
              <textarea value={chad} onChange={e => setSides([virgin, e.target.value])} placeholder="black coffee, forgets it's there"
                maxLength={180} rows={3}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} />
            </label>
          </div>
          <div className="lsa-actions">
            <span className="lsa-preview">{ready ? <>On stream: <em>Virgin {virgin.trim()}</em> vs <em>Chad {chad.trim()}</em></> : 'Fill both sides. Specific beats generic.'}</span>
            <button className="lsa-submit" disabled={!ready || busy}>{busy ? 'Sending…' : 'Send meme'}</button>
          </div>
        </form>
      </MemberGate>
      <Sent msg={msg} />

      <section className="lsa-queue">
        <header className="lsa-queue-head">
          <span>Up next</span>
          {voting.state === 'voting' && <span className="lsa-pill lsa-pill--live">Voting · {left ?? '…'}s</span>}
          {voting.state === 'rolling' && <span className="lsa-pill">Rolling</span>}
          {voting.state === 'idle' && <span className="lsa-pill lsa-pill--dim">Waiting for memes</span>}
        </header>
        {voting.pool.length === 0 ? (
          <p className="lsa-empty">No memes in the pool. Yours could be the next one on stream.</p>
        ) : (
          <ul className="lsa-list">
            {voting.pool.map(item => (
              <li key={item.id} className="lsa-row">
                <span className="lsa-num">#{item.number}</span>
                <span className="lsa-row-text">{item.description}</span>
                <span className="lsa-votes">{item.votes}</span>
                <button className="lsa-vote" {...gate.lockProps('vote')}
                  onClick={gate.guard(() => vote(item.number), 'vote')}
                  disabled={!gate.locked && (votingFor !== null || voting.state !== 'voting')}
                  title={voting.state === 'voting' ? 'Vote' : 'Voting opens when the round starts'}>
                  {votingFor === item.number ? '…' : '▲'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// ── Idea ───────────────────────────────────────────────────────────────────────────────────────

function IdeaTab({ draft }: { draft?: string }) {
  const gate = useMemberGate()
  const [text, setText] = useState(draft ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, flash] = useFlash()
  const [items, setItems] = useState<Suggestion[] | null>(null)
  const [votingId, setVotingId] = useState<string | null>(null)
  const load = useCallback(() => getSuggestions().then(s => setItems([...s].sort((a, b) => b.voteCount - a.voteCount))), [])
  useEffect(() => { load() }, [load])

  const mine = (s: Suggestion) => !!gate.wallet && s.voters.includes(gate.wallet.toLowerCase())

  const submit = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await submitSuggestion(t)
      setText('')
      flash(true, 'Pitched 💡 The guys will react to it on stream.')
      load()
    } catch (e) { flash(false, errText(e, 'Could not send the idea.')) } finally { setBusy(false) }
  }

  const vote = async (s: Suggestion) => {
    if (votingId) return
    setVotingId(s.id)
    try { await voteOnSuggestion(s.id, mine(s) ? 'unvote' : 'upvote'); await load() }
    catch (e) { flash(false, errText(e, 'Vote not counted.')) } finally { setVotingId(null) }
  }

  return (
    <>
      <MemberGate reason="pitch an idea" className="lsa-form">
        <form onSubmit={e => { e.preventDefault(); submit() }}>
          <textarea className="lsa-textarea" value={text} onChange={e => setText(e.target.value)} autoFocus rows={3} maxLength={280}
            placeholder="A segment, a guest, a bit, a feature… the guys read the good ones out."
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} />
          <div className="lsa-actions">
            <span className="lsa-preview">{text.length > 0 ? `${280 - text.length} left` : 'The best ideas get voted up.'}</span>
            <button className="lsa-submit" disabled={!text.trim() || busy}>{busy ? 'Sending…' : 'Pitch it'}</button>
          </div>
        </form>
      </MemberGate>
      <Sent msg={msg} />

      <section className="lsa-queue">
        <header className="lsa-queue-head"><span>Top ideas</span></header>
        {items === null ? <div className="lsa-loading" /> : items.length === 0 ? (
          <p className="lsa-empty">No ideas yet. Be the first.</p>
        ) : (
          <ul className="lsa-list">
            {items.slice(0, 30).map((s, i) => (
              <li key={s.id} className={`lsa-row${mine(s) ? ' lsa-row--mine' : ''}`}>
                <span className="lsa-num">{i + 1}</span>
                <span className="lsa-row-text">{s.text}</span>
                <span className="lsa-votes">{s.voteCount}</span>
                <button className={`lsa-vote${mine(s) ? ' lsa-vote--on' : ''}`} {...gate.lockProps('vote')}
                  onClick={gate.guard(() => vote(s), 'vote')} disabled={!gate.locked && !!votingId}>
                  {votingId === s.id ? '…' : mine(s) ? '✓' : '▲'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// ── YouTube ────────────────────────────────────────────────────────────────────────────────────

function youtubeId(url: string): string | null {
  const m = url.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`

function VideoTab({ draft }: { draft?: string }) {
  const gate = useMemberGate()
  const [url, setUrl] = useState(draft ?? '')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, flash] = useFlash()
  const [items, setItems] = useState<YtQueueItem[] | null>(null)
  const [votingId, setVotingId] = useState<string | null>(null)
  const id = useMemo(() => youtubeId(url), [url])
  const load = useCallback(() => getYtQueue().then(q => setItems([...q].sort((a, b) => b.voteCount - a.voteCount))), [])
  useEffect(() => { load() }, [load])

  const mine = (v: YtQueueItem) => !!gate.wallet && v.voters.includes(gate.wallet.toLowerCase())

  const submit = async () => {
    if (!id || busy) return
    setBusy(true)
    try {
      await submitYtVideo(url.trim(), title.trim())
      setUrl(''); setTitle('')
      flash(true, 'Queued ▶ Most votes plays next.')
      load()
    } catch (e) { flash(false, errText(e, 'Could not queue the video.')) } finally { setBusy(false) }
  }

  const vote = async (v: YtQueueItem) => {
    if (votingId) return
    setVotingId(v.id)
    try { await voteYtQueue(v.id, mine(v) ? 'unvote' : 'upvote'); await load() }
    catch (e) { flash(false, errText(e, 'Vote not counted.')) } finally { setVotingId(null) }
  }

  return (
    <>
      <MemberGate reason="queue a video" className="lsa-form">
        <form onSubmit={e => { e.preventDefault(); submit() }}>
          <div className="lsa-yt">
            <div className={`lsa-yt-thumb${id ? ' lsa-yt-thumb--on' : ''}`}>
              {id ? <img src={thumb(id)} alt="" /> : <span aria-hidden>▶</span>}
            </div>
            <div className="lsa-yt-fields">
              <input className="lsa-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a YouTube link" autoFocus
                inputMode="url" aria-invalid={!!url.trim() && !id} />
              <input className="lsa-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={120} />
            </div>
          </div>
          <div className="lsa-actions">
            <span className="lsa-preview">{url.trim() && !id ? 'That doesn’t look like a YouTube link.' : 'The guys watch and react live.'}</span>
            <button className="lsa-submit" disabled={!id || busy}>{busy ? 'Queuing…' : 'Queue video'}</button>
          </div>
        </form>
      </MemberGate>
      <Sent msg={msg} />

      <section className="lsa-queue">
        <header className="lsa-queue-head"><span>Video queue</span><span className="lsa-pill lsa-pill--dim">Most votes plays next</span></header>
        {items === null ? <div className="lsa-loading" /> : items.length === 0 ? (
          <p className="lsa-empty">The queue is empty. Drop the first video.</p>
        ) : (
          <ul className="lsa-list">
            {items.map(v => {
              const vid = youtubeId(v.url)
              return (
                <li key={v.id} className={`lsa-row lsa-row--video${mine(v) ? ' lsa-row--mine' : ''}`}>
                  {vid ? <img className="lsa-row-thumb" src={thumb(vid)} alt="" loading="lazy" /> : <span className="lsa-row-thumb" />}
                  <a className="lsa-row-text" href={v.url} target="_blank" rel="noopener noreferrer">{v.title || v.url}</a>
                  <span className="lsa-votes">{v.voteCount}</span>
                  <button className={`lsa-vote${mine(v) ? ' lsa-vote--on' : ''}`} {...gate.lockProps('vote')}
                    onClick={gate.guard(() => vote(v), 'vote')} disabled={!gate.locked && !!votingId}>
                    {votingId === v.id ? '…' : mine(v) ? '✓' : '▲'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

// ── On-stream lists ────────────────────────────────────────────────────────────────────────────

function ListsTab({ lists, reload }: { lists: StreamLists; reload: () => void }) {
  const gate = useMemberGate()
  const [msg, flash] = useFlash()
  const [busy, setBusy] = useState<string | null>(null)

  const vote = async (list: 'video' | 'roadmap', n: number) => {
    if (busy) return
    setBusy(`${list}${n}`)
    try { await voteList(list, n); flash(true, 'Voted. Watch it glow on stream ✨'); reload() }
    catch (e) { flash(false, e instanceof ApiError && e.status === 409 ? 'You already voted for that one.' : errText(e, 'Vote not counted.')) }
    finally { setBusy(null) }
  }

  const section = (list: 'video' | 'roadmap', title: string) => {
    const items = list === 'video' ? lists.videos : lists.roadmap
    if (items.length === 0) return null
    return (
      <section className="lsa-queue">
        <header className="lsa-queue-head"><span>{title}</span></header>
        <ul className="lsa-list">
          {items.map((it, i) => (
            <li key={i} className="lsa-row">
              <span className="lsa-num">{i + 1}</span>
              <span className="lsa-row-text">{it.title}</span>
              {it.votes !== undefined && <span className="lsa-votes">{it.votes}</span>}
              <button className="lsa-vote" {...gate.lockProps('vote')} onClick={gate.guard(() => vote(list, i + 1), 'vote')}
                disabled={!gate.locked && !!busy}>{busy === `${list}${i + 1}` ? '…' : '▲'}</button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <>
      <Sent msg={msg} />
      {section('video', 'Next video')}
      {section('roadmap', 'Roadmap')}
      {lists.videos.length + lists.roadmap.length === 0 && <p className="lsa-empty">Nothing to vote on right now.</p>}
    </>
  )
}
