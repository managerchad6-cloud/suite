import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchMyShares, fetchXStatus, type TweetShare } from '../api/twitter'
import { useXMetrics } from '../hooks/useXMetrics'
import './XTimeline.css'

// ── Milestone definitions ─────────────────────────────────────────────────────
const MILESTONES = [
  { id: 'likes_10',   metric: 'likes' as const,    threshold: 10,    xp: 75,    credits: 15,  label: '10 Likes'  },
  { id: 'likes_50',   metric: 'likes' as const,    threshold: 50,    xp: 200,   credits: 40,  label: '50 Likes'  },
  { id: 'likes_100',  metric: 'likes' as const,    threshold: 100,   xp: 500,   credits: 100, label: '100 Likes' },
  { id: 'likes_1k',   metric: 'likes' as const,    threshold: 1000,  xp: 1500,  credits: 300, label: '1K Likes'  },
  { id: 'rts_10',     metric: 'rts' as const,      threshold: 10,    xp: 50,    credits: 10,  label: '10 RTs'    },
  { id: 'rts_100',    metric: 'rts' as const,      threshold: 100,   xp: 250,   credits: 50,  label: '100 RTs'   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function memeImageUrl(meme_id: string, meme_type: string): string | null {
  if (meme_type === 'studio')  return `/handmade/${meme_id}/image`
  if (meme_type === 'factory') return `/jobs/${meme_id}/image`
  return null
}

// ── Sub-components ────────────────────────────────────────────────────────────
interface MilestoneCardProps {
  label: string
  xp: number
  credits: number
  achieved: boolean
  isNext: boolean
  progress?: number // 0-1 for the "next" card
}
function MilestoneCard({ label, xp, credits, achieved, isNext, progress }: MilestoneCardProps) {
  return (
    <div className={`xtml-ms-card${achieved ? ' xtml-ms-card--achieved' : isNext ? ' xtml-ms-card--next' : ''}`}>
      <div className="xtml-ms-icon">{achieved ? '✓' : isNext ? '◎' : '🔒'}</div>
      <div className="xtml-ms-label">{label}</div>
      <div className="xtml-ms-reward">
        <span className="xtml-ms-xp">+{xp.toLocaleString()} XP</span>
        <span className="xtml-ms-credits">+{credits} CR</span>
      </div>
      {isNext && progress !== undefined && progress > 0 && (
        <div className="xtml-ms-progress-bar">
          <div className="xtml-ms-progress-fill" style={{ width: `${Math.min(100, progress * 100).toFixed(0)}%` }} />
        </div>
      )}
    </div>
  )
}

interface TweetCardProps {
  share: TweetShare
  xMetrics: ReturnType<typeof useXMetrics>
}
function TweetCard({ share, xMetrics }: TweetCardProps) {
  const m = share.tweet_id ? xMetrics.get(share.tweet_id) : null
  const imgUrl = memeImageUrl(share.meme_id, share.meme_type)
  const handle = share.x_handle ?? '?'
  const text   = share.tweet_text ?? share.meme_id.replace(/_/g, ' ')
  const url    = share.tweet_url ?? (share.tweet_id ? `https://x.com/i/web/status/${share.tweet_id}` : null)

  return (
    <div className="xtml-tweet">
      <div className="xtml-tweet-aside">
        <div className="xtml-tweet-avatar">{handle[0]?.toUpperCase() ?? '?'}</div>
        <div className="xtml-tweet-thread-line" />
      </div>
      <div className="xtml-tweet-body">
        <div className="xtml-tweet-header">
          <span className="xtml-tweet-handle">@{handle}</span>
          <span className="xtml-tweet-dot">·</span>
          <span className="xtml-tweet-time">{timeAgo(share.created_at)}</span>
          {url && (
            <a className="xtml-tweet-ext" href={url} target="_blank" rel="noopener noreferrer" title="View on X">↗</a>
          )}
        </div>
        <p className="xtml-tweet-text">{text}</p>
        {imgUrl && (
          <div className="xtml-tweet-img-wrap">
            <img src={imgUrl} alt="meme" className="xtml-tweet-img" loading="lazy" />
          </div>
        )}
        <div className="xtml-tweet-metrics">
          <span className="xtml-tweet-metric"><span className="xtml-tweet-metric-icon">💬</span>{fmt(m?.reply_count ?? 0)}</span>
          <span className="xtml-tweet-metric"><span className="xtml-tweet-metric-icon">🔁</span>{fmt(m?.retweet_count ?? 0)}</span>
          <span className="xtml-tweet-metric xtml-tweet-metric--likes"><span className="xtml-tweet-metric-icon">❤</span>{fmt(m?.like_count ?? 0)}</span>
          {(m?.impression_count ?? 0) > 0 && (
            <span className="xtml-tweet-metric xtml-tweet-metric--views"><span className="xtml-tweet-metric-icon">👁</span>{fmt(m?.impression_count ?? 0)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  wallet: string
}

export function XTimeline({ wallet }: Props) {
  const [shares,  setShares]  = useState<TweetShare[]>([])
  const [handle,  setHandle]  = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const xMetrics = useXMetrics(wallet)

  const load = useCallback(async () => {
    const [sh, status] = await Promise.all([
      fetchMyShares(wallet).catch(() => [] as TweetShare[]),
      fetchXStatus(wallet).catch(() => ({ connected: false as const })),
    ])
    setShares(sh)
    if (status.connected && status.handle) setHandle(status.handle)
    setLoading(false)
  }, [wallet])

  useEffect(() => { load() }, [load])

  // Totals across all tracked shares
  const stats = useMemo(() => {
    let likes = 0, rts = 0, replies = 0, views = 0
    let bestLikes = 0, bestRTs = 0
    for (const s of shares) {
      const m = s.tweet_id ? xMetrics.get(s.tweet_id) : null
      if (!m) continue
      likes   += m.like_count
      rts     += m.retweet_count
      replies += m.reply_count
      views   += m.impression_count
      if (m.like_count    > bestLikes) bestLikes = m.like_count
      if (m.retweet_count > bestRTs)   bestRTs   = m.retweet_count
    }
    return { likes, rts, replies, views, bestLikes, bestRTs }
  }, [shares, xMetrics])

  const tracked = shares.filter(s => s.tweet_id)
  const sorted  = [...tracked].sort((a, b) => b.created_at - a.created_at)

  if (loading) return <div className="xtml-loading">Loading…</div>

  if (tracked.length === 0) {
    return (
      <div className="xtml-empty">
        <div className="xtml-empty-logo">𝕏</div>
        <p className="xtml-empty-text">No shared tweets yet — hit the 𝕏 button on any meme in the feed to post and start tracking performance.</p>
      </div>
    )
  }

  return (
    <div className="xtml-root">

      {/* ── Stats dashboard ── */}
      <div className="xtml-dashboard">
        <div className="xtml-stat">
          <span className="xtml-stat-num">{tracked.length}</span>
          <span className="xtml-stat-label">Tweets</span>
        </div>
        <div className="xtml-stat">
          <span className="xtml-stat-num xtml-stat-num--likes">{fmt(stats.likes)}</span>
          <span className="xtml-stat-label">❤ Likes</span>
        </div>
        <div className="xtml-stat">
          <span className="xtml-stat-num">{fmt(stats.rts)}</span>
          <span className="xtml-stat-label">🔁 RTs</span>
        </div>
        <div className="xtml-stat">
          <span className="xtml-stat-num">{fmt(stats.replies)}</span>
          <span className="xtml-stat-label">💬 Replies</span>
        </div>
        {stats.views > 0 && (
          <div className="xtml-stat">
            <span className="xtml-stat-num">{fmt(stats.views)}</span>
            <span className="xtml-stat-label">👁 Views</span>
          </div>
        )}
      </div>

      {/* ── Milestones ── */}
      <div className="xtml-milestones-section">
        <div className="xtml-section-label">MILESTONES</div>
        <div className="xtml-milestones-scroll">
          {MILESTONES.map((ms, i) => {
            const best      = ms.metric === 'likes' ? stats.bestLikes : stats.bestRTs
            const achieved  = best >= ms.threshold
            // "next" = first unachieved milestone for this metric
            const prevInMetric = MILESTONES.slice(0, i).filter(m => m.metric === ms.metric)
            const isNext    = !achieved && prevInMetric.every(m => {
              const b = m.metric === 'likes' ? stats.bestLikes : stats.bestRTs
              return b >= m.threshold
            })
            const progress  = isNext ? best / ms.threshold : 0
            return (
              <MilestoneCard
                key={ms.id}
                label={ms.label}
                xp={ms.xp}
                credits={ms.credits}
                achieved={achieved}
                isNext={isNext}
                progress={progress}
              />
            )
          })}
        </div>
      </div>

      {/* ── Tweet timeline ── */}
      <div className="xtml-section-label xtml-section-label--timeline">TIMELINE</div>
      <div className="xtml-timeline">
        {sorted.map(s => (
          <TweetCard key={s.id} share={s} xMetrics={xMetrics} />
        ))}
      </div>

    </div>
  )
}
