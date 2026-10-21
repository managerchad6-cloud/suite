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
}

export const fetchMarket = () => api<Market>('/api/bag/market')
export const fetchBag = () => api<Bag>('/api/bag')
export const fetchPublicBag = (wallet: string) => api<PublicBag>(`/api/bag/public/${encodeURIComponent(wallet)}`)
export const setBagPublic = (pub: boolean) => api<{ public: boolean }>('/api/bag/privacy', { method: 'POST', body: { public: pub } })

// One price stream for the page, shared by the ticker and the Bag page
type Handler = (m: Market) => void
let source: EventSource | null = null
let last: Market | null = null
const handlers = new Set<Handler>()

export function subscribeMarket(handler: Handler): () => void {
  handlers.add(handler)
  if (last) handler(last)
  if (!source) {
    source = new EventSource('/api/bag/stream')
    source.addEventListener('price', e => {
      try { last = JSON.parse((e as MessageEvent).data); handlers.forEach(h => h(last!)) } catch { /* malformed */ }
    })
  }
  return () => {
    handlers.delete(handler)
    if (handlers.size === 0) { source?.close(); source = null }
  }
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
export type Window = 'm5' | 'h1' | 'h6' | 'h24'
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
