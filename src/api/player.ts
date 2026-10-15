import { api } from './client'

export interface PlayerState {
  wallet: string
  chad_xp: number
  virgin_xp: number
  total_xp: number
  current_rank: string
  rank_direction: 'chad' | 'virgin' | 'neutral'
  rank_progress: number
  spectrum_position: number
  login_streak: number
  creation_streak: number
  voting_streak: number
  last_login_at: string | null
  prestige_count: number
  prestige_track: string | null
  updated_at: string
}

export interface ActivityEvent {
  id: string
  wallet: string
  event_type: string
  meme_id: string | null
  meme_source: string | null
  payload: Record<string, unknown>
  xp_awarded: number
  xp_alignment: 'chad' | 'virgin' | 'neutral'
  created_at: string
}

export interface BadgeDef {
  id: string
  name: string
  description: string
  icon: string
  xp_reward: number
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  category: string
}

export interface PlayerBadge extends BadgeDef {
  badge_id: string
  unlocked_at: string
}

export async function fetchPlayer(wallet: string): Promise<PlayerState> {
  const res = await fetch(`/api/player/${encodeURIComponent(wallet)}`)
  if (!res.ok) throw new Error(`Player fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchPlayerTimeline(wallet: string, limit = 30): Promise<ActivityEvent[]> {
  const res = await fetch(`/api/player/${encodeURIComponent(wallet)}/timeline?limit=${limit}`)
  if (!res.ok) throw new Error(`Timeline fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchBadges(): Promise<BadgeDef[]> {
  try { return (await api<{ badges?: BadgeDef[] }>('/api/badges')).badges ?? [] } catch { return [] }
}

export async function fetchPlayerBadges(wallet: string): Promise<{ badges: PlayerBadge[]; total_xp: number }> {
  try { return await api(`/api/badges/${encodeURIComponent(wallet)}`) } catch { return { badges: [], total_xp: 0 } }
}

export function dispatchBadges(badges: BadgeDef[] | undefined) {
  if (badges?.length) {
    window.dispatchEvent(new CustomEvent('vvc:badges-unlocked', { detail: badges }))
  }
}

export function dispatchXP(amount: number, alignment: 'chad' | 'virgin' | 'neutral' = 'neutral') {
  if (amount > 0)
    window.dispatchEvent(new CustomEvent('vvc:xp-awarded', { detail: { amount, alignment } }))
}

/** Count something the member did toward a badge (members only; guests count nothing). */
export async function trackBadgeCounter(counter: string, amount = 1): Promise<BadgeDef[]> {
  try {
    return (await api<{ new_badges?: BadgeDef[] }>('/api/badges/track', { method: 'POST', body: { counter, amount } })).new_badges ?? []
  } catch { return [] }
}

/** Daily login for the signed-in member (idempotent per day). */
export async function recordLogin(): Promise<{
  already_logged?: boolean
  streak?: number
  xp_awarded?: number
  rank?: string
  ranked_up?: boolean
  new_badges?: BadgeDef[]
}> {
  try { return await api('/api/player/login', { method: 'POST' }) } catch { return {} }
}

export const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  fresh:     { label: 'FRESH',     color: '#60b0ff' },
  rising:    { label: 'RISING',    color: '#F0D020' },
  hot:       { label: 'HOT',       color: '#F07020' },
  legendary: { label: 'LEGENDARY', color: '#FFD700' },
  pantheon:  { label: 'PANTHEON',  color: '#fff'    },
}
