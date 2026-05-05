const CHAT = ''
const ANIM = ''

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
