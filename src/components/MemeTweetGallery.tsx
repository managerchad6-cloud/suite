import { useState, useEffect } from 'react'
import { fetchMemeShares, fetchMemeTotals, type MemeShareItem, type MemeTotals } from '../api/twitter'
import './MemeTweetGallery.css'

function fmt(n: number | null | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function timeAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function memeImageUrl(meme_id: string, meme_type: string): string | null {
  if (meme_type === 'studio')  return `/handmade/${meme_id}/image`
  if (meme_type === 'factory') return `/jobs/${meme_id}/image`
  return null
}

interface ShareCardProps { share: MemeShareItem }
function ShareCard({ share }: ShareCardProps) {
  const handle = share.x_handle || null
  const url    = share.tweet_url ?? (share.tweet_id ? `https://x.com/i/web/status/${share.tweet_id}` : null)
  const imgUrl = memeImageUrl(share.meme_id, share.meme_type)
  const likes   = share.like_count       ?? 0
  const rts     = share.retweet_count    ?? 0
  const replies = share.reply_count      ?? 0
  const views   = share.impression_count ?? 0
  return (
    <div className="mtg-card">
      <div className="mtg-card-header">
        <div className="mtg-avatar">{handle?.[0]?.toUpperCase() ?? '𝕏'}</div>
        <div className="mtg-meta">
          {handle && <span className="mtg-handle">@{handle}</span>}
          <span className="mtg-time">{timeAgo(share.created_at)}</span>
        </div>
        {url && (
          <a className="mtg-ext" href={url} target="_blank" rel="noopener noreferrer" title="View on X">↗</a>
        )}
      </div>
      {share.tweet_text && <p className="mtg-text">{share.tweet_text}</p>}
      {imgUrl && (
        <div className="mtg-img-wrap">
          <img src={imgUrl} alt="meme" className="mtg-img" loading="lazy" />
        </div>
      )}
      <div className="mtg-metrics">
        <span className={`mtg-metric${likes > 0 ? ' mtg-metric--active' : ''}`}>❤ {fmt(likes)}</span>
        <span className={`mtg-metric${rts > 0 ? ' mtg-metric--active' : ''}`}>🔁 {fmt(rts)}</span>
        <span className={`mtg-metric${replies > 0 ? ' mtg-metric--active' : ''}`}>💬 {fmt(replies)}</span>
        {views > 0 && <span className="mtg-metric mtg-metric--active">👁 {fmt(views)}</span>}
      </div>
    </div>
  )
}

interface Props {
  meme_id: string
  meme_type: string
}

export function MemeTweetGallery({ meme_id, meme_type }: Props) {
  const [shares,  setShares]  = useState<MemeShareItem[]>([])
  const [totals,  setTotals]  = useState<MemeTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [open,    setOpen]    = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchMemeShares(meme_id, meme_type),
      fetchMemeTotals(meme_id, meme_type),
    ]).then(([sh, tot]) => {
      if (cancelled) return
      setShares(sh)
      setTotals(tot)
      setOpen(sh.length > 0)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [meme_id, meme_type])

  if (loading || !totals || totals.share_count === 0) return null

  return (
    <div className="mtg-root">
      <button className="mtg-toggle" onClick={() => setOpen(o => !o)}>
        <span className="mtg-toggle-label">𝕏 Tweets about this meme</span>
        <span className="mtg-toggle-count">{totals.share_count}</span>
        <span className="mtg-toggle-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          <div className="mtg-totals">
            {totals.total_likes   > 0 && <span className="mtg-total">❤ {fmt(totals.total_likes)}</span>}
            {totals.total_rts     > 0 && <span className="mtg-total">🔁 {fmt(totals.total_rts)}</span>}
            {totals.total_replies > 0 && <span className="mtg-total">💬 {fmt(totals.total_replies)}</span>}
            {totals.total_views   > 0 && <span className="mtg-total">👁 {fmt(totals.total_views)}</span>}
          </div>
          <div className="mtg-grid">
            {shares.map(s => <ShareCard key={s.id} share={s} />)}
          </div>
        </>
      )}
    </div>
  )
}
