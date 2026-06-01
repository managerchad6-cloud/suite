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

export async function recordLogin(wallet: string): Promise<{
  already_logged?: boolean
  streak?: number
  xp_awarded?: number
  rank?: string
  ranked_up?: boolean
}> {
  const res = await fetch(`/api/player/${encodeURIComponent(wallet)}/login`, { method: 'POST' })
  if (!res.ok) return {}
  return res.json()
}

export const RANK_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  basic:        { label: 'Basic',        color: '#888',    bg: '#1a1a1a' },
  brad:         { label: 'Brad',         color: '#60b0ff', bg: '#080f1a' },
  lad:          { label: 'Lad',          color: '#60b0ff', bg: '#080f1a' },
  thad:         { label: 'Thad',         color: '#40d0ff', bg: '#051520' },
  chad:         { label: 'Chad',         color: '#F0A020', bg: '#1a0f00' },
  gigachad:     { label: 'Gigachad',     color: '#FFD700', bg: '#1a1200' },
  gad:          { label: 'Gad',          color: '#fff',    bg: '#2a1a00' },
  neckbeard:    { label: 'Neckbeard',    color: '#c060ff', bg: '#120a1a' },
  incel:        { label: 'Incel',        color: '#c060ff', bg: '#120a1a' },
  wizard:       { label: 'Wizard',       color: '#a040ff', bg: '#0f0820' },
  virgin_rank:  { label: 'Virgin',       color: '#ff6060', bg: '#1a0808' },
  transcendent: { label: 'Transcendent', color: '#ff40a0', bg: '#1a0510' },
  gizzard:      { label: 'Gizzard',      color: '#fff',    bg: '#1a0010' },
}

export const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  fresh:     { label: 'FRESH',     color: '#60b0ff' },
  rising:    { label: 'RISING',    color: '#F0D020' },
  hot:       { label: 'HOT',       color: '#F07020' },
  legendary: { label: 'LEGENDARY', color: '#FFD700' },
  pantheon:  { label: 'PANTHEON',  color: '#fff'    },
}
