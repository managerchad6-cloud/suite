import { useState, useEffect } from 'react'
import { getYtQueue, submitYtVideo, voteYtQueue, getLists, voteList, type YtQueueItem } from '../api/livestream'
import { MemberGate, useMemberGate } from '../identity/gate'

interface VideoItem { title: string; votes: number; index: number }

export function YtVideosPanel() {
  const gate = useMemberGate()
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

  const hasVoted = (item: YtQueueItem) => !!gate.wallet && item.voters.includes(gate.wallet.toLowerCase())

  const handleYtVote = async (item: YtQueueItem) => {
    if (votingYt) return
    setVotingYt(item.id)
    try {
      await voteYtQueue(item.id, hasVoted(item) ? 'unvote' : 'upvote')
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
      <MemberGate reason="add a video" className="yt-submit">
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
      </MemberGate>
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
                      {...gate.lockProps('vote')}
                      onClick={(e) => { e.stopPropagation(); gate.guard(() => handleYtVote(item), 'vote')() }}
                      disabled={!gate.locked && !!votingYt}
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
                    {...gate.lockProps('vote')}
                    onClick={gate.guard(() => handleVideoVote(v.index), 'vote')}
                    disabled={!gate.locked && votingVideo !== null}
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
