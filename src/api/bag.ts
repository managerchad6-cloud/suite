import { api } from './client'
import type { HolderTier } from './credits'

// The Bag: the $VVC market and your position in it (memestudio-backend bag.js).

export interface Market {
  symbol: string
  mint: string
  usd: number
  sol: number               // price in SOL
  solUsd: number
  change24h: number | null  // %
  mcapUsd: number | null
  at: string
  history?: [number, number][]   // [ms, usd], last 24h
}

export interface BagLot { since: string; tokens: number; entrySol: number | null; pnlPct: number | null }
export interface BagTrade { at: string; kind: 'buy' | 'sell' | 'in' | 'out'; tokens: number; sol: number; signature: string }

export interface Bag {
  market: Market | null
  wallet: string
  balance: number
  valueUsd: number | null
  valueSol: number | null
  tier: HolderTier | null
  holdingSince: string | null
  costSol: number
  proceedsSol: number
  pnlSol: number | null
  pnlPct: number | null
  lots: BagLot[]
  oldestBagSince: string | null
  trades: BagTrade[]
  synced: boolean
  syncing: boolean
  public: boolean
  game?: Game
}

// ─── The Chad game (memestudio-backend chad.js) ────────────────────────────────
export interface Rank { key: string; name: string; min: number }
export interface Game {
  score: number
  rank: Rank & { index: number; next: (Rank & { points: number }) | null }
  traits: Record<'pnl' | 'hands' | 'holding' | 'bag' | 'aping' | 'entries' | 'loyalty', number | null>
  moves: { trait: string; text: string; gain: number | null }[]
  whatIf: { sol: number; score: number; rank: { key: string; name: string } }[]
  ladder: Rank[]
}
/** Each rank's character art */
export const rankArt = (key: string) => `/assets/chars/${key}.${key === 'gigachad' ? 'webp' : 'png'}`
export const RANK_EVENT = 'vvc:rank'
export interface RankEvent { dir: 'up' | 'down'; key: string; name: string }

export interface PublicBag {
  wallet: string
  public: boolean
  own: boolean
  balance?: number
  valueUsd?: number | null
  tier?: HolderTier | null
  holdingSince?: string | null
  oldestBagSince?: string | null
  pnlPct?: number | null
  rank?: { key: string; name: string; score: number } | null
}

export const fetchMarket = () => api<Market>('/api/bag/market')
export const fetchBag = () => api<Bag>('/api/bag')
export const fetchPublicBag = (wallet: string) => api<PublicBag>(`/api/bag/public/${encodeURIComponent(wallet)}`)
export const setBagPublic = (pub: boolean) => api<{ public: boolean }>('/api/bag/privacy', { method: 'POST', body: { public: pub } })

// ─── The Bag's live stream: one EventSource for the page ─────────────────────
// `price` (the ticker, the Bag page), and from the arena: `trade`, `pressure`, `rank`.

export type Window = 'm5' | 'h1' | 'h6' | 'h24'
export interface ArenaTrade {
  signature: string
  at: string
  kind: 'buy' | 'sell'
  wallet: string | null
  tokens: number
  sol: number
  usd: number | null
  member: boolean
  /** Shrimp, Fish, Dolphin, Shark or Whale for wallets that aren't members */
  label: string | null
  rank: { key: string; name: string; score: number } | null
  /** Set when this trade moved a member's rank */
  rankTo: { key: string; name: string } | null
}
export type Pressure = Record<Window, { buys: number; sells: number; buySol: number; sellSol: number; partial: boolean }>
export interface RankChange { wallet: string; signature: string; from: { key: string; name: string }; to: { key: string; name: string } }
export const fetchArena = () => api<{ trades: ArenaTrade[]; pressure: Pressure }>('/api/bag/arena')

type StreamEvents = { price: Market; trade: ArenaTrade; pressure: Pressure; rank: RankChange }
const listeners: { [K in keyof StreamEvents]: Set<(d: StreamEvents[K]) => void> } = {
  price: new Set(), trade: new Set(), pressure: new Set(), rank: new Set(),
}
let source: EventSource | null = null
let last: Market | null = null

function ensureSource() {
  if (source) return
  source = new EventSource('/api/bag/stream')
  for (const ev of Object.keys(listeners) as (keyof StreamEvents)[]) {
    source.addEventListener(ev, e => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        if (ev === 'price') last = data
        listeners[ev].forEach(h => (h as (d: unknown) => void)(data))
      } catch { /* malformed */ }
    })
  }
}

/** Listen to one kind of live event; the stream closes when nobody listens any more. */
export function subscribeStream<K extends keyof StreamEvents>(event: K, handler: (d: StreamEvents[K]) => void): () => void {
  listeners[event].add(handler)
  ensureSource()
  return () => {
    listeners[event].delete(handler)
    if (Object.values(listeners).every(s => s.size === 0)) { source?.close(); source = null }
  }
}

export function subscribeMarket(handler: (m: Market) => void): () => void {
  if (last) handler(last)
  return subscribeStream('price', handler)
}

