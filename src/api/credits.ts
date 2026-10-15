import { api } from './client'

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

export function fetchCreditPacks(): Promise<{ packs: CreditPack[]; costs: CreditCosts }> {
  return api('/api/credits/packs')
}

export function deductCredits(action: CreditAction, refId?: string): Promise<{ ok: boolean; deducted: number; new_balance: number }> {
  return api('/api/credits/deduct', { method: 'POST', body: { action, ref_id: refId } })
}

/** Credit a purchase; the transaction must be signed by the signed-in wallet. */
export function verifyPurchase(
  packId: string,
  txSignature: string,
  paymentMethod: 'usdc' | 'sol' | 'vvc' = 'usdc',
  expectedLamports?: number,
): Promise<{ ok: boolean; credits_added: number; new_balance: number }> {
  return api('/api/credits/purchase', {
    method: 'POST',
    body: { pack_id: packId, tx_signature: txSignature, payment_method: paymentMethod, expected_lamports: expectedLamports },
  })
}

export function issueMemeToken(): Promise<MemeToken & { credits_deducted: number }> {
  return api('/api/credits/issue-meme-token', { method: 'POST' })
}

export async function claimSignupBonus(): Promise<{ granted: number; new_balance: number }> {
  try { return await api('/api/credits/signup-bonus', { method: 'POST' }) } catch { return { granted: 0, new_balance: 0 } }
}
