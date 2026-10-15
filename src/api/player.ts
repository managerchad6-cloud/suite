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
  const res = await fetch('/api/badges')
  if (!res.ok) return []
  const data = await res.json()
  return data.badges ?? []
}

export async function fetchPlayerBadges(wallet: string): Promise<{ badges: PlayerBadge[]; total_xp: number }> {
  const res = await fetch(`/api/badges/${encodeURIComponent(wallet)}`)
  if (!res.ok) return { badges: [], total_xp: 0 }
  return res.json()
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

export async function trackBadgeCounter(wallet: string, counter: string, amount = 1): Promise<BadgeDef[]> {
  const res = await fetch('/api/badges/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, counter, amount }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.new_badges ?? []
}

export async function recordLogin(wallet: string): Promise<{
  already_logged?: boolean
  streak?: number
  xp_awarded?: number
  rank?: string
  ranked_up?: boolean
  new_badges?: BadgeDef[]
}> {
  const res = await fetch(`/api/player/${encodeURIComponent(wallet)}/login`, { method: 'POST' })
  if (!res.ok) return {}
  return res.json()
}

export const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  fresh:     { label: 'FRESH',     color: '#60b0ff' },
  rising:    { label: 'RISING',    color: '#F0D020' },
  hot:       { label: 'HOT',       color: '#F07020' },
  legendary: { label: 'LEGENDARY', color: '#FFD700' },
  pantheon:  { label: 'PANTHEON',  color: '#fff'    },
}
