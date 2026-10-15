import { imageUrl } from './memes'
import { studioMemeImageUrl } from './studio'
import type { UnifiedMemeItem, MemeSourceType } from '../types/unified'
import { getPublicProfiles, type PublicProfile } from '../identity/api'

function toIso(s: string) { try { return new Date(s).toISOString() } catch { return s } }
function trunc(a: string) { return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '—' }

export interface SearchMemeResult { kind: 'meme'; item: UnifiedMemeItem }
export interface SearchUserResult {
  kind: 'user'; wallet: string
  /** Set when the wallet belongs to a member */
  profile?: PublicProfile
}
export type SearchResult = SearchMemeResult | SearchUserResult

// ── Pool cache ────────────────────────────────────────────────────────────────
let pool: UnifiedMemeItem[] | null = null
let poolFetchedAt = 0
const POOL_TTL = 5 * 60 * 1000

async function getPool(): Promise<UnifiedMemeItem[]> {
  if (pool && Date.now() - poolFetchedAt < POOL_TTL) return pool

  const [sr, fr, rr] = await Promise.allSettled([
    fetch('/studio/memes?limit=200').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
    fetch('/memes?limit=200&status=done').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
    fetch('/memebank?limit=200').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
  ])

  const items: UnifiedMemeItem[] = []

  if (sr.status === 'fulfilled') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sr.value.items?.forEach((m: any) => items.push({
      key: `studio:${m.id}`, type: 'studio' as MemeSourceType, sourceId: m.id,
      imageUrl: studioMemeImageUrl(m.id),
      title: (m.characters as string[]).map(c => c.replace(/_/g, ' ')).join(', ') || '—',
      meta: trunc(m.wallet), wallet: m.wallet, dateIso: toIso(m.created_at),
      characters: m.characters,
    }))
  }

  if (fr.status === 'fulfilled') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fr.value.items?.forEach((m: any) => items.push({
      key: `factory:${m.job_id}`, type: 'factory' as MemeSourceType, sourceId: m.job_id,
      imageUrl: imageUrl(m.job_id),
      title: m.meme_id ? (m.meme_id as string).replace(/_/g, ' ') : '—',
      meta: m.wallet ? trunc(m.wallet) : '—', wallet: m.wallet ?? undefined,
      dateIso: toIso(m.created_at),
    }))
  }

  if (rr.status === 'fulfilled') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rr.value.items?.forEach((p: any) => items.push({
      key: `reddit:${p.id}`, type: 'reddit' as MemeSourceType, sourceId: p.id,
      imageUrl: p.image_url, title: p.title,
      meta: `▲ ${(p.score as number).toLocaleString()}`, dateIso: toIso(p.date),
      redditPermalink: p.permalink, redditScore: p.score, redditTopic: p.topic,
      redditLeftTitle: p.left_title, redditRightTitle: p.right_title,
      redditLeftLabels: p.left_labels, redditRightLabels: p.right_labels,
    }))
  }

  pool = items
  poolFetchedAt = Date.now()
  return items
}

// ── Matching ──────────────────────────────────────────────────────────────────
function isSolanaWallet(q: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)
}

// Any base58-like string ≥3 chars — covers both partial and full wallet addresses
function looksLikeWallet(q: string) {
  return q.length >= 3 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(q)
}

function fuzzyScore(query: string, title: string): number {
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  if (t.startsWith(q)) return 4
  if (t.includes(q)) return 3
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length > 1 && words.every(w => t.includes(w))) return 2
  const hits = words.filter(w => t.includes(w)).length
  return hits > 0 ? hits / words.length : 0
}

// ── Public ────────────────────────────────────────────────────────────────────
export async function searchAll(query: string, limit = 10): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const out: SearchResult[] = []
  const memePool = await getPool()

  // Wallet search: partial prefix OR full address — always search the meme pool for
  // creator wallets that match. For a full exact address, also try the profiles endpoint.
  if (looksLikeWallet(q)) {
    const qLow = q.toLowerCase()
    const seen = new Set<string>()

    // Collect matching wallets from pool (prefix match covers exact match too)
    for (const item of memePool) {
      if (item.wallet && item.wallet.toLowerCase().startsWith(qLow) && !seen.has(item.wallet)) {
        seen.add(item.wallet)
        if (seen.size >= 5) break
      }
    }

    // For a full 32-44 char address that's not in the pool yet, add it so we still
    // attempt a profile lookup even if that user has no memes in the pool
    if (isSolanaWallet(q) && !seen.has(q)) seen.add(q)

    if (seen.size > 0) {
      const wallets = [...seen]
      const profiles = await getPublicProfiles(wallets)
      for (const wallet of wallets) out.push({ kind: 'user', wallet, profile: profiles[wallet] })
    }
  }

  // Meme search: exact sourceId, prefix sourceId, fuzzy title
  const scored: [UnifiedMemeItem, number][] = []
  for (const item of memePool) {
    if (item.sourceId === q) { scored.push([item, 10]); continue }
    if (item.sourceId.toLowerCase().includes(q.toLowerCase())) { scored.push([item, 8]); continue }
    const s = fuzzyScore(q, item.title)
    if (s > 0) scored.push([item, s])
  }

  scored.sort((a, b) => b[1] - a[1])
  out.push(...scored.slice(0, limit - out.length).map(([item]) => ({ kind: 'meme' as const, item })))

  return out.slice(0, limit)
}
