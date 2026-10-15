import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { fetchGalleryMemes, studioMemeImageUrl } from '../api/studio'
import { fetchMemes, imageUrl } from '../api/memes'
import { fetchFollowing } from '../api/follow'
import {
  loadPrefs, savePrefs, recordSignal, personalBoost, explorationNoise, emptyPrefs,
  type FeedPrefs, type EngagementSignal,
} from '../lib/feedPrefs'
import { truncateAddress } from '../wallet'
import { FeedCard } from '../components/FeedCard'
import { CommentsPanel } from '../components/CommentsPanel'
import { castVote, trackFeedAction } from '../api/votes'
import { dispatchXP } from '../api/player'
import { XPGain } from '../components/XPGain'
import { CHARACTERS } from '../data/characterLore'
import type { UnifiedMemeItem, MemeSourceType, MemeTier } from '../types/unified'
import { fetchXStatus, postXTweet, fetchMyShares, type TweetShare } from '../api/twitter'
import { useXMetrics } from '../hooks/useXMetrics'
import './Feed.css'

// ── Feed session cache ────────────────────────────────────────────────────────
// v3: includes noiseMap + sessionPrefs so remounts restore the exact same order.
// No app-level TTL — sessionStorage expires naturally when the browser tab closes.
const FEED_CACHE_KEY = 'vvc-feed-state-v3'

type FeedCache = {
  items: UnifiedMemeItem[]
  idx: number
  sort: SortMode
  topPeriod: TopPeriod
  filter: MemeSourceType[]
  filterChars: string[]
  heroActive: boolean
  pages: { studio: number; factory: number; reddit: number }
  hasMore: { studio: boolean; factory: boolean; reddit: boolean }
  savedAt: number
  noiseMap?: Record<string, number>
  sessionPrefs?: FeedPrefs
  sortedKeys?: string[]
}

function readFeedCache(): FeedCache | null {
  try {
    const raw = sessionStorage.getItem(FEED_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FeedCache
  } catch { return null }
}

function writeFeedCache(c: FeedCache) {
  try { sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify(c)) } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────

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

type TopPeriod = 'day' | 'week' | 'month' | 'year' | 'all'
const TOP_PERIOD_LABELS: Record<TopPeriod, string> = {
  day: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', all: 'All Time',
}
const TOP_PERIOD_HOURS: Record<TopPeriod, number> = {
  day: 24, week: 168, month: 720, year: 8760, all: Infinity,
}

function toIso(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00Z' : d
}

function ageHours(dateIso: string) {
  return (Date.now() - new Date(dateIso).getTime()) / 3_600_000
}

function sortItems(
  items: UnifiedMemeItem[],
  mode: SortMode,
  topPeriod: TopPeriod = 'week',
  followedWallets: Set<string> = new Set(),
  prefs: FeedPrefs = emptyPrefs(),
  // noiseFor is injected so the component can cache one noise value per item key,
  // making the foryou order stable across re-renders within the same session.
  noiseFor: (key: string) => number = () => explorationNoise(),
): UnifiedMemeItem[] {
  const copy = [...items]
  switch (mode) {
    case 'fresh':
      return copy.sort((a, b) => b.dateIso.localeCompare(a.dateIso))
    case 'top': {
      const maxHours = TOP_PERIOD_HOURS[topPeriod]
      const filtered = maxHours === Infinity ? copy : copy.filter(i => ageHours(i.dateIso) <= maxHours)
      return filtered.sort((a, b) => {
        const sa = (a.up_votes ?? 0) - (a.down_votes ?? 0) + (a.redditScore ?? 0)
        const sb = (b.up_votes ?? 0) - (b.down_votes ?? 0) + (b.redditScore ?? 0)
        return sb - sa
      })
    }
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
      // Personalised score: global popularity × recency × follow boost × taste boost × exploration noise
      // Each component is independent so the feed is always full of content — follows/taste just re-rank it.
      return copy.sort((a, b) => {
        // Global quality baseline (floor at 0.5 so fresh memes still compete)
        const qA = Math.max(0.5, (a.up_votes ?? 0) - (a.down_votes ?? 0)) + (a.redditScore ?? 0) / 60
        const qB = Math.max(0.5, (b.up_votes ?? 0) - (b.down_votes ?? 0)) + (b.redditScore ?? 0) / 60
        // Recency — halves every 24 h
        const decayA = 1 / (1 + ageHours(a.dateIso) / 24)
        const decayB = 1 / (1 + ageHours(b.dateIso) / 24)
        // Follow boost — followed creators get a lift but don't monopolise
        const followA = a.wallet && followedWallets.has(a.wallet) ? 2 : 1
        const followB = b.wallet && followedWallets.has(b.wallet) ? 2 : 1
        // Taste boost from engagement history (1 for cold start, up to ~6× for preferred content)
        const tasteA = personalBoost(a, prefs)
        const tasteB = personalBoost(b, prefs)
        // Exploration noise — slight randomness so the feed feels alive and surfaces new content
        const noiseA = noiseFor(a.key)
        const noiseB = noiseFor(b.key)
        return (qB * decayB * followB * tasteB * noiseB) - (qA * decayA * followA * tasteA * noiseA)
      })
  }
}

interface Props {
  address: string
  onOpenItem: (item: UnifiedMemeItem) => void
  onOpenProfile?: (wallet: string) => void
  onRemix?: (sourceId: string) => void
  onOpenStudio?: () => void
  onOpenFactory?: () => void
}

const CONFETTI_COLORS = ['#ff4d4d','#ffd700','#4dff91','#4dc8ff','#ff4dce','#fff','#1d9bf0','#ff922b']
function XConfetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => i), []
  )
  return (
    <>
      {pieces.map(i => (
        <span key={i} className="feed-xconfetti-piece" style={{
          '--x':        `${Math.random() * 100}vw`,
          '--delay':    `${(Math.random() * 0.9).toFixed(2)}s`,
          '--duration': `${(0.9 + Math.random() * 0.9).toFixed(2)}s`,
          '--color':    CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          '--rot':      `${Math.floor(Math.random() * 360)}deg`,
        } as React.CSSProperties} />
      ))}
    </>
  )
}

