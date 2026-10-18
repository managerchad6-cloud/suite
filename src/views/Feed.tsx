import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useMemberGate } from '../identity/gate'
import { fetchGalleryMemes, studioMemeImageUrl } from '../api/studio'
import { fetchMemes, imageUrl } from '../api/memes'
import { fetchFollowing, toggleFollow } from '../api/follow'
import {
  loadPrefs, savePrefs, recordSignal, personalBoost, explorationNoise, emptyPrefs,
  type FeedPrefs, type EngagementSignal,
} from '../lib/feedPrefs'
import { truncateAddress } from '../wallet'
import { FeedPost, type Verdict } from '../components/FeedPost'
import { ShareToX } from '../components/ShareToX'
import { Confetti } from '../components/Confetti'
import { api } from '../api/client'
import { TIERS, TIER_RANK, itemTitle } from '../lib/memeInfo'
import { CommentsPanel } from '../components/CommentsPanel'
import { castVote, getFeedProgress, trackFeedAction, type DailyState, type FeedProgress, type StreakState } from '../api/votes'
import { dispatchXP } from '../api/player'
import { XPGain } from '../components/XPGain'
import { CHARACTERS } from '../data/characterLore'
import type { UnifiedMemeItem, MemeSourceType, MemeTier } from '../types/unified'
import { fetchMyShares, type TweetShare } from '../api/twitter'
import { useXMetrics } from '../hooks/useXMetrics'
import './Feed.css'
import './FeedStage.css'

// ── Feed session cache ────────────────────────────────────────────────────────
// v3: includes noiseMap + sessionPrefs so remounts restore the exact same order.
// No app-level TTL — sessionStorage expires naturally when the browser tab closes.
const FEED_CACHE_KEY = 'vvc-feed-state-v4'

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
  onOpenItem: (item: UnifiedMemeItem) => void
  onOpenProfile?: (wallet: string) => void
  onRemix?: (sourceId: string) => void
  onOpenStudio?: () => void
  onOpenFactory?: () => void
}


