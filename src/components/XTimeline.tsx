import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchMyShares, fetchXStatus, refreshMetrics, type TweetShare, type XStatus } from '../api/twitter'
import { useXMetrics } from '../hooks/useXMetrics'
import './XTimeline.css'

// ── Milestone definitions ─────────────────────────────────────────────────────
// tier 1=bronze  2=silver  3=gold  4=platinum  5=diamond  6=legendary
type MetricKey = 'likes' | 'rts' | 'replies' | 'views'
interface Milestone {
  id: string; metric: MetricKey; threshold: number
  xp: number; credits: number; label: string; tier: 1|2|3|4|5|6
}
const MILESTONES: Milestone[] = [
  // ── Likes ❤ ──────────────────────────────────────────────────────────────
  { id: 'l1',   metric: 'likes',   threshold: 1,      xp: 10,    credits: 2,    label: '1 Like',      tier: 1 },
  { id: 'l10',  metric: 'likes',   threshold: 10,     xp: 75,    credits: 15,   label: '10 Likes',    tier: 2 },
  { id: 'l50',  metric: 'likes',   threshold: 50,     xp: 200,   credits: 40,   label: '50 Likes',    tier: 3 },
  { id: 'l100', metric: 'likes',   threshold: 100,    xp: 500,   credits: 100,  label: '100 Likes',   tier: 3 },
  { id: 'l500', metric: 'likes',   threshold: 500,    xp: 1000,  credits: 200,  label: '500 Likes',   tier: 4 },
  { id: 'l1k',  metric: 'likes',   threshold: 1000,   xp: 1500,  credits: 300,  label: '1K Likes',    tier: 4 },
  { id: 'l5k',  metric: 'likes',   threshold: 5000,   xp: 5000,  credits: 1000, label: '5K Likes',    tier: 5 },
  { id: 'l10k', metric: 'likes',   threshold: 10000,  xp: 10000, credits: 2000, label: '10K Likes',   tier: 6 },
  // ── Retweets 🔁 ──────────────────────────────────────────────────────────
  { id: 'r1',   metric: 'rts',     threshold: 1,      xp: 5,     credits: 1,    label: '1 RT',        tier: 1 },
  { id: 'r10',  metric: 'rts',     threshold: 10,     xp: 50,    credits: 10,   label: '10 RTs',      tier: 2 },
  { id: 'r50',  metric: 'rts',     threshold: 50,     xp: 150,   credits: 30,   label: '50 RTs',      tier: 3 },
  { id: 'r100', metric: 'rts',     threshold: 100,    xp: 250,   credits: 50,   label: '100 RTs',     tier: 4 },
  { id: 'r500', metric: 'rts',     threshold: 500,    xp: 750,   credits: 150,  label: '500 RTs',     tier: 5 },
  { id: 'r1k',  metric: 'rts',     threshold: 1000,   xp: 2000,  credits: 400,  label: '1K RTs',      tier: 6 },
  // ── Replies 💬 ───────────────────────────────────────────────────────────
  { id: 'c1',   metric: 'replies', threshold: 1,      xp: 5,     credits: 1,    label: '1 Reply',     tier: 1 },
  { id: 'c10',  metric: 'replies', threshold: 10,     xp: 50,    credits: 10,   label: '10 Replies',  tier: 2 },
  { id: 'c50',  metric: 'replies', threshold: 50,     xp: 200,   credits: 40,   label: '50 Replies',  tier: 3 },
  { id: 'c100', metric: 'replies', threshold: 100,    xp: 500,   credits: 100,  label: '100 Replies', tier: 4 },
  { id: 'c500', metric: 'replies', threshold: 500,    xp: 1500,  credits: 300,  label: '500 Replies', tier: 5 },
  // ── Impressions 👁 ───────────────────────────────────────────────────────
  { id: 'v100', metric: 'views',   threshold: 100,    xp: 15,    credits: 3,    label: '100 Views',   tier: 1 },
  { id: 'v500', metric: 'views',   threshold: 500,    xp: 50,    credits: 10,   label: '500 Views',   tier: 2 },
  { id: 'v1k',  metric: 'views',   threshold: 1000,   xp: 100,   credits: 20,   label: '1K Views',    tier: 2 },
  { id: 'v5k',  metric: 'views',   threshold: 5000,   xp: 300,   credits: 60,   label: '5K Views',    tier: 3 },
  { id: 'v10k', metric: 'views',   threshold: 10000,  xp: 500,   credits: 100,  label: '10K Views',   tier: 4 },
  { id: 'v50k', metric: 'views',   threshold: 50000,  xp: 2000,  credits: 400,  label: '50K Views',   tier: 5 },
  { id: 'v100k',metric: 'views',   threshold: 100000, xp: 5000,  credits: 1000, label: '100K Views',  tier: 6 },
]

const METRIC_ICON: Record<MetricKey, string> = {
  likes: '❤', rts: '🔁', replies: '💬', views: '👁',
}

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

