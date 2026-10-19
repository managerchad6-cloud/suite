import { api } from './client'
import { dispatchBadges, type BadgeDef } from './player'

type WithBadges<T> = T & { new_badges?: BadgeDef[] }

function withBadges<T>(p: Promise<WithBadges<T>>): Promise<T> {
  return p.then(data => { dispatchBadges(data.new_badges); return data })
}

export interface CreditPack {
  id: string
  label: string
  credits: number
  usdc: number
}

export interface CreditCosts {
  meme_generate:    number
  studio_reskin:    number
  studio_inaction1: number
  studio_inaction2: number
  studio_inaction3: number
  studio_art:       number
  portrait:         number
}

export interface MemeToken {
  wallet: string
  ts: number
  sig: string
}

export type CreditAction = keyof CreditCosts

// Your own balance and charges: the session decides whose credits these are.
export async function fetchCreditBalance(): Promise<{ balance: number; lifetime: number }> {
  try { return await api('/api/credits/balance') } catch { return { balance: 0, lifetime: 0 } }
}

/** `character_regen` is charged by its own endpoint (regenerateCharacter), not through deductCredits */
export function fetchCreditPacks(): Promise<{ packs: CreditPack[]; costs: CreditCosts & { character_regen?: number; banner?: number } }> {
  return api('/api/credits/packs')
}

export interface CreditHistoryItem {
  at: string
  /** + received (purchase, holder top-up, refund), − spent */
  amount: number
  kind: string
}

export async function fetchCreditHistory(limit = 40): Promise<CreditHistoryItem[]> {
  try { return (await api<{ items: CreditHistoryItem[] }>(`/api/credits/history?limit=${limit}`)).items } catch { return [] }
}

/**
 * Paid: a new archetype + art from your interview. Charged here; refunded in full if it fails
 * (the error then carries `refunded: true`). The old character stays available to go back to.
 */
/** Paid: a wide banner from your character and personality, made in the background (watch profile.banner). */
export function generateBanner(): Promise<{ ok: boolean; cost: number; new_balance: number; jobId: string | null }> {
  return withBadges(api<{ ok: boolean; cost: number; new_balance: number; jobId: string | null }>('/api/credits/generate-banner', { method: 'POST' }))
    .then(r => { window.dispatchEvent(new CustomEvent('vvc:credits-changed')); return r })
}

/** A banner that failed in the background: get the credits back (once; the server checks it really failed). */
export function refundBanner(jobId: string): Promise<{ ok: boolean; refunded: number; new_balance: number }> {
  return api<{ ok: boolean; refunded: number; new_balance: number }>('/api/credits/banner-refund', { method: 'POST', body: { jobId } })
    .then(r => { window.dispatchEvent(new CustomEvent('vvc:credits-changed')); return r })
}

export function regenerateCharacter(): Promise<{ ok: boolean; cost: number; new_balance: number }> {
  return withBadges(api<{ ok: boolean; cost: number; new_balance: number }>('/api/credits/regenerate-character', { method: 'POST' }))
    .then(r => { window.dispatchEvent(new CustomEvent('vvc:credits-changed')); return r })
}

/** Charge an action. Studio AI actions also return `ai_ticket`: the images this charge paid for. */
export function deductCredits(action: CreditAction, refId?: string): Promise<{ ok: boolean; deducted: number; new_balance: number; ai_ticket?: string }> {
  return withBadges(api('/api/credits/deduct', { method: 'POST', body: { action, ref_id: refId } }))
}

export interface PriceQuote { quote_id: string; pack_id: string; method: 'sol' | 'vvc'; amount_raw: number; decimals: number; expires_at: string }

/** The server fixes a pack's price in SOL or $VVC for 10 minutes; pay exactly amount_raw (lamports / base units). */
export function getPriceQuote(packId: string, method: 'sol' | 'vvc'): Promise<PriceQuote> {
  return api('/api/credits/quote', { method: 'POST', body: { pack_id: packId, method } })
}

/** Credit a purchase; the transaction must be signed by the signed-in wallet. SOL and $VVC need the quote it paid. */
export function verifyPurchase(
  packId: string,
  txSignature: string,
  paymentMethod: 'usdc' | 'sol' | 'vvc' = 'usdc',
  quoteId?: string,
): Promise<{ ok: boolean; credits_added: number; new_balance: number }> {
  return withBadges(api('/api/credits/purchase', {
    method: 'POST',
    body: { pack_id: packId, tx_signature: txSignature, payment_method: paymentMethod, quote_id: quoteId },
  }))
}

export function issueMemeToken(): Promise<MemeToken & { credits_deducted: number }> {
  return api('/api/credits/issue-meme-token', { method: 'POST' })
}

// ─── $VVC: the site token. Holders get free credits every week; nobody else gets free credits ──

export interface TokenConfig {
  symbol: string          // always shown as $VVC
  mint: string            // pre-launch: a placeholder set on the server
  buyEnabled: boolean     // false: "Buy $VVC" shows as coming soon
  holder: { minBalance: number; weeklyCredits: number; joinMinBalance: number }
  /** Bag-size tiers: from minBalance up, what they earn a week (before the time-held bonus) */
  tiers: { key: string; name: string; minBalance: number; weekly: number }[]
  /** Time held above the minimum, and the bonus it adds */
  loyalty: { key: string; name: string; weeks: number; bonusPct: number }[]
}

/** A holder's place on the ladder (null when under the minimum) */
export interface HolderTier {
  key: string
  name: string
  weekly: number
  weeksHeld: number
  loyalty: { key: string; name: string; bonusPct: number }
  nextBag: { name: string; minBalance: number; weekly: number } | null
  nextLoyalty: { name: string; bonusPct: number; at: string } | null
}

export interface HolderStatus {
  symbol: string
  isHolder: boolean
  tokenBalance: number
  minBalance: number
  joinMinBalance: number
  /** This holder's weekly credits (the base amount for non-holders) */
  weeklyCredits: number
  tier: HolderTier | null
  freeCredits: number     // free credits still unspent (part of the balance)
  granted: number         // credits added by this check
  nextRefillAt: string | null
  checkedAt: string | null
  error?: string
}

let tokenConfig: Promise<TokenConfig> | null = null
/** Public, fetched once per page load. */
export function fetchTokenConfig(): Promise<TokenConfig> {
  tokenConfig ??= api<TokenConfig>('/api/credits/token').catch(e => { tokenConfig = null; throw e })
  return tokenConfig
}

function holderResult(p: Promise<HolderStatus>): Promise<HolderStatus> {
  return p.then(s => {
    if (s.granted > 0) window.dispatchEvent(new CustomEvent('vvc:credits-changed'))
    window.dispatchEvent(new CustomEvent('vvc:holder-status', { detail: s }))
    return s
  })
}

/** The member's holder status; the server tops up the weekly free credits when they are due. */
export function fetchHolderStatus(): Promise<HolderStatus> {
  return holderResult(api('/api/credits/holder'))
}

/** Re-read the token balance from the chain now (right after a swap). */
export function checkHolderNow(): Promise<HolderStatus> {
  return holderResult(api('/api/credits/holder/check', { method: 'POST' }))
}

/** Open the "Buy $VVC" modal from anywhere. */
export function openBuyVvc() {
  window.dispatchEvent(new CustomEvent('vvc:buy-vvc'))
}
