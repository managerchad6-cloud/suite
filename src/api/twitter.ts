export interface TweetShare {
  id: string
  wallet: string
  meme_id: string
  meme_type: string
  tweet_id: string | null
  tweet_url: string | null
  created_at: number
}

export interface XStatus {
  connected: boolean
  handle?: string
  user_id?: string
  configured?: boolean
}

export interface TweetResult {
  ok: boolean
  tweet_id: string
  tweet_url: string
  share_id: string
  handle: string
}

export async function fetchXStatus(wallet: string): Promise<XStatus> {
  try {
    const res = await fetch(`/api/x/status?wallet=${encodeURIComponent(wallet)}`)
    if (!res.ok) return { connected: false }
    return res.json()
  } catch { return { connected: false } }
}

export async function postXTweet(params: {
  wallet: string
  text: string
  image_url?: string
  meme_id?: string
  meme_type?: string
  creator_wallet?: string
}): Promise<TweetResult> {
  const res = await fetch('/api/x/tweet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(data.detail || data.title || `HTTP ${res.status}`)
  return data
}

export async function disconnectX(wallet: string): Promise<void> {
  await fetch('/api/x/disconnect', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
}

export async function fetchMyShares(wallet: string): Promise<TweetShare[]> {
  const res = await fetch(`/api/x/shares?wallet=${encodeURIComponent(wallet)}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.items ?? []
}
