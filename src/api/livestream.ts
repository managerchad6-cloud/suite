import { api } from './client'

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

// Votes act as the signed-in member (session cookie); no per-vote wallet signature.
export function voteOnSuggestion(id: string, action: 'upvote' | 'unvote'): Promise<{ voteCount: number }> {
  return api(`${CHAT}/api/suggestions/${encodeURIComponent(id)}/vote`, { method: action === 'upvote' ? 'POST' : 'DELETE' })
}

export const STREAM_URL = `${ANIM}/streams/live/stream.m3u8`
export const WS_URL     = `wss://suite.virginvschad.vip/ws/orchestrator`

/**
 * Answers as soon as the message is on the stream overlay; the reply is written afterwards.
 * Follow it with 'chat:status' events for `id`. `filtered` means chat is too busy right now.
 */
export function sendChat(message: string, voice?: 'chad' | 'virgin') {
  return api<{ queued?: boolean; id?: string; filtered?: boolean }>(`${CHAT}/api/chat`, { method: 'POST', body: { message, voice, mode: 'router' } })
}

export async function getMemeIntake() {
  try {
    const res = await fetch(`${ANIM}/api/meme-intake`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export function voteMeme(number: number) {
  return api(`${ANIM}/api/meme-intake/vote`, { method: 'POST', body: { number } })
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
  return (await api<{ item: YtQueueItem }>(`${ANIM}/api/yt-queue`, { method: 'POST', body: { url, title } })).item
}

export function voteYtQueue(id: string, action: 'upvote' | 'unvote'): Promise<{ voteCount: number }> {
  return api(`${ANIM}/api/yt-queue/${encodeURIComponent(id)}/vote`, { method: action === 'upvote' ? 'POST' : 'DELETE' })
}

export async function getLists() {
  try {
    const res = await fetch(`${ANIM}/api/lists`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export function voteList(list: 'video' | 'roadmap', index: number) {
  return api(`${ANIM}/api/lists/vote`, { method: 'POST', body: { list, index } })
}

export function submitMemeToLivestream(text: string): Promise<{ ok: boolean; voting?: boolean; intake?: boolean; queued?: boolean; id?: string | null }> {
  return api(`${ANIM}/api/orchestrator/meme/freestyle`, { method: 'POST', body: { text } })
}