export function Feed({ address, onOpenItem, onOpenProfile, onRemix, onOpenStudio, onOpenFactory }: Props) {
  // Read session cache exactly once on first render
  const _initCache = useRef<FeedCache | null | undefined>(undefined)
  if (_initCache.current === undefined) _initCache.current = readFeedCache()
  const cache = _initCache.current

  const [items,       setItems]       = useState<UnifiedMemeItem[]>(() => cache?.items ?? [])
  const [loading,     setLoading]     = useState(() => !cache || cache.items.length === 0)
  const [idx,         setIdx]         = useState(() => cache?.idx ?? 0)
  const [heroActive,  setHeroActive]  = useState(() => cache?.heroActive ?? true)
  const [heroLeaving, setHeroLeaving] = useState(false)
  const heroLeavingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sort,        setSort]        = useState<SortMode>(() => cache?.sort ?? 'foryou')
  const [topPeriod,   setTopPeriod]   = useState<TopPeriod>(() => cache?.topPeriod ?? 'week')
  const [filter,      setFilter]      = useState<Set<MemeSourceType>>(() => new Set(cache?.filter ?? ['studio', 'factory', 'reddit']))
  const [filterChars, setFilterChars] = useState<Set<string>>(() => new Set(cache?.filterChars ?? []))
  const [localVote,     setLocalVote]     = useState<{
    upVotes: number; downVotes: number; yourVote: 1|-1|null; tier: MemeTier; voting: boolean
  } | null>(null)
  const [showComments,  setShowComments]  = useState(false)
  const [xpGain, setXpGain] = useState<{ amount: number; key: number } | null>(null)
  // connect = no X account yet; compose = ready to post; posting = awaiting API; success = tweet live
  const [shareModal,  setShareModal]  = useState<null | 'connect' | 'compose' | 'posting' | 'success'>(null)
  const [shareItem,   setShareItem]   = useState<UnifiedMemeItem | null>(null)
  const [tweetText,   setTweetText]   = useState('')
  const [tweetUrl,    setTweetUrl]    = useState('')
  const [tweetId,     setTweetId]     = useState<string | null>(null)
  const [xHandle,     setXHandle]     = useState<string | null>(null)
  const [shareInCommunity, setShareInCommunity] = useState(false)
  const shareItemRef   = useRef<UnifiedMemeItem | null>(null)
  const tweetTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [myShares,    setMyShares]    = useState<TweetShare[]>([])
  const xMetrics = useXMetrics(address || null)
  const [followingSet,  setFollowingSet]  = useState<Set<string>>(new Set())
  const [feedPrefs, setFeedPrefsState] = useState<FeedPrefs>(() =>
    address ? loadPrefs(address) : emptyPrefs(),
  )
  // Incrementing this forces the load effect to re-run even if sort hasn't changed.
  const [refreshKey, setRefreshKey] = useState(0)
  // Refs for skip/view detection — kept in refs to avoid stale closures
  const prevItemRef  = useRef<UnifiedMemeItem | null>(null)
  const itemShownAt  = useRef<number>(Date.now())
  // Prefs snapshot frozen at session start — restored from sessionStorage on remount
  // so tab-switching never re-sorts. Fresh values come in only on F5 or Refresh.
  const sessionPrefsRef = useRef<FeedPrefs>(
    cache?.sessionPrefs ?? (address ? loadPrefs(address) : emptyPrefs()),
  )
  // Noise cache restored from sessionStorage on remount so item order is identical.
  const noiseCacheRef = useRef<Map<string, number>>(
    cache?.noiseMap ? new Map(Object.entries(cache.noiseMap)) : new Map(),
  )
  // Locked sort order for this session — key sequence from the last computed visible list.
  // useMemo uses this to reorder items without re-running sortItems, so vote updates from
  // loadTierData can't reposition items mid-session.
  const sessionSortRef = useRef<string[] | null>(cache?.sortedKeys ?? null)
  const getItemNoise = useCallback((key: string) => {
    if (!noiseCacheRef.current.has(key)) noiseCacheRef.current.set(key, explorationNoise())
    return noiseCacheRef.current.get(key)!
  }, [])
  // visibleRef lets effects read the latest visible list without it being a dep
  const visibleRef = useRef<UnifiedMemeItem[]>([])
  const pages   = useRef(cache?.pages   ?? { studio: 1, factory: 1, reddit: 1 })
  const hasMore = useRef(cache?.hasMore ?? { studio: true, factory: true, reddit: true })
  const sortWhenLoaded = useRef<SortMode | null>(null)
  const loading_more  = useRef(false)
  const wheelLock     = useRef(false)
  const wheelAccum    = useRef(0)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const touchY        = useRef(0)
  const tierCache          = useRef<Map<string, TierRow>>(new Map())
  const charPickerBarRef   = useRef<HTMLDivElement>(null)
  const charPickerRowRef   = useRef<HTMLDivElement>(null)
  const charPickerInnerRef = useRef<HTMLDivElement>(null)

  // Always-fresh ref for save-on-unmount (avoids stale closure in cleanup)
  const latestRef = useRef({ items, idx, sort, topPeriod, filter, filterChars, heroActive })
  useEffect(() => { latestRef.current = { items, idx, sort, topPeriod, filter, filterChars, heroActive } })

  // Load following list for foryou boost
  useEffect(() => {
    if (!address) return
    fetchFollowing(address).then(list => setFollowingSet(new Set(list))).catch(() => {})
  }, [address])

  // Load shares so we know which feed cards have been posted to X
  useEffect(() => {
    if (!address) return
    fetchMyShares(address).then(setMyShares).catch(() => {})
  }, [address])


  // Clear noise cache and locked sort order only when the user actively changes sort mode.
  // Using a prevSort ref prevents this from firing on initial mount (which would undo the
  // session-restore we just loaded from sessionStorage).
  const prevSortRef = useRef<SortMode | null>(null)
  useEffect(() => {
    if (prevSortRef.current !== null && prevSortRef.current !== sort) {
      noiseCacheRef.current.clear()
      sessionSortRef.current = null
    }
    prevSortRef.current = sort
  }, [sort])

  // ── Personalisation signal helpers ────────────────────────────────────────
  const recordSignalForItem = useCallback((item: UnifiedMemeItem, signal: EngagementSignal) => {
    if (!address) return
    setFeedPrefsState(prev => {
      const next = recordSignal(prev, signal, item)
      savePrefs(address, next)
      return next
    })
  }, [address])

  // Detect skip when the user advances past an item in under 1.6 s
  useEffect(() => {
    const item = visibleRef.current[idx] ?? null
    const now   = Date.now()
    const dwell = now - itemShownAt.current
    const prev  = prevItemRef.current

    if (prev && dwell > 150 && dwell < 1600) {
      recordSignalForItem(prev, 'skip')
      trackFeedAction(address, prev.sourceId, prev.type, 'skip', dwell)
    }

    prevItemRef.current = item
    itemShownAt.current = now
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, sort])

  // Record a 'view' signal after 5 s of uninterrupted viewing in foryou mode
  useEffect(() => {
    if (sort !== 'foryou') return
    const item = visibleRef.current[idx] ?? null
    if (!item) return
    const timer = setTimeout(() => recordSignalForItem(item, 'view'), 5000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, sort])

  // Persist full feed state (incl. noise map + prefs snapshot) when navigating away.
  // Restored on remount so tab-switching never changes the sort order.
  useEffect(() => {
    return () => {
      const s = latestRef.current
      writeFeedCache({
        items: s.items, idx: s.idx, sort: s.sort, topPeriod: s.topPeriod,
        filter: [...s.filter], filterChars: [...s.filterChars],
        heroActive: s.heroActive,
        pages: { ...pages.current }, hasMore: { ...hasMore.current },
        savedAt: Date.now(),
        noiseMap: Object.fromEntries(noiseCacheRef.current),
        sessionPrefs: sessionPrefsRef.current,
        sortedKeys: sessionSortRef.current ?? visibleRef.current.map(i => i.key),
      })
    }
  }, [])

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
    // Wrap each source in a 6 s timeout so a slow/unreachable remote never blocks the feed.
    const withTimeout = <T,>(promise: Promise<T>, ms = 6000): Promise<T> =>
      Promise.race([promise, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
    const [sr, fr, rr] = await Promise.allSettled([
      hasMore.current.studio  ? withTimeout(fetchGalleryMemes(p.studio, 10))  : Promise.resolve(null),
      hasMore.current.factory ? withTimeout(fetchMemes(p.factory, 10))         : Promise.resolve(null),
      hasMore.current.reddit  ? withTimeout(fetch(`/memebank?page=${p.reddit}&limit=10&sort=${redditSort}`).then(r => r.json())) : Promise.resolve(null),
    ])
    const next: UnifiedMemeItem[] = []
    if (sr.status === 'fulfilled' && sr.value) {
      sr.value.items.forEach((m: { id: string; wallet: string; characters: string[]; created_at: string; has_draft?: boolean; remixed_from?: string | null }) => next.push({
        key: `studio:${m.id}`, type: 'studio', sourceId: m.id,
        imageUrl: studioMemeImageUrl(m.id),
        title: m.characters.map((c: string) => c.replace(/_/g, ' ')).join(', ') || '—',
        meta: truncateAddress(m.wallet), wallet: m.wallet, dateIso: toIso(m.created_at),
        characters: m.characters,
        has_draft: m.has_draft,
        remixed_from: m.remixed_from ?? undefined,
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

  // Explicit refresh: clear session cache, take latest prefs, re-fetch from scratch.
  // Normal tab-switching preserves state — only F5 or this button starts fresh.
  const handleRefresh = useCallback(() => {
    sessionStorage.removeItem(FEED_CACHE_KEY)
    noiseCacheRef.current.clear()
    sessionSortRef.current = null
    sessionPrefsRef.current = address ? loadPrefs(address) : emptyPrefs()
    pages.current   = { studio: 1, factory: 1, reddit: 1 }
    hasMore.current = { studio: true, factory: true, reddit: true }
    sortWhenLoaded.current = null
    setItems([])
    setIdx(0)
    setHeroActive(true)
    setHeroLeaving(false)
    setRefreshKey(k => k + 1)
  }, [address])

  useEffect(() => {
    // Cache hit on mount: restore saved feed state, skip full reload
    if (_initCache.current !== null && _initCache.current !== undefined && _initCache.current.items.length > 0) {
      sortWhenLoaded.current = sort
      _initCache.current = null
      void loadTierData()
      return
    }
    _initCache.current = null
    // StrictMode guard: skip if this exact sort was already loaded (double-invoke protection)
    if (sortWhenLoaded.current === sort) return
    sortWhenLoaded.current = sort
    setLoading(true)
    setIdx(0)
    setHeroActive(true)
    setHeroLeaving(false)
    pages.current   = { studio: 1, factory: 1, reddit: 1 }
    hasMore.current = { studio: true, factory: true, reddit: true }
    // loadTierData enriches vote counts — run it in parallel but don't let it block rendering.
    void loadTierData()
    fetchBatch({ studio: 1, factory: 1, reddit: 1 }, sort)
      .then(next => {
        setItems(sortItems(next, sort, topPeriod, followingSet, sessionPrefsRef.current, getItemNoise))
      })
      .finally(() => setLoading(false))
  }, [sort, fetchBatch, loadTierData, refreshKey])

  function itemMatchesCharFilter(item: UnifiedMemeItem): boolean {
    if (filterChars.size === 0) return true
    if (item.type === 'studio' && item.characters?.length) {
      return item.characters.some(c => filterChars.has(c))
    }
    if (item.type === 'factory' && item.title) {
      const t = item.title.toLowerCase()
      for (const ck of filterChars) if (t.includes(ck.replace(/_/g, ' ').toLowerCase())) return true
    }
    if (item.type === 'reddit') {
      const names = [item.redditLeftTitle, item.redditRightTitle].filter(Boolean).map(s => s!.toLowerCase())
      for (const ck of filterChars) if (names.some(n => n.includes(ck.replace(/_/g, ' ').toLowerCase()))) return true
    }
    return false
  }

  const advance = useCallback((dir: 1 | -1) => {
    window.dispatchEvent(new CustomEvent('vvc:feed-advance', { detail: dir }))
    if (heroActive) {
      if (dir === 1) {
        setHeroLeaving(true)
        if (heroLeavingTimerRef.current) clearTimeout(heroLeavingTimerRef.current)
        heroLeavingTimerRef.current = setTimeout(() => {
          setHeroActive(false)
          setHeroLeaving(false)
        }, 280)
      }
      return
    }
    setIdx(prev => {
      if (dir === -1 && prev === 0) { setHeroActive(true); return 0 }
      const filtered = items.filter(i => filter.has(i.type))
      const next = prev + dir
      if (next < 0 || next >= filtered.length) return prev
      if (next >= filtered.length - 3) loadMore()
      return next
    })
  }, [items, filter, loadMore, heroActive])

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

  // Character picker — hover-driven slide + drag
  useEffect(() => {
    const bar   = charPickerBarRef.current
    const row   = charPickerRowRef.current
    const inner = charPickerInnerRef.current
    if (!bar || !row || !inner) return

    // Sum each chip's own offsetWidth — unaffected by any parent overflow/BFC.
    // This is the only reliable measure when all the CSS overflow tricks fail.
    const getOverflow = () => {
      const chips = Array.from(inner.children) as HTMLElement[]
      if (!chips.length) return 0
      const totalW = chips.reduce((s, c, i) => s + c.offsetWidth + (i > 0 ? 6 : 0), 0)
      return Math.max(0, totalW - row.offsetWidth)
    }
    const clampTX     = (tx: number) => Math.min(0, Math.max(-getOverflow(), tx))
    const setTX       = (tx: number) => { inner.style.transform = `translateX(${tx}px)` }
    const currentTX   = () => {
      const m = inner.style.transform.match(/translateX\((-?[\d.]+)px\)/)
      return m ? parseFloat(m[1]) : 0
    }

    let dragging   = false
    let dragStartX = 0
    let dragStartT = 0
    let didDrag    = false

    const onMouseDown = (e: MouseEvent) => {
      dragging   = true
      didDrag    = false
      dragStartX = e.clientX
      dragStartT = currentTX()
      row.style.cursor     = 'grabbing'
      row.style.userSelect = 'none'
    }

    const onMouseUp = () => {
      if (didDrag) row.addEventListener('click', e => e.stopPropagation(), { once: true, capture: true })
      dragging = false
      row.style.cursor     = ''
      row.style.userSelect = ''
    }

    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = dragStartX - e.clientX
        if (!didDrag && Math.abs(dx) > 4) didDrag = true
        if (didDrag) { setTX(clampTX(dragStartT - dx)); return }
      }
      const barRect = bar.getBoundingClientRect()
      if (e.clientY < barRect.top || e.clientY > barRect.bottom) return
      const relX     = Math.max(0, Math.min(1, (e.clientX - barRect.left) / barRect.width))
      const overflow = getOverflow()
      if (overflow <= 0) return
      setTX(-relX * overflow)
    }

    row.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      row.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function toggleFilter(t: MemeSourceType) {
    setFilter(prev => {
      if (prev.has(t) && prev.size === 1) return new Set(['studio', 'factory', 'reddit'])
      return new Set([t])
    })
    setIdx(0)
    setHeroActive(true)
    setHeroLeaving(false)
  }

  const activeCategory: 'all' | 'studio' | 'factory' | 'reddit' =
    filter.size === 1 && filter.has('studio')  ? 'studio'  :
    filter.size === 1 && filter.has('factory') ? 'factory' :
    filter.size === 1 && filter.has('reddit')  ? 'reddit'  : 'all'

  // feedPrefs intentionally excluded — the order is computed once per session
  // (prefs are snapshotted at mount). Signals recorded during scrolling are
  // saved and will reshape the feed on the NEXT session, not mid-scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => {
    const filtered = items.filter(i => filter.has(i.type) && itemMatchesCharFilter(i))

    // If a locked order exists for this session, restore it exactly.
    // New items appended after the locked block in fresh sort order.
    // This prevents loadTierData (fresh vote counts) from repositioning items.
    if (sessionSortRef.current) {
      const keyOrder = new Map(sessionSortRef.current.map((k, i) => [k, i]))
      const inOrder: typeof filtered = []
      const newItems: typeof filtered = []
      filtered.forEach(item => (keyOrder.has(item.key) ? inOrder : newItems).push(item))
      inOrder.sort((a, b) => (keyOrder.get(a.key) ?? 99999) - (keyOrder.get(b.key) ?? 99999))
      const appended = sortItems(newItems, sort, topPeriod, followingSet, sessionPrefsRef.current, getItemNoise)
      const result = [...inOrder, ...appended]
      sessionSortRef.current = result.map(i => i.key)
      return result
    }

    // Fresh sort — lock the order for the rest of this session.
    const sorted = sortItems(filtered, sort, topPeriod, followingSet, sessionPrefsRef.current, getItemNoise)
    sessionSortRef.current = sorted.map(i => i.key)
    return sorted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort, topPeriod, filter, filterChars, followingSet, getItemNoise])
  visibleRef.current = visible
  const currentItem = visible[idx] ?? null

  // meme_id → tweet_id for memes this user has already shared to X
  const sharedMemeMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of myShares) { if (s.tweet_id) m.set(s.meme_id, s.tweet_id) }
    return m
  }, [myShares])

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
      // Update item in place + tier cache so vote state survives navigation.
      // sessionSortRef stays locked so foryou order never shifts mid-session.
      const cacheKey = `${currentItem.sourceId}:${currentItem.type}`
      const prev = tierCache.current.get(cacheKey)
      tierCache.current.set(cacheKey, {
        meme_id: currentItem.sourceId, meme_source: currentItem.type,
        tier: result.tier, score: result.up_votes - result.down_votes,
        velocity: prev?.velocity ?? 0,
        up_votes: result.up_votes, down_votes: result.down_votes,
        your_vote: newYourVote,
      })
      setItems(prev => prev.map(i =>
        i.key === currentItem.key
          ? { ...i, up_votes: result.up_votes, down_votes: result.down_votes, your_vote: newYourVote, tier: result.tier }
          : i
      ))
      recordSignalForItem(currentItem, dir === 1 ? 'vote_up' : 'vote_down')
      if (result.xp_awarded > 0) {
        dispatchXP(result.xp_awarded)
        setXpGain({ amount: result.xp_awarded, key: Date.now() })
      }
    } catch (err) {
      console.error('Vote failed:', err)
      setLocalVote(prev => prev ? { ...prev, voting: false } : prev)
    }
  }, [currentItem, localVote, address, recordSignalForItem])

  // Render one slide; vote buttons are co-rendered inside current slide as a flex sibling
  function renderSlide(visIdx: number, forceClass?: 'prev' | 'current' | 'next', heropeek?: boolean) {
    const item = visible[visIdx]
    if (!item) return null
    const offset = visIdx - idx
    if (!forceClass && (offset < -1 || offset > 1)) return null
    const cls = forceClass ?? (offset < 0 ? 'prev' : offset > 0 ? 'next' : 'current')
    const isCurrent = cls === 'current'
    const sharedTweetId = sharedMemeMap.get(item.sourceId)
    const sharedMetrics = sharedTweetId ? xMetrics.get(sharedTweetId) : null
    return (
      <div key={item.key} className={`feed-slide feed-slide--${cls}${heropeek ? ' feed-slide--hero-peek' : ''}`}>
        <FeedCard
          item={item}
          address={address}
          onOpen={it => { recordSignalForItem(it, 'detail'); onOpenItem(it) }}
        />
        {sharedMetrics && (
          <div className="feed-x-shared-badge">
            <span className="feed-x-shared-logo">𝕏</span>
            <span className="feed-x-shared-stat">❤ {sharedMetrics.like_count.toLocaleString()}</span>
            <span className="feed-x-shared-stat">🔁 {sharedMetrics.retweet_count.toLocaleString()}</span>
            {sharedMetrics.impression_count > 0 && (
              <span className="feed-x-shared-stat">👁 {sharedMetrics.impression_count.toLocaleString()}</span>
            )}
          </div>
        )}
        {isCurrent && localVote && (
          <div className="feed-actions" style={{ position: 'relative' }}>
            {xpGain && <XPGain key={xpGain.key} amount={xpGain.amount} onDone={() => setXpGain(null)} />}

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
                recordSignalForItem(item, 'share')
                handleShareClick(item)
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

            {/* 🎨 Remix — studio memes with a saved draft */}
            {item.type === 'studio' && item.has_draft && onRemix && (
              <button
                className="feed-action-btn feed-action-btn--remix"
                onClick={() => onRemix(item.sourceId)}
                title="Open in Studio as a remix"
              >
                <div className="feed-action-icon">
                  <span className="feed-action-icon-glyph">🎨</span>
                </div>
                <span className="feed-action-label">Remix</span>
              </button>
            )}

          </div>
        )}
      </div>
    )
  }

  // Lock body scroll while any share modal is open
  useEffect(() => {
    if (!shareModal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [shareModal])

  // Resize textarea to fit pre-populated content whenever the compose modal opens
  useEffect(() => {
    if (shareModal !== 'compose') return
    const el = tweetTextareaRef.current
    if (!el) return
    const maxH = 320
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, maxH)
    el.style.height = next + 'px'
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  }, [shareModal])

  const handleShareClick = async (item: UnifiedMemeItem) => {
    shareItemRef.current = item
    setShareItem(item)
    setTweetText(`${item.title}\n\nhttps://virginvschad.vip/memes/${item.type}/${item.sourceId}\n\n#VirginVsChad #Memes $VVC`)
    setTweetUrl('')
    setShareInCommunity(false)
    if (!address) return
    const status = await fetchXStatus(address).catch(() => ({ connected: false as const }))
    if (status.connected && status.handle) {
      setXHandle(status.handle)
      setShareModal('compose')
    } else {
      setShareModal('connect')
    }
  }

  const handleConnectX = () => {
    if (!address) return
    window.open(
      `/api/x/auth?wallet=${encodeURIComponent(address)}`,
      'x-oauth'
    )
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'x_auth') return
      window.removeEventListener('message', onMsg)
      if (e.data.handle) {
        setXHandle(e.data.handle)
        setShareModal('compose')
      } else {
        alert(e.data.error || 'X connection failed')
        setShareModal(null)
      }
    }
    window.addEventListener('message', onMsg)
  }

  const handlePostTweet = async () => {
    const item = shareItemRef.current ?? shareItem
    if (!item || !address) return
    setShareModal('posting')
    try {
      const result = await postXTweet({
        wallet: address,
        text: tweetText,
        image_url: item.imageUrl ? new URL(item.imageUrl, window.location.origin).href : undefined,
        meme_id: item.sourceId,
        meme_type: item.type,
        creator_wallet: item.wallet ?? undefined,
        share_in_community: shareInCommunity,
      })
      setTweetUrl(result.tweet_url)
      setTweetId(result.tweet_id)
      setXHandle(result.handle)
      setMyShares(prev => [...prev, {
        id: result.share_id, wallet: address,
        meme_id: item.sourceId, meme_type: item.type,
        tweet_id: result.tweet_id, tweet_url: result.tweet_url,
        created_at: Date.now(),
      }])
      setShareModal('success')
    } catch (e) {
      alert((e as Error).message)
      setShareModal('compose')
    }
  }

  return (
    <div
      className="feed-root"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >

      {/* ── Share modal ── */}
      {shareModal && (
        <div
          className="feed-share-backdrop"
          onClick={shareModal === 'posting' ? undefined : () => setShareModal(null)}
          onWheel={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
        >
          {shareModal === 'success' && <XConfetti />}
          <div
            className={`feed-share-modal${shareModal === 'compose' || shareModal === 'success' ? ' feed-share-modal--wide' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            {shareModal !== 'posting' && (
              <button className="feed-share-close" onClick={() => setShareModal(null)}>✕</button>
            )}

            {/* ── Connect X account ── */}
            {shareModal === 'connect' && (
              <>
                <div className="feed-share-x-logo">𝕏</div>
                <h3 className="feed-share-title">Connect your X account</h3>
                <p className="feed-share-sub">One-time OAuth — then post memes to X with one click, with the image attached.</p>
                <button className="feed-share-btn feed-share-btn--primary" onClick={handleConnectX}>
                  Connect X
                </button>
              </>
            )}

            {/* ── Compose — X-style ── */}
            {shareModal === 'compose' && (
              <div className="feed-xcompose">
                <div className="feed-xcompose-row">
                  <div className="feed-xcompose-avatar">{xHandle?.[0]?.toUpperCase() ?? '?'}</div>
                  <div className="feed-xcompose-right">
                    <div className="feed-xcompose-handle">@{xHandle}</div>
                    <textarea
                      ref={tweetTextareaRef}
                      className="feed-xcompose-textarea"
                      value={tweetText}
                      onChange={e => {
                        const el = e.target
                        const maxH = 320
                        el.style.height = 'auto'
                        const next = Math.min(el.scrollHeight, maxH)
                        el.style.height = next + 'px'
                        el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
                        setTweetText(e.target.value.slice(0, 280))
                      }}
                      autoFocus
                    />
                    {shareItem?.imageUrl && (
                      <div className="feed-xcompose-img-wrap">
                        <img src={shareItem.imageUrl} className="feed-xcompose-img" alt="meme preview" />
                      </div>
                    )}
                  </div>
                </div>
                <label className="feed-xcompose-community">
                  <input
                    type="checkbox"
                    checked={shareInCommunity}
                    onChange={e => setShareInCommunity(e.target.checked)}
                  />
                  Share in the VvC community
                </label>
                <div className="feed-xcompose-footer">
                  <span className={`feed-xcompose-counter${tweetText.length > 260 ? ' feed-xcompose-counter--warn' : ''}`}>
                    {280 - tweetText.length}
                  </span>
                  <button
                    className="feed-xcompose-post-btn"
                    onClick={handlePostTweet}
                    disabled={!tweetText.trim()}
                  >
                    Post
                  </button>
                </div>
              </div>
            )}

            {/* ── Posting ── */}
            {shareModal === 'posting' && (
              <>
                <div className="feed-share-x-logo">𝕏</div>
                <h3 className="feed-share-title">Posting…</h3>
                <p className="feed-share-sub">Uploading image and posting to X.</p>
                <div className="feed-share-spinner" />
              </>
            )}

            {/* ── Success — full tweet card + confetti ── */}
            {shareModal === 'success' && (() => {
              const liveM = tweetId ? xMetrics.get(tweetId) : null
              return (
              <>
                <div className="feed-xcard">
                  <div className="feed-xcard-header">
                    <div className="feed-xcard-avatar">{xHandle?.[0]?.toUpperCase() ?? '?'}</div>
                    <div className="feed-xcard-meta">
                      <span className="feed-xcard-name">Virgin Vs Chad</span>
                      <span className="feed-xcard-handle">@{xHandle}</span>
                    </div>
                    <span className="feed-xcard-logo">𝕏</span>
                  </div>
                  <p className="feed-xcard-text">{tweetText}</p>
                  {shareItem?.imageUrl && (
                    <img src={shareItem.imageUrl} className="feed-xcard-img" alt="meme" />
                  )}
                  <div className="feed-xcard-actions">
                    <span className="feed-xcard-action">💬 <em>{(liveM?.reply_count ?? 0).toLocaleString()}</em></span>
                    <span className="feed-xcard-action">🔁 <em>{(liveM?.retweet_count ?? 0).toLocaleString()}</em></span>
                    <span className="feed-xcard-action">❤️ <em>{(liveM?.like_count ?? 0).toLocaleString()}</em></span>
                    {(liveM?.impression_count ?? 0) > 0 && (
                      <span className="feed-xcard-action">👁 <em>{liveM!.impression_count.toLocaleString()}</em></span>
                    )}
                  </div>
                </div>
                <div className="feed-share-rewards" style={{ marginTop: 4 }}>
                  <span className="feed-share-reward-chip">10 likes → 75 XP</span>
                  <span className="feed-share-reward-chip">50 likes → 200 XP</span>
                  <span className="feed-share-reward-chip">10 RTs → 50 XP</span>
                </div>
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  {tweetUrl && (
                    <a
                      href={tweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="feed-share-btn feed-share-btn--post"
                      style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                    >
                      View on X ↗
                    </a>
                  )}
                  <button className="feed-share-btn feed-share-btn--secondary" onClick={() => setShareModal(null)} style={{ flex: 1 }}>Done</button>
                </div>
              </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="feed-topbar">
        <div className="feed-topbar-inner">
          <div className="feed-sort-tabs">
            {(Object.keys(SORT_LABELS) as SortMode[]).map(s => (
              <button key={s} className={`feed-sort-tab ${sort === s ? 'active' : ''}`} onClick={() => setSort(s)}>
                {SORT_LABELS[s]}
              </button>
            ))}
            <button className="feed-refresh-btn" onClick={handleRefresh} title="Refresh feed">
              ↺
            </button>
          </div>
          {sort === 'top' && (
            <div className="feed-period-tabs">
              {(Object.keys(TOP_PERIOD_LABELS) as TopPeriod[]).map(p => (
                <button key={p} className={`feed-period-tab ${topPeriod === p ? 'active' : ''}`} onClick={() => setTopPeriod(p)}>
                  {TOP_PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="feed-filter-chips">
          <button
            className={`feed-filter-chip feed-filter-chip--all ${filter.size === 3 ? 'active' : ''}`}
            onClick={() => { setFilter(new Set(['studio', 'factory', 'reddit'])); setIdx(0); setHeroActive(true) }}
          >All</button>
          {(['studio', 'factory', 'reddit'] as MemeSourceType[]).map(t => (
            <button
              key={t}
              className={`feed-filter-chip feed-filter-chip--${t} ${filter.size === 1 && filter.has(t) ? 'active' : ''}`}
              onClick={() => toggleFilter(t)}
            >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        {visible.length > 0 && (
          <span className="feed-counter">{idx + 1} / {visible.length}</span>
        )}
        <div className="feed-char-picker-bar" ref={charPickerBarRef}>
          <span className="feed-char-picker-label">Filter by character</span>
          <div className="feed-char-picker-row" ref={charPickerRowRef}>
            <div className="feed-char-picker-inner" ref={charPickerInnerRef}>
            {CHARACTERS.map(char => {
              const active = filterChars.has(char.key)
              return (
                <button
                  key={char.key}
                  className={`feed-char-picker-chip ${active ? 'feed-char-picker-chip--active' : ''}`}
                  onClick={() => {
                    setFilterChars(prev => {
                      const n = new Set(prev)
                      active ? n.delete(char.key) : n.add(char.key)
                      return n
                    })
                    setIdx(0)
                  }}
                >
                  <img src={`/assets/chars/${char.file}.${char.ext ?? 'png'}`} alt={char.name} className="feed-char-picker-chip-avatar" />
                  <span className="feed-char-picker-chip-name">{char.name}</span>
                </button>
              )
            })}
            </div>
          </div>
        </div>
      </div>

      {/* Feed body: carousel + optional comments panel side-by-side */}
      <div className="feed-body">
        {loading ? (
          <div className="feed-state">Loading…</div>
        ) : !visible.length ? (
          <div className="feed-state">Nothing to show.</div>
        ) : (
          <div className="feed-carousel">
            {/* ── Category hero ── */}
            <div className={`feed-hero feed-hero--${activeCategory} ${(heroActive && !heroLeaving) ? 'feed-hero--visible' : 'feed-hero--hidden'}`}>
              {activeCategory === 'all' && (<>
                <div className="feed-hero-eyebrow">✦ Virgin vs Chad Universe</div>
                <div className="feed-hero-title">🔥 All Memes 🔥</div>
                <div className="feed-hero-subtitle">Everything from Studio artists, AI Factory drops & Reddit's finest. The full spectrum — scroll to find your next favourite.</div>
                <div className="feed-hero-row">
                  <button className="feed-hero-badge feed-hero-badge--btn" onClick={() => toggleFilter('studio')}>🎨 Studio</button>
                  <button className="feed-hero-badge feed-hero-badge--btn" onClick={() => toggleFilter('factory')}>⚡ Factory</button>
                  <button className="feed-hero-badge feed-hero-badge--btn" onClick={() => toggleFilter('reddit')}>👾 Reddit</button>
                  {visible.length > 0 && <span className="feed-hero-badge">{visible.length} drops</span>}
                </div>
              </>)}
              {activeCategory === 'studio' && (<>
                <div className="feed-hero-eyebrow">🎨 Made in Studio</div>
                <div className="feed-hero-title">Studio Memes</div>
                <div className="feed-hero-subtitle">Hand-crafted by real creators in the VVC Studio — where creativity hits the hardest. Every layer, every label, every character placed with intent.</div>
                <div className="feed-hero-row">
                  {onOpenStudio && <button className="feed-hero-cta" onClick={onOpenStudio}>Open Studio →</button>}
                  {visible.length > 0 && <span className="feed-hero-badge">{visible.length} studio memes</span>}
                </div>
              </>)}
              {activeCategory === 'factory' && (<>
                <div className="feed-hero-eyebrow">⚡ Meme Factory</div>
                <div className="feed-hero-title">Factory Drops</div>
                <div className="feed-hero-subtitle">AI-generated in seconds. Describe it, publish it — zero effort, maximum chaos. The fastest meme pipeline on the internet.</div>
                <div className="feed-hero-row">
                  {onOpenFactory && <button className="feed-hero-cta" onClick={onOpenFactory}>Open Factory →</button>}
                  {visible.length > 0 && <span className="feed-hero-badge">{visible.length} factory drops</span>}
                </div>
              </>)}
              {activeCategory === 'reddit' && (<>
                <div className="feed-hero-eyebrow">👾 Reddit Imports</div>
                <div className="feed-hero-title">r/VirginVsChad</div>
                <div className="feed-hero-subtitle">Sourced daily from the official subreddit. The real internet, unfiltered and unhinged. Community-voted, culture-defining.</div>
                <div className="feed-hero-row">
                  <a className="feed-hero-cta" href="https://reddit.com/r/virginvschad" target="_blank" rel="noopener noreferrer">Visit Subreddit ↗</a>
                  {visible.length > 0 && <span className="feed-hero-badge">{visible.length} reddit posts</span>}
                </div>
              </>)}
            </div>

            {/* Start scrolling cue — between hero and first meme */}
            {(heroActive || heroLeaving) && (
              <div
                className={`feed-scroll-cue ${heroLeaving ? 'feed-scroll-cue--leaving' : ''}`}
                onClick={() => advance(1)}
              >
                <span className="feed-scroll-cue-label">start scrolling</span>
                <span className="feed-scroll-cue-arrow">↓</span>
              </div>
            )}

            {(heroActive || heroLeaving)
              ? renderSlide(0, 'next', true)
              : [idx - 1, idx, idx + 1].map(i => renderSlide(i))
            }

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
