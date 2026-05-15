import { useState, useEffect } from 'react'
import { getYtQueue, submitYtVideo, voteYtQueue, getLists, voteList, type YtQueueItem } from '../api/livestream'

type Phantom = { signMessage: (m: Uint8Array, enc: string) => Promise<{ signature: Uint8Array }> }

function getPhantomSolana(): Phantom | null {
  return (window as unknown as { phantom?: { solana?: Phantom } }).phantom?.solana ?? null
}

interface VideoItem { title: string; votes: number; index: number }

export function YtVideosPanel({ address }: { address: string }) {
  // Community queue
  const [items, setItems] = useState<YtQueueItem[]>([])
  const [votingYt, setVotingYt] = useState<string | null>(null)
  const [loadingYt, setLoadingYt] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Curated next video
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [votingVideo, setVotingVideo] = useState<number | null>(null)

  const loadYt = async () => {
    setItems(await getYtQueue())
    setLoadingYt(false)
  }

  const loadVideos = async () => {
    const data = await getLists()
    if (!data?.videos) return
    setVideos(
      (data.videos as { title: string; votes?: number }[]).map((v, i) => ({
        title: v.title,
        votes: v.votes ?? 0,
        index: i,
      }))
    )
  }

  useEffect(() => {
    loadYt()
    loadVideos()
  }, [])

  const hasVoted = (item: YtQueueItem) => item.voters.includes(address.toLowerCase())

  const handleYtVote = async (item: YtQueueItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (votingYt) return
    setVotingYt(item.id)
    try {
      const nonce = String(Date.now())
      const action = hasVoted(item) ? 'unvote' : 'upvote'
      const challenge = `VVC Live: ${action} yt-queue ${item.id} as ${address} ts ${nonce}`
      const p = getPhantomSolana()
      if (!p) throw new Error('Phantom not found')
      const { signature } = await p.signMessage(new TextEncoder().encode(challenge), 'utf8')
      const sig = btoa(String.fromCharCode(...Array.from(signature)))
      await voteYtQueue(address, item.id, sig, nonce, action)
      await loadYt()
    } catch { /* rejected */ } finally { setVotingYt(null) }
  }

  const handleSubmit = async () => {
    const trimUrl = url.trim()
    if (!trimUrl || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await submitYtVideo(trimUrl, title.trim())
      setUrl('')
      setTitle('')
      await loadYt()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally { setSubmitting(false) }
  }

  const handleVideoVote = async (index: number) => {
    if (votingVideo !== null) return
    setVotingVideo(index)
    try { await voteList('video', index); await loadVideos() }
    catch { /* rejected */ } finally { setVotingVideo(null) }
  }

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id))

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">YT VIDEOS</span>
      </div>

      {/* Submit form */}
      <div className="yt-submit">
        <input
          className="yt-input yt-input--url"
          placeholder="YouTube URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit() }}
          disabled={submitting}
        />
        <input
          className="yt-input yt-input--title"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit() }}
          disabled={submitting}
        />
        <button
          className="suggestion-submit-btn"
          onClick={handleSubmit}
          disabled={submitting || !url.trim()}
        >
          {submitting ? '…' : 'Add'}
        </button>
      </div>
      {error && <div className="yt-error">{error}</div>}

      <div className="panel-body">
        {/* Community queue */}
        {loadingYt ? (
          <div className="vote-spinner" style={{ margin: '16px auto' }} />
        ) : items.length === 0 ? (
          <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            Submit a video above ↑<br /><span style={{ fontSize: 13 }}>Highest votes plays next</span>
          </div>
        ) : (
          <div className="suggestion-list">
            {items.map((item) => {
              const voted = hasVoted(item)
              const open = expanded === item.id
              return (
                <div
                  key={item.id}
                  className={`suggestion-card${voted ? ' suggestion-card--voted' : ''}${open ? ' suggestion-card--open' : ''}`}
                  onClick={() => toggle(item.id)}
                >
                  <div className="suggestion-card__row">
                    <button
                      className={`btn-vote-item${voted ? ' voted' : ''}`}
                      onClick={(e) => handleYtVote(item, e)}
                      disabled={!!votingYt}
                    >
                      {votingYt === item.id ? '…' : voted ? '✓' : '↑'}
                    </button>
                    <span className="suggestion-card__votes">{item.voteCount}</span>
                    <span className="suggestion-card__text">{item.title}</span>
                    <span className="suggestion-card__chevron">{open ? '−' : '+'}</span>
                  </div>
                  {open && (
                    <div className="suggestion-card__meta">
                      <a
                        className="yt-link"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.url}
                      </a>
                      <span style={{ marginLeft: 12 }}>
                        Added {new Date(item.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        {` · ${item.voteCount} vote${item.voteCount !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Curated next section */}
        {videos.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid var(--border)', padding: '6px 12px', background: 'var(--surface-2)', flexShrink: 0 }}>
              <span className="panel-title">CURATED NEXT</span>
            </div>
            {videos.map((v) => (
              <div key={v.index} className="queue-item">
                <span className="queue-text">{v.title}</span>
                <div className="queue-item-right">
                  <span className="queue-votes">{v.votes}</span>
                  <button
                    className="btn-queue-vote"
                    onClick={() => handleVideoVote(v.index)}
                    disabled={votingVideo !== null}
                  >
                    {votingVideo === v.index ? '…' : '↑'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