export function Feed({ onOpenItem, onOpenProfile, onRemix, onOpenStudio, onOpenFactory }: Props) {
  const gate = useMemberGate()
  const wallet = gate.wallet
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
  const [myShares,    setMyShares]    = useState<TweetShare[]>([])
  const xMetrics = useXMetrics(wallet || null)
  const [followingSet,  setFollowingSet]  = useState<Set<string>>(new Set())
  const [feedPrefs, setFeedPrefsState] = useState<FeedPrefs>(() =>
    wallet ? loadPrefs(wallet) : emptyPrefs(),
  )
  // Incrementing this forces the load effect to re-run even if sort hasn't changed.
  const [refreshKey, setRefreshKey] = useState(0)
  // Refs for skip/view detection — kept in refs to avoid stale closures
  const prevItemRef  = useRef<UnifiedMemeItem | null>(null)
  const itemShownAt  = useRef<number>(Date.now())
  // Prefs snapshot frozen at session start — restored from sessionStorage on remount
  // so tab-switching never re-sorts. Fresh values come in only on F5 or Refresh.
  const sessionPrefsRef = useRef<FeedPrefs>(
    cache?.sessionPrefs ?? (wallet ? loadPrefs(wallet) : emptyPrefs()),
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

  // Always-fresh ref for save-on-unmount (avoids stale closure in cleanup)
  const latestRef = useRef({ items, idx, sort, topPeriod, filter, filterChars, heroActive })
  useEffect(() => { latestRef.current = { items, idx, sort, topPeriod, filter, filterChars, heroActive } })

  // Load following list for foryou boost
  useEffect(() => {
    if (!wallet) return
    fetchFollowing(wallet).then(list => setFollowingSet(new Set(list))).catch(() => {})
  }, [wallet])

  // Load shares so we know which feed cards have been posted to X
  useEffect(() => {
    if (!wallet) return
    fetchMyShares().then(setMyShares).catch(() => {})
  }, [wallet])


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
    if (!wallet) return
    setFeedPrefsState(prev => {
      const next = recordSignal(prev, signal, item)
      savePrefs(wallet, next)
      return next
    })
  }, [wallet])

  // Detect skip when the user advances past an item in under 1.6 s
  useEffect(() => {
    const item = visibleRef.current[idx] ?? null
    const now   = Date.now()
    const dwell = now - itemShownAt.current
    const prev  = prevItemRef.current

    if (prev && dwell > 150 && dwell < 1600) {
      recordSignalForItem(prev, 'skip')
      trackFeedAction(prev.sourceId, prev.type, 'skip', dwell)
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
      // Personalised by the session when a member is signed in
      const res = await fetch('/api/feed?sort=top&limit=200', { credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) return
      const data: { items: TierRow[] } = await res.json()
      data.items.forEach(row => {
        tierCache.current.set(`${row.meme_id}:${row.meme_source}`, row)
      })
      setItems(prev => enrichWithTiers(prev))
    } catch { /* silent */ }
  }, [wallet])

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
      sr.value.items.forEach((m: { id: string; wallet: string; characters: string[]; titles?: string[]; created_at: string; has_draft?: boolean; remixed_from?: string | null }) => next.push({
        key: `studio:${m.id}`, type: 'studio', sourceId: m.id,
        imageUrl: studioMemeImageUrl(m.id),
        title: itemTitle('studio', m),
        meta: truncateAddress(m.wallet), wallet: m.wallet, dateIso: toIso(m.created_at),
        characters: m.characters,
        has_draft: m.has_draft,
        remixed_from: m.remixed_from ?? undefined,
      }))
      hasMore.current.studio = sr.value.has_next
      pages.current.studio = p.studio + 1
    }
    if (fr.status === 'fulfilled' && fr.value) {
      // Failed or unfinished jobs have no image
      fr.value.items.filter(m => m.status === 'done' && m.meme_id).forEach((m: { job_id: string; meme_id: string | null; wallet: string | null; created_at: string }) => next.push({
        key: `factory:${m.job_id}`, type: 'factory', sourceId: m.job_id,
        imageUrl: imageUrl(m.job_id),
        title: m.meme_id ? itemTitle('factory', m) : '—',
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
    sessionPrefsRef.current = wallet ? loadPrefs(wallet) : emptyPrefs()
    pages.current   = { studio: 1, factory: 1, reddit: 1 }
    hasMore.current = { studio: true, factory: true, reddit: true }
    sortWhenLoaded.current = null
    setItems([])
    setIdx(0)
    setHeroActive(true)
    setHeroLeaving(false)
    setRefreshKey(k => k + 1)
  }, [wallet])

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
        setHeroActive(false)
        setHeroLeaving(true)
        if (heroLeavingTimerRef.current) clearTimeout(heroLeavingTimerRef.current)
        heroLeavingTimerRef.current = setTimeout(() => setHeroLeaving(false), 500)
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

  // ── Streak, daily goal, and the big moments ───────────────────────────────
  const [progress, setProgress] = useState<FeedProgress | null>(null)
  useEffect(() => {
    if (!wallet) { setProgress(null); return }
    getFeedProgress().then(setProgress).catch(() => {})
  }, [wallet])
  // The streak runs out when its window passes without a vote
  useEffect(() => {
    const exp = progress?.streak.expires_at
    if (!exp) return
    const t = setTimeout(() => setProgress(p => p && ({ ...p, streak: { ...p.streak, count: 0, expires_at: null, next_bonus: FIRST_STREAK_BONUS } })),
      Math.max(0, new Date(exp).getTime() - Date.now()))
    return () => clearTimeout(t)
  }, [progress?.streak.expires_at])

  const [toasts, setToasts] = useState<Toast[]>([])
  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts(ts => [...ts.slice(-2), { ...t, id }])
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 4500)
  }, [])
  const [confetti, setConfetti] = useState(0)
  const [rankUp, setRankUp] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<(Verdict & { itemKey: string }) | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [shareItem, setShareItem] = useState<UnifiedMemeItem | null>(null)
  useEffect(() => { setFlipped(false) }, [currentItem?.key])

  // A meme you scouted (or made) climbed while you were scrolling
  useEffect(() => {
    if (!wallet) return
    const since = new Date().toISOString()
    const shown = new Set<string>()
    const poll = () => api<{ items: FeedNotification[] }>('/api/notifications?limit=10').then(r => {
      for (const n of r.items) {
        if (n.read || n.created_at <= since || shown.has(n.id)) continue
        const t = TIERS[n.payload.tier as MemeTier]
        if (!t) continue
        const href = n.payload.meme_source ? `#/memes/${n.payload.meme_source}/${n.payload.meme_id}` : undefined
        if (n.type === 'scout_payoff') pushToast({ icon: '🔭', title: `A meme you scouted hit ${t.label}`, sub: `+${n.payload.xp ?? 0} XP scout payoff`, tone: 'green', href })
        else if (n.type === 'tier_climbed') pushToast({ icon: t.icon, title: `Your meme hit ${t.label}`, sub: 'The crowd is calling it', tone: 'gold', href })
        else continue
        shown.add(n.id)
        setConfetti(c => c + 1)
      }
    }).catch(() => {})
    const timer = setInterval(poll, 30_000)
    return () => clearInterval(timer)
  }, [wallet, pushToast])

  const handleVote = useCallback(async (dir: 1 | -1) => {
    if (!currentItem || !wallet || localVote?.voting) return
    const item = currentItem
    setLocalVote(prev => prev ? { ...prev, voting: true } : prev)
    try {
      const result = await castVote(item.sourceId, item.type, dir)
      setLocalVote({ upVotes: result.up_votes, downVotes: result.down_votes, yourVote: result.your_vote, tier: result.tier, voting: false })
      // Update item in place + tier cache so vote state survives navigation.
      // sessionSortRef stays locked so foryou order never shifts mid-session.
      const cacheKey = `${item.sourceId}:${item.type}`
      const prev = tierCache.current.get(cacheKey)
      tierCache.current.set(cacheKey, {
        meme_id: item.sourceId, meme_source: item.type,
        tier: result.tier, score: result.up_votes - result.down_votes,
        velocity: prev?.velocity ?? 0,
        up_votes: result.up_votes, down_votes: result.down_votes,
        your_vote: result.your_vote,
      })
      setItems(prev => prev.map(i =>
        i.key === item.key
          ? { ...i, up_votes: result.up_votes, down_votes: result.down_votes, your_vote: result.your_vote, tier: result.tier }
          : i
      ))
      if (!result.your_vote) return
      recordSignalForItem(item, dir === 1 ? 'vote_up' : 'vote_down')

      // What the crowd thinks, right away
      const total = result.up_votes + result.down_votes
      setVerdict({ pct: total ? Math.round((result.up_votes / total) * 100) : 50, dir, key: Date.now(), itemKey: item.key })
      if (result.xp_awarded > 0) {
        dispatchXP(result.xp_awarded, dir === 1 ? 'chad' : 'virgin')
        setXpGain({ amount: result.xp_awarded, key: Date.now() })
      }
      if (result.streak && result.daily) setProgress({ streak: result.streak, daily: result.daily })
      if (result.streak?.bonus_xp) {
        pushToast({ icon: '🔥', title: `${result.streak.count} in a row`, sub: `+${result.streak.bonus_xp} XP streak bonus`, tone: 'gold' })
        if (result.streak.count >= 10) setConfetti(c => c + 1)
      }
      if (result.daily?.just_completed) {
        pushToast({ icon: '📅', title: 'Daily goal hit', sub: `+${result.daily.bonus_xp} XP${result.daily.goal_streak > 1 ? ` · ${result.daily.goal_streak}-day streak` : ''}`, tone: 'green' })
        setConfetti(c => c + 1)
      }
      if (TIER_RANK[result.tier] > TIER_RANK[result.prev_tier]) {
        pushToast({ icon: TIERS[result.tier].icon, title: `You pushed it to ${TIERS[result.tier].label}`, sub: 'Your vote tipped it over', tone: 'gold' })
        setConfetti(c => c + 1)
      }
      if (result.ranked_up) { setRankUp(result.rank); setConfetti(c => c + 1) }
    } catch (err) {
      console.error('Vote failed:', err)
      setLocalVote(prev => prev ? { ...prev, voting: false } : prev)
    }
  }, [currentItem, localVote, wallet, recordSignalForItem, pushToast])

  const vote = (dir: 1 | -1) => gate.guard(() => handleVote(dir), 'vote')()

  const openItem = (it: UnifiedMemeItem) => {
    recordSignalForItem(it, 'detail')
    trackFeedAction(it.sourceId, it.type, 'detail', Date.now() - itemShownAt.current)
    onOpenItem(it)
  }

  const follow = (w: string) => gate.guard(() => {
    toggleFollow(w).then(r => setFollowingSet(prev => {
      const n = new Set(prev)
      if (r.is_following) n.add(w); else n.delete(w)
      return n
    })).catch(() => {})
  }, 'follow creators')()

  // Keyboard: ↓/J next, ↑/K back, B Based, C Cringe, Space flip, Enter open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (shareItem || filtersOpen || rankUp || el?.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowDown' || e.key === 'j') advance(1)
      else if (e.key === 'ArrowUp' || e.key === 'k') advance(-1)
      else if (heroActive || !currentItem) return
      else if (e.key === 'b') vote(1)
      else if (e.key === 'c') vote(-1)
      else if (e.key === ' ') { e.preventDefault(); setFlipped(f => !f) }
      else if (e.key === 'Enter') openItem(currentItem)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Render one slide; the action rail sits beside the current one
  function renderSlide(visIdx: number) {
    const item = visible[visIdx]
    if (!item) return null
    // On the hero, the "current" slot is the hero itself (one above the first meme)
    const offset = visIdx - (heroActive ? idx - 1 : idx)
    if (offset < -2 || offset > 2) return null
    const cls = SLOT[offset + 2]
    const heropeek = heroActive && offset === 1
    const isCurrent = cls === 'current'
    const sharedTweetId = sharedMemeMap.get(item.sourceId)
    const sharedMetrics = sharedTweetId ? xMetrics.get(sharedTweetId) : null
    const own = !!item.wallet && item.wallet === wallet
    return (
      <div key={item.key} className={`feed-slide feed-slide--${cls}${heropeek ? ' feed-slide--hero-peek' : ''}`}>
        {cls === 'next' && !heropeek && <span className="fx-next-label">Up next</span>}
        <FeedPost
          item={item}
          current={isCurrent}
          following={item.wallet && !own ? (gate.locked ? false : followingSet.has(item.wallet)) : null}
          own={own}
          onFollow={() => item.wallet && follow(item.wallet)}
          onOpen={() => openItem(item)}
          onOpenProfile={onOpenProfile}
          onDoubleTap={() => { if (localVote?.yourVote !== 1) vote(1) }}
          flipped={isCurrent && flipped}
          verdict={isCurrent && verdict?.itemKey === item.key ? verdict : null}
        >
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
        </FeedPost>
        {isCurrent && localVote && (
          <div className="fx-rail">
            {xpGain && <XPGain key={xpGain.key} amount={xpGain.amount} onDone={() => setXpGain(null)} />}
            <button className={`fx-act fx-act--up${localVote.yourVote === 1 ? ' is-on' : ''}`} {...gate.lockProps('vote')}
              onClick={() => vote(1)} disabled={!gate.locked && localVote.voting} title="Based (B)">
              <span className="fx-act-icon">▲</span>
              <span className="fx-act-label">{compact(localVote.upVotes)}</span>
            </button>
            <button className={`fx-act fx-act--down${localVote.yourVote === -1 ? ' is-on' : ''}`} {...gate.lockProps('vote')}
              onClick={() => vote(-1)} disabled={!gate.locked && localVote.voting} title="Cringe (C)">
              <span className="fx-act-icon">▼</span>
              <span className="fx-act-label">{compact(localVote.downVotes)}</span>
            </button>
            {(localVote.upVotes + localVote.downVotes) > 0 && (
              <div className="fx-split" title={`${Math.round(localVote.upVotes / (localVote.upVotes + localVote.downVotes) * 100)}% Based`}>
                <span style={{ height: `${(localVote.upVotes / (localVote.upVotes + localVote.downVotes)) * 100}%` }} />
              </div>
            )}
            <button className="fx-act" onClick={() => setShowComments(true)} title="Replies">
              <span className="fx-act-icon">💬</span>
              <span className="fx-act-label">Replies</span>
            </button>
            <button className="fx-act fx-act--x" {...gate.lockProps('share to X')}
              onClick={gate.guard(() => { recordSignalForItem(item, 'share'); setShareItem(item) }, 'share to X')} title="Share to X">
              <span className="fx-act-icon">𝕏</span>
              <span className="fx-act-label">Share</span>
            </button>
            <button className={`fx-act${flipped ? ' is-on' : ''}`} onClick={() => setFlipped(f => !f)} title="Flip for the breakdown (Space)">
              <span className="fx-act-icon">⟲</span>
              <span className="fx-act-label">Breakdown</span>
            </button>
            {item.type === 'studio' && item.has_draft && onRemix && (
              <button className="fx-act" onClick={() => onRemix(item.sourceId)} title="Open in Studio as a remix">
                <span className="fx-act-icon">🎨</span>
                <span className="fx-act-label">Remix</span>
              </button>
            )}
            {item.type === 'reddit' && item.redditPermalink ? (
              <a className="fx-act" href={`https://reddit.com${item.redditPermalink}`} target="_blank" rel="noopener noreferrer" title="On Reddit">
                <span className="fx-act-icon">↗</span>
                <span className="fx-act-label">Reddit</span>
              </a>
            ) : (
              <button className="fx-act" onClick={() => openItem(item)} title="Open the meme page (Enter)">
                <span className="fx-act-icon">⤢</span>
                <span className="fx-act-label">Open</span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const filterCount = (filter.size < 3 ? 1 : 0) + filterChars.size
  const chooseSource = (t: MemeSourceType | 'all') => {
    if (t === 'all') { setFilter(new Set(['studio', 'factory', 'reddit'])); setIdx(0); setHeroActive(true); setHeroLeaving(false) }
    else toggleFilter(t)
  }
  const toggleChar = (key: string) => {
    setFilterChars(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
    setIdx(0)
  }

  return (
    <div
      className="feed-root"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {shareItem && (
        <ShareToX
          meme={{ sourceId: shareItem.sourceId, type: shareItem.type, title: shareItem.title, imageUrl: shareItem.imageUrl, wallet: shareItem.wallet }}
          onClose={() => setShareItem(null)}
          onShared={r => setMyShares(prev => [...prev, {
            id: r.share_id, wallet: wallet!, meme_id: shareItem.sourceId, meme_type: shareItem.type,
            tweet_id: r.tweet_id, tweet_url: r.tweet_url, created_at: Date.now(),
          }])}
        />
      )}

      {/* Top bar: sorts, filters, and your meters */}
      <div className="fx-top" onWheel={e => e.stopPropagation()}>
        <div className="fx-sorts">
          {(Object.keys(SORT_LABELS) as SortMode[]).map(s => (
            <button key={s} className={`fx-sort${sort === s ? ' is-on' : ''}`} onClick={() => setSort(s)}>{SORT_LABELS[s]}</button>
          ))}
          <button className="fx-icon-btn" onClick={handleRefresh} title="Refresh feed" aria-label="Refresh feed">↺</button>
        </div>
        {sort === 'top' && (
          <div className="fx-periods">
            {(Object.keys(TOP_PERIOD_LABELS) as TopPeriod[]).map(p => (
              <button key={p} className={`fx-period${topPeriod === p ? ' is-on' : ''}`} onClick={() => setTopPeriod(p)}>{TOP_PERIOD_LABELS[p]}</button>
            ))}
          </div>
        )}
        <button className={`fx-filter-btn${filterCount ? ' is-on' : ''}${filtersOpen ? ' is-open' : ''}`} onClick={() => setFiltersOpen(o => !o)}>
          <span aria-hidden>⚙</span> Filters{filterCount ? <b>{filterCount}</b> : null}
        </button>
        <div className="fx-meters">
          {progress ? (
            <>
              <StreakChip streak={progress.streak} />
              <DailyRing daily={progress.daily} />
            </>
          ) : gate.locked && (
            <button className="fx-meter-join" onClick={() => gate.join('keep a voting streak')}>🔥 Join to keep a streak</button>
          )}
        </div>
      </div>

      {/* Active filters, one tap to drop */}
      {filterCount > 0 && !filtersOpen && (
        <div className="fx-active" onWheel={e => e.stopPropagation()}>
          {filter.size < 3 && [...filter].map(t => (
            <button key={t} className={`fx-chip fx-chip--${t}`} onClick={() => chooseSource('all')}>{t} ✕</button>
          ))}
          {[...filterChars].map(k => {
            const c = CHARACTERS.find(ch => ch.key === k)
            return <button key={k} className="fx-chip" onClick={() => toggleChar(k)}>{c?.name ?? k} ✕</button>
          })}
        </div>
      )}

      {filtersOpen && (
        <div className="fx-sheet-wrap" onClick={() => setFiltersOpen(false)} onWheel={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          <div className="fx-sheet" onClick={e => e.stopPropagation()}>
            <div className="fx-sheet-row">
              <h3>Source</h3>
              <div className="fx-sources">
                {(['all', 'studio', 'factory', 'reddit'] as const).map(t => {
                  const on = t === 'all' ? filter.size === 3 : filter.size === 1 && filter.has(t)
                  return <button key={t} className={`fx-chip fx-chip--${t}${on ? ' is-on' : ''}`} onClick={() => chooseSource(t)}>{t}</button>
                })}
              </div>
            </div>
            <div className="fx-sheet-row">
              <h3>Characters {filterChars.size > 0 && <button className="fx-clear" onClick={() => { setFilterChars(new Set()); setIdx(0) }}>Clear</button>}</h3>
              <div className="fx-chars">
                {CHARACTERS.map(char => (
                  <button key={char.key} className={`fx-char${filterChars.has(char.key) ? ' is-on' : ''}`} onClick={() => toggleChar(char.key)}>
                    <img src={`/assets/chars/${char.file}.${char.ext ?? 'png'}`} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                    <span>{char.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <button className="fx-sheet-done" onClick={() => setFiltersOpen(false)}>
              Show {visible.length} meme{visible.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* Feed body: carousel + optional comments panel side-by-side */}
      <div className="feed-body">
        {loading ? (
          <div className="feed-state"><span className="fx-spin" /> Loading the good stuff…</div>
        ) : !visible.length ? (
          <div className="feed-state fx-empty">
            <b>Nothing matches these filters</b>
            <button className="fx-chip is-on" onClick={() => { chooseSource('all'); setFilterChars(new Set()) }}>Clear filters</button>
          </div>
        ) : (
          <div className="feed-carousel">
            {/* Ambient light from the current meme; neighbours stay mounted so it crossfades */}
            {[idx - 1, idx, idx + 1].map(i => visible[i] && (
              <div key={`bg-${visible[i].key}`} className={`fx-backdrop${i === idx && !heroActive ? ' is-on' : ''}`}
                style={{ backgroundImage: `url("${visible[i].imageUrl}")` }} aria-hidden />
            ))}

            {/* ── Category hero ── */}
            <div className={`feed-hero feed-hero--${activeCategory} ${(heroActive && !heroLeaving) ? 'feed-hero--visible' : 'feed-hero--hidden'}`}>
              {activeCategory === 'all' && (<>
                <div className="feed-hero-eyebrow">✦ Virgin vs Chad Universe</div>
                <div className="feed-hero-title">🔥 All Memes 🔥</div>
                <div className="feed-hero-subtitle">Everything from Studio artists, AI Factory drops and Reddit's finest. Vote fast to build a streak; hit 20 today for the daily bonus.</div>
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
                <div className="feed-hero-subtitle">Hand-crafted by real creators in the VVC Studio. Every layer, every label, every character placed with intent.</div>
                <div className="feed-hero-row">
                  {onOpenStudio && <button className="feed-hero-cta" onClick={onOpenStudio}>Open Studio →</button>}
                  {visible.length > 0 && <span className="feed-hero-badge">{visible.length} studio memes</span>}
                </div>
              </>)}
              {activeCategory === 'factory' && (<>
                <div className="feed-hero-eyebrow">⚡ Meme Factory</div>
                <div className="feed-hero-title">Factory Drops</div>
                <div className="feed-hero-subtitle">AI-generated in seconds. Describe it, publish it: zero effort, maximum chaos.</div>
                <div className="feed-hero-row">
                  {onOpenFactory && <button className="feed-hero-cta" onClick={onOpenFactory}>Open Factory →</button>}
                  {visible.length > 0 && <span className="feed-hero-badge">{visible.length} factory drops</span>}
                </div>
              </>)}
              {activeCategory === 'reddit' && (<>
                <div className="feed-hero-eyebrow">👾 Reddit Imports</div>
                <div className="feed-hero-title">r/VirginVsChad</div>
                <div className="feed-hero-subtitle">Sourced daily from the official subreddit. The real internet, unfiltered and unhinged.</div>
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

            {[idx - 2, idx - 1, idx, idx + 1, idx + 2].map(i => renderSlide(i))}

            {/* Where you are in the feed */}
            {visible.length > 1 && !heroActive && (
              <div className="fx-progress" aria-hidden>
                <span>{idx + 1}</span>
                <div className="fx-progress-track"><i style={{ height: `${((idx + 1) / visible.length) * 100}%` }} /></div>
                <span>{visible.length}</span>
              </div>
            )}
          </div>
        )}

        {showComments && currentItem && (
          <CommentsPanel
            item={currentItem}
            onClose={() => setShowComments(false)}
          />
        )}
      </div>

      {/* The big moments */}
      {confetti > 0 && <Confetti key={confetti} pieces={80} />}
      <div className="fx-toasts" aria-live="polite">
        {toasts.map(t => {
          const body = <><span className="fx-toast-icon">{t.icon}</span><span><b>{t.title}</b>{t.sub && <small>{t.sub}</small>}</span></>
          return t.href
            ? <a key={t.id} className={`fx-toast fx-toast--${t.tone}`} href={t.href}>{body}<i>→</i></a>
            : <div key={t.id} className={`fx-toast fx-toast--${t.tone}`}>{body}</div>
        })}
      </div>
      {rankUp && (
        <div className="fx-rankup" onClick={() => setRankUp(null)} role="dialog" aria-label="Rank up">
          <div className="fx-rankup-card" onClick={e => e.stopPropagation()}>
            <small>Rank up</small>
            <h2>{rankUp.replace(/_/g, ' ')}</h2>
            <p>Your votes are moving the needle. Keep the streak alive.</p>
            <button onClick={() => setRankUp(null)}>Keep scrolling</button>
          </div>
        </div>
      )}
    </div>
  )
}

const FIRST_STREAK_BONUS = { at: 5, xp: 10 }
/** Slide slots by offset from the current one: two above, two below (the outer ones wait off-stage) */
const SLOT = ['above', 'prev', 'current', 'next', 'below'] as const
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n))

interface Toast { id: number; icon: string; title: string; sub?: string; tone: 'gold' | 'green'; href?: string }
interface FeedNotification {
  id: string; type: string; read: number; created_at: string
  payload: { meme_id?: string; meme_source?: string; tier?: string; xp?: number }
}

/** Votes in a row: the ring drains until the streak runs out */
function StreakChip({ streak }: { streak: StreakState }) {
  const live = streak.count > 0 && !!streak.expires_at
  const left = live ? Math.max(0, new Date(streak.expires_at!).getTime() - Date.now()) : 0
  const C = 2 * Math.PI * 9
  const tip = live
    ? `${streak.count} in a row. Vote within ${Math.ceil(left / 1000)}s to keep it.${streak.next_bonus ? ` ${streak.next_bonus.at - streak.count} more for +${streak.next_bonus.xp} XP.` : ''}`
    : `Vote memes back to back to build a streak${streak.next_bonus ? ` (${streak.next_bonus.at} in a row pays +${streak.next_bonus.xp} XP)` : ''}. Best: ${streak.best}`
  return (
    <div className={`fx-streak${live ? ' is-live' : ''}${streak.count >= 10 ? ' is-hot' : ''}`} title={tip}>
      <svg viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="9" className="fx-ring-bg" />
        {live && (
          <circle key={streak.expires_at} cx="11" cy="11" r="9" className="fx-ring-drain"
            style={{ strokeDasharray: C, ['--from' as string]: `${C * (1 - left / streak.window_ms)}`, ['--to' as string]: `${C}`, animationDuration: `${left}ms` }} />
        )}
      </svg>
      <span className="fx-streak-fire">🔥</span>
      <b key={streak.count} className="fx-streak-n">{live ? `x${streak.count}` : 'Streak'}</b>
      {live && streak.next_bonus && <small>{streak.next_bonus.at - streak.count} to +{streak.next_bonus.xp}</small>}
    </div>
  )
}

/** Today's votes toward the daily goal */
function DailyRing({ daily }: { daily: DailyState }) {
  const C = 2 * Math.PI * 10
  const pct = Math.min(1, daily.count / daily.goal)
  return (
    <div className={`fx-daily${daily.completed ? ' is-done' : ''}`}
      title={daily.completed ? `Daily goal hit${daily.goal_streak > 1 ? ` · ${daily.goal_streak} days in a row` : ''}` : `Vote ${daily.goal} memes today for +${daily.xp} XP`}>
      <svg viewBox="0 0 26 26" aria-hidden>
        <circle cx="13" cy="13" r="10" className="fx-ring-bg" />
        <circle cx="13" cy="13" r="10" className="fx-ring-fill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
      </svg>
      <span>{daily.completed ? '✓ Goal' : `${daily.count}/${daily.goal}`}</span>
      {daily.goal_streak > 1 && <small>{daily.goal_streak}d</small>}
    </div>
  )
}
