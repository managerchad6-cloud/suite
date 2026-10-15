import { api } from './client'

// Zad's chat is answered by memestudio-backend (members only; it holds the corpus and the key).

export interface Message {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

export const makeUserMsg  = (text: string): Message => ({ role: 'user',  parts: [{ text }] })
export const makeModelMsg = (text: string): Message => ({ role: 'model', parts: [{ text }] })

/** `history` already ends with the new user message. */
export async function chatWithZad(history: Message[]): Promise<string> {
  const { text } = await api<{ text: string }>('/api/ai/zad', {
    method: 'POST',
    body: { history: history.map(m => ({ role: m.role, text: m.parts[0].text })) },
  })
  return text.trim()
}

/** Twelve meme annotation labels for a character in a scene (Studio "magic labels"). */
export async function generateMemeLabels(character: { name: string; tagline?: string; lore?: string; traits?: string[] }, scene: string): Promise<string[]> {
  const { labels } = await api<{ labels: string[] }>('/api/ai/labels', { method: 'POST', body: { character, scene } })
  return labels
}
