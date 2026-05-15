const CHAT = ''
const ANIM = ''

export interface Suggestion {
  id: string
  text: string
  submittedAt: string
  voteCount: number
  voters: string[]
}

export async function getSuggestions(): Promise<Suggestion[]> {
  try {
    const res = await fetch(`${CHAT}/api/suggestions`)
    if (!res.ok) return []
    const data = await res.json()
    return data.suggestions ?? []
  } catch { return [] }
}

export async function voteOnSuggestion(
  address: string,
  id: string,
  signature: string,
  nonce: string,
  action: 'upvote' | 'unvote',
): Promise<{ voteCount: number }> {
  const challenge = `VVC Live: ${action} suggestion ${id} as ${address} ts ${nonce}`
  const res = await fetch(`${CHAT}/api/suggestions/${id}/vote`, {
    method: action === 'upvote' ? 'POST' : 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: address, walletType: 'sol', signature, challenge, nonce }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const STREAM_URL = `${ANIM}/streams/live/stream.m3u8`
export const WS_URL     = `wss://suite.virginvschad.vip/ws/orchestrator`

export async function sendChat(message: string, voice?: 'chad' | 'virgin') {
  const res = await fetch(`${CHAT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, voice, mode: 'router' }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`)
  return res.json()
}

export async function getMemeIntake() {
  try {
    const res = await fetch(`${ANIM}/api/meme-intake`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function voteMeme(number: number) {
  const res = await fetch(`${ANIM}/api/meme-intake/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number }),
  })
  if (!res.ok) throw new Error(`Vote failed: ${res.status}`)
  return res.json()
}

export interface YtQueueItem {
  id: string
  url: string
  title: string
  addedAt: string
  voteCount: number
  voters: string[]
}

export async function getYtQueue(): Promise<YtQueueItem[]> {
  try {
    const res = await fetch(`${ANIM}/api/yt-queue`)
    if (!res.ok) return []
    const data = await res.json()
    return data.items ?? []
  } catch { return [] }
}

export async function submitYtVideo(url: string, title: string): Promise<YtQueueItem> {
  const res = await fetch(`${ANIM}/api/yt-queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data.item
}

export async function voteYtQueue(
  address: string,
  id: string,
  signature: string,
  nonce: string,
  action: 'upvote' | 'unvote',
): Promise<{ voteCount: number }> {
  const challenge = `VVC Live: ${action} yt-queue ${id} as ${address} ts ${nonce}`
  const res = await fetch(`${ANIM}/api/yt-queue/${id}/vote`, {
    method: action === 'upvote' ? 'POST' : 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: address, walletType: 'sol', signature, challenge, nonce }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

export async function getLists() {
  try {
    const res = await fetch(`${ANIM}/api/lists`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function voteList(list: 'video' | 'roadmap', index: number) {
  const res = await fetch(`${ANIM}/api/lists/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list, index }),
  })
  if (!res.ok) throw new Error(`Vote failed: ${res.status}`)
  return res.json()
}

export async function submitMemeToLivestream(text: string, userId?: string): Promise<{ ok: boolean; voting?: boolean; intake?: boolean; queued?: boolean; id?: string | null }> {
  const res = await fetch(`${ANIM}/api/orchestrator/meme/freestyle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data
}
