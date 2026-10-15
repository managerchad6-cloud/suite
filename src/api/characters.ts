import { api } from './client'

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

/** The roster; for a signed-in member it includes their collection state. */
export function fetchCharacters(): Promise<Character[]> {
  return api('/api/characters')
}

export async function unlockCharacter(id: string): Promise<void> {
  await api(`/api/characters/${encodeURIComponent(id)}/unlock`, { method: 'POST' })
}

export async function setMainCharacter(id: string): Promise<void> {
  await api(`/api/characters/${encodeURIComponent(id)}/main`, { method: 'POST' })
}
