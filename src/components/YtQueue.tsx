import { useState, useEffect } from 'react'
import { getYtQueue, submitYtVideo, voteYtQueue, type YtQueueItem } from '../api/livestream'

type Phantom = { signMessage: (m: Uint8Array, enc: string) => Promise<{ signature: Uint8Array }> }

function getPhantomSolana(): Phantom | null {
  return (window as unknown as { phantom?: { solana?: Phantom } }).phantom?.solana ?? null
}

export function YtQueue({ address }: { address: string }) {
  const [items, setItems] = useState<YtQueueItem[]>([])
  const [voting, setVoting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setItems(await getYtQueue())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const hasVoted = (item: YtQueueItem) => item.voters.includes(address.toLowerCase())

  const handleVote = async (item: YtQueueItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (voting) return
    setVoting(item.id)
    try {
      const nonce = String(Date.now())
      const action = hasVoted(item) ? 'unvote' : 'upvote'
      const challenge = `VVC Live: ${action} yt-queue ${item.id} as ${address} ts ${nonce}`
      const p = getPhantomSolana()
      if (!p) throw new Error('Phantom not found')
      const { signature } = await p.signMessage(new TextEncoder().encode(challenge), 'utf8')
      const sig = btoa(String.fromCharCode(...Array.from(signature)))
      await voteYtQueue(address, item.id, sig, nonce, action)
      await load()
    } catch { /* rejected */ } finally { setVoting(null) }
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
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally { setSubmitting(false) }
  }

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id))

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">YT REACTION QUEUE</span>
      </div>
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
      {loading ? <div className="vote-spinner" style={{ margin: '16px auto' }} /> : items.length === 0 ? (
        <div className="panel-empty">No videos queued yet.</div>
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
                    onClick={(e) => handleVote(item, e)}
                    disabled={!!voting}
                  >
                    {voting === item.id ? '…' : voted ? '✓' : '↑'}
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
    </div>
  )
}
