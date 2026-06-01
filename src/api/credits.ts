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

export async function fetchCreditBalance(wallet: string): Promise<{ balance: number; lifetime: number }> {
  const res = await fetch(`/api/credits/${encodeURIComponent(wallet)}`)
  if (!res.ok) return { balance: 0, lifetime: 0 }
  return res.json()
}

export async function fetchCreditPacks(): Promise<{ packs: CreditPack[]; costs: CreditCosts }> {
  const res = await fetch('/api/credits/packs')
  if (!res.ok) throw new Error('Failed to load credit packs')
  return res.json()
}

export async function deductCredits(
  wallet: string,
  action: CreditAction,
  refId?: string,
): Promise<{ ok: boolean; deducted: number; new_balance: number }> {
  const res = await fetch('/api/credits/deduct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, action, ref_id: refId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.detail ?? 'Credit deduction failed'), { status: res.status, ...err })
  }
  return res.json()
}

export async function refundCredits(wallet: string, action: CreditAction): Promise<void> {
  await fetch('/api/credits/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, action }),
  }).catch(() => {})
}

export async function verifyPurchase(
  wallet: string,
  packId: string,
  txSignature: string,
  paymentMethod: 'usdc' | 'sol' | 'vvc' = 'usdc',
  expectedLamports?: number,
): Promise<{ ok: boolean; credits_added: number; new_balance: number }> {
  const res = await fetch('/api/credits/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, pack_id: packId, tx_signature: txSignature, payment_method: paymentMethod, expected_lamports: expectedLamports }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Purchase verification failed')
  }
  return res.json()
}

export async function issueMemeToken(wallet: string): Promise<MemeToken & { credits_deducted: number }> {
  const res = await fetch('/api/credits/issue-meme-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.detail ?? 'Token issue failed'), { status: res.status, ...err })
  }
  return res.json()
}

export async function claimSignupBonus(wallet: string): Promise<{ granted: number; new_balance: number }> {
  const res = await fetch('/api/credits/signup-bonus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) return { granted: 0, new_balance: 0 }
  return res.json()
}