// ─── Buys and sells as events: the celebration listens, anything can fire one ──
export interface TradeEvent { side: 'buy' | 'sell'; tokens?: number; tierUp?: string | null }
export const TRADE_EVENT = 'vvc:trade'
let lastAnnounced = 0
/** When the last celebration fired (so a swap made here isn't celebrated again when the chain shows it). */
export const lastAnnouncedAt = () => lastAnnounced
export function announceTrade(e: TradeEvent) {
  lastAnnounced = Date.now()
  window.dispatchEvent(new CustomEvent<TradeEvent>(TRADE_EVENT, { detail: e }))
}

// ─── Formatting shared by the ticker, the page and profiles ───────────────────
export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n !== 0 && Math.abs(n) < 0.01) return `$${n.toPrecision(3)}`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e4) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function fmtSol(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  return `${n.toLocaleString(undefined, { maximumFractionDigits: abs >= 100 ? 0 : abs >= 1 ? 2 : 4 })} SOL`
}
export function fmtPct(n: number | null | undefined, sign = true): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`
}
export const fmtTokens = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 2 : 0 })

/** "23d 04h 12m 09s" since an ISO time. */
export function since(iso: string, now = Date.now()): string {
  let s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  const d = Math.floor(s / 86400); s %= 86400
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d}d ${p(Math.floor(s / 3600))}h ${p(Math.floor((s % 3600) / 60))}m ${p(s % 60)}s`
}
/** The same countdown to an ISO time in the future. */
export const until = (iso: string, now = Date.now()) => since(new Date(now).toISOString(), Date.parse(iso))
export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000))

/** Your bag re-priced at the live market (the server's numbers are as of the last fetch). */
export function livePosition(bag: Bag | null, market: Market | null) {
  if (!bag) return null
  const sol = market?.sol ?? bag.market?.sol ?? null
  const usd = market?.usd ?? bag.market?.usd ?? null
  const costed = bag.lots.reduce((s, l) => s + (l.entrySol !== null ? l.tokens : 0), 0)
  const pnlSol = sol !== null && bag.costSol > 0 ? bag.proceedsSol + costed * sol - bag.costSol : null
  return {
    valueUsd: usd !== null ? bag.balance * usd : null,
    valueSol: sol !== null ? bag.balance * sol : null,
    pnlSol,
    pnlPct: pnlSol !== null ? (pnlSol / bag.costSol) * 100 : null,
  }
}

// ─── The token's pools on DexScreener (cached by the backend) ──────────────────
export interface Dex {
  main: { pair: string; dex: string; url: string } | null
  priceUsd: number | null
  change: Record<Window, number | null>
  txns: Record<Window, { buys: number; sells: number }>
  volume: Record<Window, number>
  liquidityUsd: number
  marketCap: number | null
  fdv: number | null
  createdAt: number | null
  pools: { pair: string; dex: string; quote: string; liquidityUsd: number; volume24h: number }[]
}
export const fetchDex = () => api<Dex>('/api/bag/dex')

// ─── Candles for the member's own chart (main pool, in SOL) ────────────────────
export type ChartTf = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
export interface Candles { tf: ChartTf; pool: string; currency: 'SOL'; candles: [number, number, number, number, number, number][] }
export const fetchCandles = (tf: ChartTf) => api<Candles>(`/api/bag/candles?tf=${tf}`)

// ─── Winners: leaderboards, Chad of the Day, rank flair ───────────────────────
export interface LeaderRow {
  wallet: string
  rank: { key: string; name: string; score: number }
  pnlPct: number | null
  pnlSol: number | null
  balance: number
  heldDays: number | null
}
export interface Leaders {
  printers: LeaderRow[]
  chads: LeaderRow[]
  diamond: LeaderRow[]
  bags: LeaderRow[]
  chadOfTheDay: { wallet: string; climb: number; score: number; rank: { key: string; name: string } } | null
}
export const fetchLeaders = () => api<Leaders>('/api/bag/leaders')

// Members' ranks for flair next to their names: batched, cached for the page (a minute)
type RankFlair = { key: string; name: string; score: number }
const rankCache = new Map<string, { at: number; p: Promise<RankFlair | null> }>()
let rankQueue: { wallet: string; resolve: (r: RankFlair | null) => void }[] = []
let rankTimer: number | null = null
function flushRanks() {
  const batch = rankQueue.splice(0, 100)
  rankTimer = rankQueue.length ? window.setTimeout(flushRanks, 0) : null
  api<{ ranks: Record<string, RankFlair> }>(`/api/bag/ranks?wallets=${batch.map(b => b.wallet).join(',')}`)
    .then(r => batch.forEach(b => b.resolve(r.ranks[b.wallet] ?? null)))
    .catch(() => batch.forEach(b => b.resolve(null)))
}
export function fetchRank(wallet: string): Promise<RankFlair | null> {
  const hit = rankCache.get(wallet)
  if (hit && Date.now() - hit.at < 60_000) return hit.p
  const p = new Promise<RankFlair | null>(resolve => { rankQueue.push({ wallet, resolve }) })
  rankCache.set(wallet, { at: Date.now(), p })
  rankTimer ??= window.setTimeout(flushRanks, 30)
  return p
}
