import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchGalleryMemes, studioMemeImageUrl } from '../api/studio'
import { fetchMemes, imageUrl } from '../api/memes'
import { truncateAddress } from '../wallet'
import { FeedCard } from '../components/FeedCard'
import { CommentsPanel } from '../components/CommentsPanel'
import { castVote } from '../api/votes'
import type { UnifiedMemeItem, MemeSourceType, MemeTier } from '../types/unified'
import './Feed.css'

interface BankPost {
  id: string; title: string; image_url: string; score: number; date: string
  topic: string | null; left_title: string | null; right_title: string | null
  left_labels: string[]; right_labels: string[]; permalink: string
}

interface TierRow {
  meme_id: string; meme_source: string; tier: MemeTier
  score: number; velocity: number; up_votes: number; down_votes: number
  your_vote?: 1 | -1 | null
}

type SortMode = 'foryou' | 'hot' | 'rising' | 'fresh' | 'top'
const SORT_LABELS: Record<SortMode, string> = {
  foryou: 'For You', hot: 'Hot', rising: 'Rising', fresh: 'Fresh', top: 'Top',
}

function toIso(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00Z' : d
}

function ageHours(dateIso: string) {
  return (Date.now() - new Date(dateIso).getTime()) / 3_600_000
}

function sortItems(items: UnifiedMemeItem[], mode: SortMode): UnifiedMemeItem[] {
  const copy = [...items]
  switch (mode) {
    case 'fresh':
      return copy.sort((a, b) => b.dateIso.localeCompare(a.dateIso))
    case 'top':
      return copy.sort((a, b) => {
        const sa = (a.up_votes ?? 0) - (a.down_votes ?? 0) + (a.redditScore ?? 0)
        const sb = (b.up_votes ?? 0) - (b.down_votes ?? 0) + (b.redditScore ?? 0)
        return sb - sa
      })
    case 'hot':
      // Tier priority: pantheon > legendary > hot > rising > fresh, then score
      return copy.sort((a, b) => {
        const tierRank = { pantheon: 5, legendary: 4, hot: 3, rising: 2, fresh: 1 }
        const ta = tierRank[a.tier ?? 'fresh'] ?? 1
        const tb = tierRank[b.tier ?? 'fresh'] ?? 1
        if (tb !== ta) return tb - ta
        const sa = (a.up_votes ?? 0) - (a.down_votes ?? 0) + (a.redditScore ?? 0)
        const sb = (b.up_votes ?? 0) - (b.down_votes ?? 0) + (b.redditScore ?? 0)
        return sb - sa
      })
    case 'rising':
      // Velocity * recency weight — high velocity + not too old
      return copy.sort((a, b) => {
        const va = (a.velocity ?? 0) + (a.redditScore ?? 0) / Math.max(1, ageHours(a.dateIso))
        const vb = (b.velocity ?? 0) + (b.redditScore ?? 0) / Math.max(1, ageHours(b.dateIso))
        return vb - va
      })
    case 'foryou':
    default:
      // Wilson-style score blended with recency decay
      return copy.sort((a, b) => {
        const scoreA = (a.up_votes ?? 0) - (a.down_votes ?? 0) + (a.redditScore ?? 0)
        const scoreB = (b.up_votes ?? 0) - (b.down_votes ?? 0) + (b.redditScore ?? 0)
        const decayA = 1 / (1 + ageHours(a.dateIso) / 24)
        const decayB = 1 / (1 + ageHours(b.dateIso) / 24)
        return (scoreB * decayB) - (scoreA * decayA)
      })
  }
}

interface Props {
  address: string
  onOpenItem: (item: UnifiedMemeItem) => void
  onOpenProfile?: (wallet: string) => void
}

