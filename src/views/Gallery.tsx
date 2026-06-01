import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchGalleryMemes, studioMemeImageUrl } from '../api/studio'
import { fetchMemes, imageUrl } from '../api/memes'
import { truncateAddress } from '../wallet'
import type { UnifiedMemeItem, MemeSourceType } from '../types/unified'
import '../gallery.css'

interface BankPost {
  id: string
  title: string
  image_url: string
  score: number
  date: string
  topic: string | null
  left_title: string | null
  right_title: string | null
  left_labels: string[]
  right_labels: string[]
  permalink: string
}

interface Props {
  address: string
  onOpenItem: (item: UnifiedMemeItem) => void
}

const BADGE: Record<MemeSourceType, { label: string; cls: string }> = {
  studio:  { label: 'STUDIO',  cls: 'badge--studio'  },
  factory: { label: 'FACTORY', cls: 'badge--factory' },
  reddit:  { label: 'REDDIT',  cls: 'badge--reddit'  },
}

function toIso(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d + 'T00:00:00Z'
  return d
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function Gallery({ onOpenItem }: Props) {
  const [items,       setItems]       = useState<UnifiedMemeItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter,      setFilter]      = useState<Set<MemeSourceType>>(new Set(['studio', 'factory', 'reddit']))
  const pages   = useRef({ studio: 1, factory: 1, reddit: 1 })
  const hasMore = useRef({ studio: true, factory: true, reddit: true })

  const fetchPage = useCallback(async (p: { studio: number; factory: number; reddit: number }) => {
    const [sr, fr, rr] = await Promise.allSettled([
      hasMore.current.studio  ? fetchGalleryMemes(p.studio,  40) : Promise.resolve(null),
      hasMore.current.factory ? fetchMemes(p.factory, 40)         : Promise.resolve(null),
      hasMore.current.reddit
        ? fetch(`/memebank?page=${p.reddit}&limit=40&sort=top`).then(r => r.json())
        : Promise.resolve(null),
    ])

    const next: UnifiedMemeItem[] = []

    if (sr.status === 'fulfilled' && sr.value) {
      sr.value.items.forEach(m => next.push({
        key: `studio:${m.id}`, type: 'studio',
        imageUrl: studioMemeImageUrl(m.id), sourceId: m.id,
        title:   m.characters.map((c: string) => c.replace(/_/g, ' ')).join(', ') || '—',
        meta:    truncateAddress(m.wallet), wallet: m.wallet,
        dateIso: toIso(m.created_at),
      }))
      hasMore.current.studio = sr.value.has_next
      pages.current.studio = p.studio + 1
    }

    if (fr.status === 'fulfilled' && fr.value) {
      fr.value.items.forEach((m: { job_id: string; meme_id: string | null; wallet: string | null; created_at: string }) => next.push({
        key: `factory:${m.job_id}`, type: 'factory',
        imageUrl: imageUrl(m.job_id), sourceId: m.job_id,
        title:   m.meme_id ? m.meme_id.replace(/_/g, ' ') : '—',
        meta:    m.wallet ? truncateAddress(m.wallet) : '—', wallet: m.wallet ?? undefined,
        dateIso: toIso(m.created_at),
      }))
      hasMore.current.factory = fr.value.has_next
      pages.current.factory = p.factory + 1
    }

    if (rr.status === 'fulfilled' && rr.value) {
      rr.value.items.forEach((p2: BankPost) => next.push({
        key: `reddit:${p2.id}`, type: 'reddit',
        imageUrl: p2.image_url, sourceId: p2.id,
        title:   p2.title, meta: `▲ ${p2.score.toLocaleString()}`,
        dateIso: toIso(p2.date),
        redditPermalink: p2.permalink, redditScore: p2.score,
        redditTopic: p2.topic,
        redditLeftTitle:  p2.left_title,  redditRightTitle: p2.right_title,
        redditLeftLabels: p2.left_labels, redditRightLabels: p2.right_labels,
      }))
      hasMore.current.reddit = rr.value.has_next
      pages.current.reddit = p.reddit + 1
    }

    return next
  }, [])

  useEffect(() => {
    setLoading(true)
    pages.current  = { studio: 1, factory: 1, reddit: 1 }
    hasMore.current = { studio: true, factory: true, reddit: true }
    fetchPage({ studio: 1, factory: 1, reddit: 1 })
      .then(next => setItems(next.sort((a, b) => b.dateIso.localeCompare(a.dateIso))))
      .finally(() => setLoading(false))
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = await fetchPage({ ...pages.current })
      setItems(prev => {
        const seen = new Set(prev.map(i => i.key))
        return [...prev, ...next.filter(i => !seen.has(i.key))]
          .sort((a, b) => b.dateIso.localeCompare(a.dateIso))
      })
    } finally { setLoadingMore(false) }
  }, [loadingMore, fetchPage])

  function toggleFilter(t: MemeSourceType) {
    setFilter(prev => {
      const next = new Set(prev)
      if (next.has(t)) { if (next.size > 1) next.delete(t) }
      else next.add(t)
      return next
    })
  }

  const visible = items.filter(i => filter.has(i.type))
  const canLoadMore = hasMore.current.studio || hasMore.current.factory || hasMore.current.reddit

  return (
    <div className="gallery-root">
      <div className="gallery-header">
        <h1>Memes</h1>
        <div className="gallery-filters">
          {(['studio', 'factory', 'reddit'] as MemeSourceType[]).map(t => (
            <button
              key={t}
              className={`gallery-filter-btn gallery-filter-btn--${t} ${filter.has(t) ? 'active' : ''}`}
              onClick={() => toggleFilter(t)}
            >
              {BADGE[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="gallery-body">
        {loading ? (
          <p className="gallery-empty">Loading…</p>
        ) : !visible.length ? (
          <p className="gallery-empty">Nothing to show.</p>
        ) : (
          <>
            <div className="gallery-grid">
              {visible.map(item => (
                <div
                  key={item.key}
                  className="gallery-card"
                  onClick={() => onOpenItem(item)}
                >
                  <div className="gallery-card-img">
                    <img src={item.imageUrl} alt={item.title} loading="lazy" />
                  </div>
                  <span className={`gallery-badge ${BADGE[item.type].cls}`}>{BADGE[item.type].label}</span>
                  <div className="gallery-card-info">
                    <div className="gallery-card-chars">{item.title}</div>
                    <div className="gallery-card-meta">
                      <span className="gallery-card-creator">{item.meta}</span>
                      <span className="gallery-card-date">{formatDate(item.dateIso)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {canLoadMore && (
              <button className="gallery-load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
