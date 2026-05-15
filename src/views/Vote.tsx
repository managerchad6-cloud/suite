import { useState, useEffect } from 'react'
import {
  getRanks, getMyVideoVote, voteVideo,
  getRoadmap, getMyRoadmapVotes, voteRoadmap,
  type Video, type RoadmapItem,
} from '../api/viewer'
import { getSuggestions, voteOnSuggestion, sendChat, type Suggestion } from '../api/livestream'

type Phantom = { signMessage: (m: Uint8Array, enc: string) => Promise<{ signature: Uint8Array }> }

function getPhantomSolana(): Phantom | null {
  return (window as unknown as { phantom?: { solana?: Phantom } }).phantom?.solana ?? null
}

async function signVote(message: string): Promise<string> {
  const p = getPhantomSolana()
  if (!p) throw new Error('Phantom not found')
  const { signature } = await p.signMessage(new TextEncoder().encode(message), 'utf8')
  return Array.from(signature).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function VideoVoting({ address }: { address: string }) {
  const [byFile, setByFile] = useState<Record<string, Video>>({})
  const [myVote, setMyVote] = useState<string | null>(null)
  const [voting, setVoting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null)

  const load = async () => {
    const [ranks, mv] = await Promise.all([getRanks(), getMyVideoVote(address)])
    const map: Record<string, Video> = {}
    for (const v of ranks) map[v.file] = v
    setByFile(map)
    setMyVote(mv)
    setLoading(false)
  }

  useEffect(() => { load() }, [address])

  const handleVote = async (file: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (voting) return
    setVoting(file)
    try {
      const date = new Date().toISOString().split('T')[0]
      const sig = await signVote(`VVC Vote: ${file} | ${date}`)
      await voteVideo(address, file, sig)
      await load()
    } catch { /* rejected */ } finally { setVoting(null) }
  }

  const item = (file: string) => {
    const v = byFile[file]
    const avail = v?.available ?? false
    const cls   = v?.cls ?? ''
    const votes = v?.votes ?? 0
    const title = v?.title ?? file
    const id    = v?.id ?? ''

    return (
      <div
        key={file}
        className={`gallery__item${avail ? '' : ' gallery__item--locked'}`}
        onClick={avail ? () => setLightbox({ src: `/assets/gallery/${file}.mp4`, caption: `${id} — ${title}` }) : undefined}
      >
        <img className="gallery__thumb" src={`/assets/gallery/${file}.jpg`} alt={title} loading="lazy" />

        {avail ? (
          <button className="gallery__play" aria-label="Play video">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </button>
        ) : (
          <div className="gallery__vote-wrap">
            {votes > 0 && (
              <span className="gallery__vote-count">{votes} vote{votes !== 1 ? 's' : ''}</span>
            )}
            {myVote === file
              ? <span className="gallery__voted">Voted ✓</span>
              : (
                <button
                  className="gallery__vote-btn"
                  onClick={(e) => handleVote(file, e)}
                  disabled={!!voting}
                >
                  {voting === file ? '…' : myVote ? 'Change Vote' : 'Vote'}
                </button>
              )
            }
          </div>
        )}

        {cls && (
          <span className={`video-class-badge badge-${cls}`}>
            {cls === 'E' ? 'CANON' : cls === 'D' ? 'DOCTRINE' : 'STINGER'}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="vote-gallery-wrap">
      {lightbox && (
        <div className="gallery-lightbox" onClick={() => setLightbox(null)}>
          <div className="gallery-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="gallery-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
            <video src={lightbox.src} controls autoPlay className="gallery-lightbox-video" />
            <p className="gallery-lightbox-caption">{lightbox.caption}</p>
          </div>
        </div>
      )}

      {loading ? <div className="vote-spinner" style={{ margin: '60px auto' }} /> : (
        <div className="gallery__grid">
          {/* Row 1: portrait · portrait · landscape-group */}
          {item('capital')}
          {item('university')}
          <div className="gallery__group-wide">
            {item('fugazzi')}
            {item('reservoir')}
          </div>

          {/* Row 2: 4 portraits */}
          {item('bar')}
          {item('lambo')}
          {item('sparta')}
          {item('ai_love')}

          {/* Row 3: portrait · portrait · landscape-group */}
          {item('jesuschroist')}
          {item('chiropractor')}
          <div className="gallery__group-wide">
            {item('vegas')}
            {item('parliament')}
          </div>
        </div>
      )}
    </div>
  )
}

function RoadmapVoting({ address }: { address: string }) {
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [myVotes, setMyVotes] = useState<string[]>([])
  const [voting, setVoting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async () => {
    const [roadmap, mv] = await Promise.all([getRoadmap(), getMyRoadmapVotes(address)])
    setItems(roadmap)
    setMyVotes(mv)
    setLoading(false)
  }

  useEffect(() => { load() }, [address])

  const handleVote = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (voting || myVotes.includes(itemId)) return
    setVoting(itemId)
    try {
      const date = new Date().toISOString().split('T')[0]
      const sig = await signVote(`VVC Roadmap Vote: ${itemId} | ${date}`)
      await voteRoadmap(address, itemId, sig)
      setMyVotes((prev) => [...prev, itemId])
      await load()
    } catch { /* rejected */ } finally { setVoting(null) }
  }

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id))

  return (
    <div className="vote-section">
      <div className="vote-section-header">
        <span className="vote-section-title">ROADMAP</span>
        <span className="vote-section-sub">Multiple items · one vote each</span>
      </div>
      {loading ? <div className="vote-spinner" /> : (
        <div className="roadmap-grid">
          {items.map((item, i) => {
            const voted = myVotes.includes(item.id)
            const open = expanded === item.id
            return (
              <div
                key={item.id}
                className={`roadmap-card${voted ? ' roadmap-card--voted' : ''}${open ? ' roadmap-card--open' : ''}`}
                onClick={() => toggle(item.id)}
              >
                <div className="roadmap-card__header">
                  <span className="roadmap-card__rank">#{i + 1}</span>
                  <span className="roadmap-card__title">{item.title}</span>
                  <span className="roadmap-card__votes">{item.votes}</span>
                  <button
                    className={`btn-vote-item${voted ? ' voted' : ''}`}
                    onClick={(e) => handleVote(item.id, e)}
                    disabled={!!voting || voted}
                  >
                    {voting === item.id ? '…' : voted ? '✓' : '↑'}
                  </button>
                  <span className="roadmap-card__chevron">{open ? '−' : '+'}</span>
                </div>
                {open && (
                  <div className="roadmap-card__body">
                    {item.description
                      ? item.description
                      : <span className="roadmap-card__placeholder">Full details coming soon.</span>
                    }
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SuggestionsVoting({ address }: { address: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [voting, setVoting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setSuggestions(await getSuggestions())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const hasVoted = (s: Suggestion) => s.voters.includes(address.toLowerCase())

  const handleVote = async (s: Suggestion, e: React.MouseEvent) => {
    e.stopPropagation()
    if (voting) return
    setVoting(s.id)
    try {
      const nonce = String(Date.now())
      const action = hasVoted(s) ? 'unvote' : 'upvote'
      const challenge = `VVC Live: ${action} suggestion ${s.id} as ${address} ts ${nonce}`
      const p = getPhantomSolana()
      if (!p) throw new Error('Phantom not found')
      const { signature } = await p.signMessage(new TextEncoder().encode(challenge), 'utf8')
      const sig = btoa(String.fromCharCode(...Array.from(signature)))
      await voteOnSuggestion(address, s.id, sig, nonce, action)
      await load()
    } catch { /* rejected */ } finally { setVoting(null) }
  }

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id))

  const handleSubmit = async () => {
    const text = draft.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await sendChat(`/suggestion ${text}`)
      setDraft('')
      await load()
    } catch { /* silent */ } finally { setSubmitting(false) }
  }

  return (
    <div className="vote-section">
      <div className="vote-section-header">
        <span className="vote-section-title">SUGGESTIONS</span>
        <span className="vote-section-sub">Community ideas · vote to boost</span>
      </div>
      <div className="suggestion-submit">
        <input
          className="suggestion-input"
          placeholder="Submit a new suggestion…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit() }}
          disabled={submitting}
          maxLength={280}
        />
        <button
          className="suggestion-submit-btn"
          onClick={handleSubmit}
          disabled={submitting || !draft.trim()}
        >
          {submitting ? '…' : 'Submit'}
        </button>
      </div>
      {loading ? <div className="vote-spinner" /> : suggestions.length === 0 ? (
        <div className="suggestion-empty">No suggestions yet — be the first.</div>
      ) : (
        <div className="suggestion-list">
          {suggestions.map((s) => {
            const voted = hasVoted(s)
            const open = expanded === s.id
            return (
              <div
                key={s.id}
                className={`suggestion-card${voted ? ' suggestion-card--voted' : ''}${open ? ' suggestion-card--open' : ''}`}
                onClick={() => toggle(s.id)}
              >
                <div className="suggestion-card__row">
                  <button
                    className={`btn-vote-item${voted ? ' voted' : ''}`}
                    onClick={(e) => handleVote(s, e)}
                    disabled={!!voting}
                  >
                    {voting === s.id ? '…' : voted ? '✓' : '↑'}
                  </button>
                  <span className="suggestion-card__votes">{s.voteCount}</span>
                  <span className="suggestion-card__text">{s.text}</span>
                  <span className="suggestion-card__chevron">{open ? '−' : '+'}</span>
                </div>
                {open && (
                  <div className="suggestion-card__meta">
                    Submitted {new Date(s.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {` · ${s.voteCount} vote${s.voteCount !== 1 ? 's' : ''}`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Vote({ address }: { address: string }) {
  return (
    <div className="vote-view">
      <div className="vote-gallery-section">
        <div className="vote-section-header">
          <span className="vote-section-title">VIDEO QUEUE</span>
          <span className="vote-section-sub">One vote · changeable</span>
        </div>
        <VideoVoting address={address} />
      </div>
      <div className="vote-bottom-row">
        <RoadmapVoting address={address} />
        <SuggestionsVoting address={address} />
      </div>
    </div>
  )
}