// ── Milestone card ────────────────────────────────────────────────────────────
interface MilestoneCardProps {
  icon: string; label: string; xp: number; credits: number
  tier: 1|2|3|4|5|6; achieved: boolean; progress: number
}
function MilestoneCard({ icon, label, xp, credits, tier, achieved, progress }: MilestoneCardProps) {
  const showBar = !achieved && progress > 0
  return (
    <div className={`xtml-ms-card xtml-ms-card--t${tier}${achieved ? ' xtml-ms-card--achieved' : ''}`}>
      <div className="xtml-ms-icon">{icon}</div>
      <div className="xtml-ms-label">{label}</div>
      <div className="xtml-ms-reward">
        <span className="xtml-ms-xp">+{xp.toLocaleString()} XP</span>
        <span className="xtml-ms-credits">+{credits} CR</span>
      </div>
      {showBar && (
        <div className="xtml-ms-progress-bar">
          <div className="xtml-ms-progress-fill" style={{ width: `${Math.min(100, progress * 100).toFixed(1)}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Tweet card ────────────────────────────────────────────────────────────────
interface TweetCardProps {
  share: TweetShare
  xMetrics: ReturnType<typeof useXMetrics>
  fallbackHandle: string | null
  profileImageUrl: string | null
}
function TweetCard({ share, xMetrics, fallbackHandle, profileImageUrl }: TweetCardProps) {
  const m      = share.tweet_id ? xMetrics.get(share.tweet_id) : null
  const imgUrl = memeImageUrl(share.meme_id, share.meme_type)
  const handle = share.x_handle || fallbackHandle || null
  const text   = share.tweet_text || null
  const url    = share.tweet_url ?? (share.tweet_id ? `https://x.com/i/web/status/${share.tweet_id}` : null)

  return (
    <div className="xtml-tweet">
      <div className="xtml-tweet-aside">
        {profileImageUrl
          ? <img src={profileImageUrl} alt={handle ?? ''} className="xtml-tweet-avatar xtml-tweet-avatar--img" />
          : <div className="xtml-tweet-avatar">{handle?.[0]?.toUpperCase() ?? '𝕏'}</div>
        }
        <div className="xtml-tweet-thread-line" />
      </div>
      <div className="xtml-tweet-body">
        <div className="xtml-tweet-header">
          {handle && <span className="xtml-tweet-handle">@{handle}</span>}
          {handle && <span className="xtml-tweet-dot">·</span>}
          <span className="xtml-tweet-time">{timeAgo(share.created_at)}</span>
          {url && (
            <a className="xtml-tweet-ext" href={url} target="_blank" rel="noopener noreferrer" title="View on X">↗</a>
          )}
        </div>
        {text && <p className="xtml-tweet-text">{text}</p>}
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
interface Props { wallet: string }

export function XTimeline({ wallet }: Props) {
  const [shares,      setShares]      = useState<TweetShare[]>([])
  const [xStatus,     setXStatus]     = useState<XStatus | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)
  const xMetrics = useXMetrics(wallet)

  const load = useCallback(async () => {
    const [sh, status] = await Promise.all([
      fetchMyShares(wallet).catch(() => [] as TweetShare[]),
      fetchXStatus(wallet).catch(() => null as XStatus | null),
    ])
    setShares(sh)
    setXStatus(status)
    setLoading(false)
  }, [wallet])

  useEffect(() => { load() }, [load])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    await refreshMetrics(wallet).catch(() => {})
    setLastRefresh(Date.now())
    setRefreshing(false)
  }, [wallet, refreshing])

  // Totals + best-single-tweet for milestone gates
  const stats = useMemo(() => {
    let likes = 0, rts = 0, replies = 0, views = 0
    let bestLikes = 0, bestRTs = 0, bestReplies = 0, bestViews = 0
    for (const s of shares) {
      const m = s.tweet_id ? xMetrics.get(s.tweet_id) : null
      if (!m) continue
      likes   += m.like_count;   rts     += m.retweet_count
      replies += m.reply_count;  views   += m.impression_count
      if (m.like_count       > bestLikes)   bestLikes   = m.like_count
      if (m.retweet_count    > bestRTs)     bestRTs     = m.retweet_count
      if (m.reply_count      > bestReplies) bestReplies = m.reply_count
      if (m.impression_count > bestViews)   bestViews   = m.impression_count
    }
    return { likes, rts, replies, views, bestLikes, bestRTs, bestReplies, bestViews }
  }, [shares, xMetrics])

  const tracked = shares.filter(s => s.tweet_id)
  const sorted  = [...tracked].sort((a, b) => b.created_at - a.created_at)
  const handle  = xStatus?.handle ?? null
  const pfpUrl  = xStatus?.profile_image_url ?? null

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
          {MILESTONES.map(ms => {
            const best: Record<MetricKey, number> = {
              likes: stats.bestLikes, rts: stats.bestRTs,
              replies: stats.bestReplies, views: stats.bestViews,
            }
            const b        = best[ms.metric]
            const achieved = b >= ms.threshold
            const progress = achieved ? 0 : b / ms.threshold
            return (
              <MilestoneCard
                key={ms.id}
                icon={METRIC_ICON[ms.metric]}
                label={ms.label}
                xp={ms.xp}
                credits={ms.credits}
                tier={ms.tier}
                achieved={achieved}
                progress={progress}
              />
            )
          })}
        </div>
      </div>

      {/* ── Tweet timeline ── */}
      <div className="xtml-timeline-header">
        <span className="xtml-section-label">TIMELINE</span>
        <button
          className={`xtml-refresh-btn${refreshing ? ' xtml-refresh-btn--spinning' : ''}`}
          onClick={handleRefresh}
          disabled={refreshing}
          title="Fetch latest stats from X"
        >
          ↻ {refreshing ? 'Refreshing…' : lastRefresh ? 'Refreshed' : 'Refresh'}
        </button>
      </div>
      <p className="xtml-refresh-note">
        Stats sync automatically — every 2 min for fresh tweets, 15 min after 1 hr, hourly after 24 hr.
      </p>
      <div className="xtml-timeline">
        {sorted.map(s => (
          <TweetCard
            key={s.id}
            share={s}
            xMetrics={xMetrics}
            fallbackHandle={handle}
            profileImageUrl={pfpUrl}
          />
        ))}
      </div>

    </div>
  )
}
