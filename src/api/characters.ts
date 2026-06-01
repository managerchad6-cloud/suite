export interface Character {
  id: string
  name: string
  category: 'male' | 'female' | 'deity'
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  spectrum: number | null
  unlock_rank: string
  description: string | null
  // per-wallet fields (present when fetched with wallet param)
  unlocked?: boolean
  can_unlock?: boolean
  uses_count?: number
  mastery_xp?: number
  mastery_level?: number
  is_main?: boolean
  unlocked_at?: string | null
}

export const MASTERY_LEVELS = [
  { level: 0, name: 'Locked',          xp: 0 },
  { level: 1, name: 'Novice',          xp: 100 },
  { level: 2, name: 'Adept',           xp: 500 },
  { level: 3, name: 'Skilled',         xp: 2_000 },
  { level: 4, name: 'Master',          xp: 8_000 },
  { level: 5, name: 'Legendary Main',  xp: 25_000 },
]

export const RARITY_COLOR: Record<string, string> = {
  common:    '#888',
  uncommon:  '#4acc7a',
  rare:      '#60b0ff',
  legendary: '#FFD700',
}

export async function fetchCharacters(wallet?: string): Promise<Character[]> {
  const url = `/api/characters${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch characters')
  return res.json()
}

export async function unlockCharacter(id: string, wallet: string): Promise<void> {
  const res = await fetch(`/api/characters/${encodeURIComponent(id)}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Unlock failed')
  }
}

export async function setMainCharacter(id: string, wallet: string): Promise<void> {
  const res = await fetch(`/api/characters/${encodeURIComponent(id)}/main`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) throw new Error('Failed to set main')
}