export function Feed({ address, onOpenItem, onOpenProfile }: Props) {
  const [items,       setItems]       = useState<UnifiedMemeItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [idx,         setIdx]         = useState(0)
  const [sort,        setSort]        = useState<SortMode>('foryou')
  const [filter,      setFilter]      = useState<Set<MemeSourceType>>(new Set(['studio', 'factory', 'reddit']))
  const [localVote,     setLocalVote]     = useState<{
    upVotes: number; downVotes: number; yourVote: 1|-1|null; tier: MemeTier; voting: boolean
  } | null>(null)
  const [showComments,  setShowComments]  = useState(false)
  const pages       = useRef({ studio: 1, factory: 1, reddit: 1 })
  const hasMore     = useRef({ studio: true, factory: true, reddit: true })
  const loading_more  = useRef(false)
  const wheelLock     = useRef(false)
  const wheelAccum    = useRef(0)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const touchY        = useRef(0)
  const tierCache   = useRef<Map<string, TierRow>>(new Map())

  // Enrich items array with tier/vote data from the cache
  function enrichWithTiers(list: UnifiedMemeItem[]): UnifiedMemeItem[] {
    return list.map(item => {
      const cached = tierCache.current.get(`${item.sourceId}:${item.type}`)
      if (!cached) return item
      return {
        ...item,
        tier: cached.tier,
        up_votes: cached.up_votes,
        down_votes: cached.down_votes,
        velocity: cached.velocity,
        your_vote: cached.your_vote ?? item.your_vote,
      }
    })
  }

  // Load tier state from backend and update cache + items
  const loadTierData = useCallback(async () => {
    try {
      const res = await fetch(`/api/feed?wallet=${encodeURIComponent(address)}&sort=top&limit=200`)
      if (!res.ok) return
      const data: { items: TierRow[] } = await res.json()
      data.items.forEach(row => {
        tierCache.current.set(`${row.meme_id}:${row.meme_source}`, row)
      })
      setItems(prev => enrichWithTiers(prev))
    } catch { /* silent */ }
  }, [address])

  const fetchBatch = useCallback(async (p: { studio: number; factory: number; reddit: number }, currentSort: SortMode) => {
    const redditSort = currentSort === 'fresh' ? 'new' : currentSort === 'top' ? 'top' : 'top'
    const [sr, fr, rr] = await Promise.allSettled([
      hasMore.current.studio  ? fetchGalleryMemes(p.studio, 10)  : Promise.resolve(null),
      hasMore.current.factory ? fetchMemes(p.factory, 10)         : Promise.resolve(null),
      hasMore.current.reddit  ? fetch(`/memebank?page=${p.reddit}&limit=10&sort=${redditSort}`).then(r => r.json()) : Promise.resolve(null),
    ])
    const next: UnifiedMemeItem[] = []
    if (sr.status === 'fulfilled' && sr.value) {
      sr.value.items.forEach((m: { id: string; wallet: string; characters: string[]; created_at: string }) => next.push({
        key: `studio:${m.id}`, type: 'studio', sourceId: m.id,
        imageUrl: studioMemeImageUrl(m.id),
        title: m.characters.map((c: string) => c.replace(/_/g, ' ')).join(', ') || '—',
        meta: truncateAddress(m.wallet), wallet: m.wallet, dateIso: toIso(m.created_at),
      }))
      hasMore.current.studio = sr.value.has_next
      pages.current.studio = p.studio + 1
    }
    if (fr.status === 'fulfilled' && fr.value) {
      fr.value.items.forEach((m: { job_id: string; meme_id: string | null; wallet: string | null; created_at: string }) => next.push({
        key: `factory:${m.job_id}`, type: 'factory', sourceId: m.job_id,
        imageUrl: imageUrl(m.job_id),
        title: m.meme_id ? m.meme_id.replace(/_/g, ' ') : '—',
        meta: m.wallet ? truncateAddress(m.wallet) : '—', wallet: m.wallet ?? undefined, dateIso: toIso(m.created_at),
      }))
      hasMore.current.factory = fr.value.has_next
      pages.current.factory = p.factory + 1
    }
    if (rr.status === 'fulfilled' && rr.value) {
      rr.value.items.forEach((p2: BankPost) => next.push({
        key: `reddit:${p2.id}`, type: 'reddit', sourceId: p2.id,
        imageUrl: p2.image_url, title: p2.title,
        meta: `▲ ${p2.score.toLocaleString()}`, dateIso: toIso(p2.date),
        redditPermalink: p2.permalink, redditScore: p2.score, redditTopic: p2.topic,
        redditLeftTitle: p2.left_title, redditRightTitle: p2.right_title,
        redditLeftLabels: p2.left_labels, redditRightLabels: p2.right_labels,
      }))
      hasMore.current.reddit = rr.value.has_next
      pages.current.reddit = p.reddit + 1
    }
    return enrichWithTiers(next)
  }, [])

  const loadMore = useCallback(() => {
    if (loading_more.current) return
    loading_more.current = true
    fetchBatch({ ...pages.current }, sort)
      .then(next => setItems(prev => {
        const seen = new Set(prev.map(i => i.key))
        return [...prev, ...next.filter(i => !seen.has(i.key))]
      }))
      .finally(() => { loading_more.current = false })
  }, [fetchBatch, sort])

  useEffect(() => {
    setLoading(true)
    setIdx(0)
    pages.current   = { studio: 1, factory: 1, reddit: 1 }
    hasMore.current = { studio: true, factory: true, reddit: true }
    Promise.all([
      fetchBatch({ studio: 1, factory: 1, reddit: 1 }, sort),
      loadTierData(),
    ]).then(([next]) => {
      setItems(sortItems(next, sort))
    }).finally(() => setLoading(false))
  }, [sort, fetchBatch, loadTierData])

  const advance = useCallback((dir: 1 | -1) => {
    setIdx(prev => {
      const next = prev + dir
      const filtered = items.filter(i => filter.has(i.type))
      if (next < 0 || next >= filtered.length) return prev
      if (next >= filtered.length - 3) loadMore()
      return next
    })
  }, [items, filter, loadMore])

  // Wheel — exactly one card per gesture, regardless of scroll speed.
  // Accumulate deltaY; once the threshold is crossed fire once and lock
  // for 650 ms so momentum/coast events are absorbed.
  function onWheel(e: React.WheelEvent) {
    if (wheelLock.current) return

    clearTimeout(wheelIdleTimer.current)
    wheelAccum.current += e.deltaY

    // Mouse-wheel one click ≈ 100–120px; trackpad swipe accumulates gradually.
    const THRESHOLD = 60
    if (Math.abs(wheelAccum.current) >= THRESHOLD) {
      const dir = wheelAccum.current > 0 ? 1 : -1
      wheelAccum.current = 0
      wheelLock.current = true
      setTimeout(() => { wheelLock.current = false }, 650)
      advance(dir)
    } else {
      // Idle: reset accumulator after 150 ms with no scroll events
      wheelIdleTimer.current = setTimeout(() => { wheelAccum.current = 0 }, 150)
    }
  }

  // Touch
  function onTouchStart(e: React.TouchEvent) { touchY.current = e.touches[0].clientY }
  function onTouchEnd(e: React.TouchEvent) {
    const delta = touchY.current - e.changedTouches[0].clientY
    if (Math.abs(delta) > 40) advance(delta > 0 ? 1 : -1)
  }

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') advance(1)
      if (e.key === 'ArrowUp'   || e.key === 'k') advance(-1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [advance])

  function toggleFilter(t: MemeSourceType) {
    setFilter(prev => {
      const next = new Set(prev)
      if (next.has(t)) { if (next.size > 1) next.delete(t) }
      else next.add(t)
      return next
    })
  }

  const visible = sortItems(items.filter(i => filter.has(i.type)), sort)
  const currentItem = visible[idx] ?? null

  // Sync local vote state whenever the card at idx changes
  useEffect(() => {
    if (!currentItem) { setLocalVote(null); return }
    setLocalVote({
      upVotes:   currentItem.up_votes   ?? 0,
      downVotes: currentItem.down_votes ?? 0,
      yourVote:  currentItem.your_vote  ?? null,
      tier:      currentItem.tier       ?? 'fresh',
      voting:    false,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.key])

  const handleVote = useCallback(async (dir: 1 | -1) => {
    if (!currentItem || localVote?.voting) return
    const prevYourVote = localVote?.yourVote ?? null
    const newYourVote: 1 | -1 | null = prevYourVote === dir ? null : dir
    setLocalVote(prev => prev ? { ...prev, voting: true } : prev)
    try {
      const result = await castVote(currentItem.sourceId, currentItem.type, dir, address)
      setLocalVote({ upVotes: result.up_votes, downVotes: result.down_votes, yourVote: newYourVote, tier: result.tier, voting: false })
      setItems(prev => prev.map(item =>
        item.key === currentItem.key
          ? { ...item, up_votes: result.up_votes, down_votes: result.down_votes, tier: result.tier, your_vote: newYourVote ?? undefined }
          : item
      ))
    } catch (err) {
      console.error('Vote failed:', err)
      setLocalVote(prev => prev ? { ...prev, voting: false } : prev)
    }
  }, [currentItem, localVote, address])

  // Render one slide; vote buttons are co-rendered inside current slide as a flex sibling
  function renderSlide(visIdx: number) {
    const item = visible[visIdx]
    if (!item) return null
    const offset = visIdx - idx
    if (offset < -1 || offset > 1) return null
    const cls = offset < 0 ? 'prev' : offset > 0 ? 'next' : 'current'
    const isCurrent = cls === 'current'
    return (
      <div key={item.key} className={`feed-slide feed-slide--${cls}`}>
        <FeedCard item={item} address={address} onOpen={onOpenItem} />
        {isCurrent && localVote && (
          <div className="feed-actions">

            {/* 👍 Upvote */}
            <button
              className={`feed-action-btn feed-action-btn--up ${localVote.yourVote === 1 ? 'active' : ''}`}
              onClick={() => handleVote(1)}
              disabled={localVote.voting}
              title="Upvote"
            >
              <div className="feed-action-icon">
                <span className="feed-action-icon-glyph">👍</span>
              </div>
              <span className="feed-action-label">{localVote.upVotes > 0 ? localVote.upVotes.toLocaleString() : '0'}</span>
            </button>

            {/* 👎 Downvote */}
            <button
              className={`feed-action-btn feed-action-btn--down ${localVote.yourVote === -1 ? 'active' : ''}`}
              onClick={() => handleVote(-1)}
              disabled={localVote.voting}
              title="Downvote"
            >
              <div className="feed-action-icon">
                <span className="feed-action-icon-glyph">👎</span>
              </div>
              <span className="feed-action-label">{localVote.downVotes > 0 ? localVote.downVotes.toLocaleString() : '0'}</span>
            </button>

            {/* 💬 Comments */}
            <button
              className="feed-action-btn"
              onClick={() => setShowComments(true)}
              title="Comments"
            >
              <div className="feed-action-icon">
                <span className="feed-action-icon-glyph">💬</span>
              </div>
              <span className="feed-action-label">Comments</span>
            </button>

            {/* Share to X */}
            <button
              className="feed-action-btn"
              onClick={() => {
                const url = item.type === 'reddit' && item.redditPermalink
                  ? `https://reddit.com${item.redditPermalink}`
                  : window.location.href
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(item.title)}&url=${encodeURIComponent(url)}`,
                  '_blank', 'noopener,noreferrer'
                )
              }}
              title="Share to X"
            >
              <div className="feed-action-icon">
                <span className="feed-action-icon-glyph" style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800 }}>𝕏</span>
              </div>
              <span className="feed-action-label">Share</span>
            </button>

            {/* Creator profile */}
            {(item.wallet || item.redditPermalink) && (
              <button
                className="feed-action-btn"
                onClick={() => {
                  if (item.type === 'reddit' && item.redditPermalink) {
                    window.open(`https://reddit.com${item.redditPermalink}`, '_blank', 'noopener,noreferrer')
                  } else if (item.wallet && onOpenProfile) {
                    onOpenProfile(item.wallet)
                  }
                }}
                title="Creator"
              >
                <div className="feed-action-icon">
                  <span className="feed-action-icon-glyph">👤</span>
                </div>
                <span className="feed-action-label">{item.type === 'reddit' ? 'Reddit' : 'Profile'}</span>
              </button>
            )}

          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="feed-root"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="feed-topbar">
        <div className="feed-sort-tabs">
          {(Object.keys(SORT_LABELS) as SortMode[]).map(s => (
            <button key={s} className={`feed-sort-tab ${sort === s ? 'active' : ''}`} onClick={() => setSort(s)}>
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="feed-filter-chips">
          {(['studio', 'factory', 'reddit'] as MemeSourceType[]).map(t => (
            <button
              key={t}
              className={`feed-filter-chip feed-filter-chip--${t} ${filter.has(t) ? 'active' : ''}`}
              onClick={() => toggleFilter(t)}
            >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        {visible.length > 0 && (
          <span className="feed-counter">{idx + 1} / {visible.length}</span>
        )}
      </div>

      {/* Feed body: carousel + optional comments panel side-by-side */}
      <div className="feed-body">
        {loading ? (
          <div className="feed-state">Loading…</div>
        ) : !visible.length ? (
          <div className="feed-state">Nothing to show.</div>
        ) : (
          <div className="feed-carousel">
            {[idx - 1, idx, idx + 1].map(i => renderSlide(i))}

            {/* Scroll position hint */}
            {visible.length > 1 && (
              <div className="feed-scroll-hint" aria-hidden>
                <span className="feed-scroll-hint-arrow">▲</span>
                <div className="feed-scroll-hint-track">
                  <div
                    className="feed-scroll-hint-thumb"
                    style={{
                      top:    `${(idx / Math.max(1, visible.length - 1)) * 70}%`,
                      height: `${Math.max(6, Math.round(100 / visible.length))}%`,
                    }}
                  />
                </div>
                <span className="feed-scroll-hint-arrow">▼</span>
              </div>
            )}
          </div>
        )}

        {showComments && currentItem && (
          <CommentsPanel
            item={currentItem}
            address={address}
            onClose={() => setShowComments(false)}
          />
        )}
      </div>
    </div>
  )
}
