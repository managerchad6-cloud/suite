import { api } from './client'

// Zad's chat is answered by memestudio-backend (members only; it holds the corpus and the key).

export interface Message {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

export const makeUserMsg  = (text: string): Message => ({ role: 'user',  parts: [{ text }] })
export const makeModelMsg = (text: string): Message => ({ role: 'model', parts: [{ text }] })

/** Today's free Zad messages (more for bigger $VVC holder tiers); past them a message costs credits */
export interface ZadQuota { used: number; limit: number; left: number; tier: string | null; extraCost: number; resetsAt: string }

export const fetchZadQuota = () => api<ZadQuota>('/api/ai/zad/quota')

/**
 * `history` already ends with the new user message. `pay` spends credits once today's free messages
 * are used up. Errors: 429 {code: 'zad_quota', quota}, 402 {code: 'insufficient_credits'}.
 */
export async function chatWithZad(history: Message[], { pay = false } = {}): Promise<{ text: string; quota?: ZadQuota; balance?: number }> {
  const r = await api<{ text: string; quota?: ZadQuota; balance?: number }>('/api/ai/zad', {
    method: 'POST',
    body: { history: history.map(m => ({ role: m.role, text: m.parts[0].text })), ...(pay ? { pay: true } : {}) },
  })
  return { ...r, text: r.text.trim() }
}

/** Twelve meme annotation labels for a character in a scene (Studio "magic labels"). */
export async function generateMemeLabels(character: { name: string; tagline?: string; lore?: string; traits?: string[] }, scene: string): Promise<string[]> {
  const { labels } = await api<{ labels: string[] }>('/api/ai/labels', { method: 'POST', body: { character, scene } })
  return labels
}
