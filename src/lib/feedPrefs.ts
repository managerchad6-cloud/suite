/**
 * Feed personalization — client-side preference model.
 *
 * Learns from what the user watches, votes on, skips, and shares.
 * Persists in localStorage keyed by wallet so each account has its own taste profile.
 * Completely agnostic to server state — the backend stores raw signals separately.
 */

import type { UnifiedMemeItem } from '../types/unified'

const STORAGE_VERSION = 2
const STORAGE_TTL     = 120 * 24 * 60 * 60 * 1000  // 120 days
const MAX_SCORE       = 30  // cap per key to prevent runaway domination
const MAX_ENTRIES     = 200 // cap map sizes so localStorage stays small

export interface FeedPrefs {
  version: number
  // Keyed by character slug, content type ('studio'|'factory'|'reddit'), wallet, or reddit topic
  charScores:    Record<string, number>
  typeScores:    Partial<Record<'studio' | 'factory' | 'reddit', number>>
  creatorScores: Record<string, number>
  topicScores:   Record<string, number>
  interactions:  number
  lastUpdated:   number
}

export type EngagementSignal = 'view' | 'detail' | 'vote_up' | 'vote_down' | 'share' | 'skip'

// How much each signal shifts the preference scores
const WEIGHTS: Record<EngagementSignal, { char: number; type: number; creator: number; topic: number }> = {
  view:      { char:  0.4,  type:  0.3,  creator:  0.4,  topic:  0.3  },
  detail:    { char:  1.0,  type:  0.6,  creator:  1.2,  topic:  0.6  },
  vote_up:   { char:  2.0,  type:  1.0,  creator:  2.5,  topic:  1.0  },
  vote_down: { char: -1.0,  type: -0.5,  creator: -1.5,  topic: -0.5  },
  share:     { char:  3.0,  type:  1.5,  creator:  4.0,  topic:  1.5  },
  skip:      { char: -0.15, type: -0.1,  creator: -0.2,  topic: -0.1  },
}

export function emptyPrefs(): FeedPrefs {
  return {
    version: STORAGE_VERSION,
    charScores: {}, typeScores: {}, creatorScores: {}, topicScores: {},
    interactions: 0,
    lastUpdated: Date.now(),
  }
}

export function loadPrefs(wallet: string): FeedPrefs {
  try {
    const raw = localStorage.getItem(`vvc-feed-prefs-v2-${wallet}`)
    if (!raw) return emptyPrefs()
    const p = JSON.parse(raw) as FeedPrefs
    if (p.version !== STORAGE_VERSION) return emptyPrefs()
    if (Date.now() - p.lastUpdated > STORAGE_TTL) return emptyPrefs()
    return p
  } catch { return emptyPrefs() }
}

export function savePrefs(wallet: string, prefs: FeedPrefs): void {
  try { localStorage.setItem(`vvc-feed-prefs-v2-${wallet}`, JSON.stringify(prefs)) } catch {}
}

function clamp(v: number): number {
  return Math.max(-MAX_SCORE, Math.min(MAX_SCORE, v))
}

function trimMap(map: Record<string, number>): Record<string, number> {
  const entries = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  if (entries.length <= MAX_ENTRIES) return map
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES))
}

export function recordSignal(
  prefs: FeedPrefs,
  signal: EngagementSignal,
  item: UnifiedMemeItem,
): FeedPrefs {
  const w = WEIGHTS[signal]
  const chars    = { ...prefs.charScores }
  const types    = { ...prefs.typeScores }
  const creators = { ...prefs.creatorScores }
  const topics   = { ...prefs.topicScores }

  // Characters (studio/factory only)
  item.characters?.forEach(c => { chars[c] = clamp((chars[c] ?? 0) + w.char) })

  // Content type
  const t = item.type as 'studio' | 'factory' | 'reddit'
  types[t] = clamp((types[t] ?? 0) + w.type)

  // Creator wallet
  if (item.wallet) {
    creators[item.wallet] = clamp((creators[item.wallet] ?? 0) + w.creator)
  }

  // Reddit topic
  if (item.redditTopic) {
    topics[item.redditTopic] = clamp((topics[item.redditTopic] ?? 0) + w.topic)
  }

  return {
    version: STORAGE_VERSION,
    charScores:    trimMap(chars),
    typeScores:    types,
    creatorScores: trimMap(creators),
    topicScores:   trimMap(topics),
    interactions:  prefs.interactions + 1,
    lastUpdated:   Date.now(),
  }
}

/**
 * Returns a personalisation multiplier ≥ 0.5 for the given item.
 * 1.0 = neutral (cold start), higher = more preferred.
 * Maxes out around 6–8× for something that hits all signals.
 */
export function personalBoost(item: UnifiedMemeItem, prefs: FeedPrefs): number {
  // Cold start — not enough data yet, treat everything equally
  if (prefs.interactions < 5) return 1

  // Character affinity
  let charBoost = 1
  if (item.characters?.length) {
    const charSum = item.characters.reduce((s, c) => s + Math.max(0, prefs.charScores[c] ?? 0), 0)
    // Average per character, clamped to [1, 3.5]
    charBoost = 1 + Math.min(2.5, charSum / item.characters.length / 4)
  }

  // Content type affinity — how much user prefers this type vs others
  const typeTotal = Math.max(
    1,
    Object.values(prefs.typeScores).reduce((a, b) => a + Math.max(0, b ?? 0), 0),
  )
  const typeVal = Math.max(0, prefs.typeScores[item.type as 'studio' | 'factory' | 'reddit'] ?? 0)
  const typeBoost = 1 + Math.min(0.7, (typeVal / typeTotal) * 2.5)

  // Creator affinity
  const creatorBoost = item.wallet
    ? 1 + Math.min(1.8, Math.max(0, prefs.creatorScores[item.wallet] ?? 0) / 5)
    : 1

  // Reddit topic affinity
  let topicBoost = 1
  if (item.redditTopic) {
    const topicTotal = Math.max(
      1,
      Object.values(prefs.topicScores).reduce((a, b) => a + Math.max(0, b ?? 0), 0),
    )
    const topicVal = Math.max(0, prefs.topicScores[item.redditTopic] ?? 0)
    topicBoost = 1 + Math.min(0.8, (topicVal / topicTotal) * 2.5)
  }

  return charBoost * typeBoost * creatorBoost * topicBoost
}

/**
 * Exploration noise — slight randomisation so the feed feels alive and
 * surfaces content that might not perfectly match preferences yet.
 * Range: 0.80 – 1.20.
 */
export function explorationNoise(): number {
  return 0.80 + Math.random() * 0.40
}
