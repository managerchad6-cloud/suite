import { api } from './client'

// X sharing (xbackend). Your connection, shares and metrics come from the session; per-meme and
// per-creator stats are public.

export interface TweetShare {
  id: string
  wallet: string
  meme_id: string
  meme_type: string
  tweet_id: string | null
  tweet_url: string | null
  tweet_text?: string | null
  x_handle?: string | null
  created_at: number
}

export interface XStatus {
  connected: boolean
  handle?: string
  user_id?: string
  configured?: boolean
  profile_image_url?: string | null
}

export interface TweetResult {
  ok: boolean
  tweet_id: string
  tweet_url: string
  share_id: string
  handle: string
}

export async function fetchXStatus(): Promise<XStatus> {
  try { return await api('/api/x/status') } catch { return { connected: false } }
}

/** Where to send the member to connect X (OAuth starts from the session). */
export const X_AUTH_URL = '/api/x/auth'

export function postXTweet(params: {
  text: string
  image_url?: string
  meme_id?: string
  meme_type?: string
  creator_wallet?: string
  share_in_community?: boolean
}): Promise<TweetResult> {
  return api('/api/x/tweet', { method: 'POST', body: params })
}

export async function disconnectX(): Promise<void> {
  await api('/api/x/disconnect', { method: 'DELETE' })
}

export async function fetchMyShares(): Promise<TweetShare[]> {
  try { return (await api<{ items?: TweetShare[] }>('/api/x/shares')).items ?? [] } catch { return [] }
}

export interface TweetMetrics {
  tweet_id: string
  like_count: number
  retweet_count: number
  reply_count: number
  quote_count: number
  impression_count: number
  updated_at: number
}

export async function fetchTweetMetrics(): Promise<TweetMetrics[]> {
  try { return (await api<{ items?: TweetMetrics[] }>('/api/x/metrics')).items ?? [] } catch { return [] }
}

export async function refreshMetrics(): Promise<void> {
  await api('/api/x/metrics/refresh', { method: 'POST' }).catch(() => {})
}

/** Live metric updates for your tweets (EventSource sends the session cookie same-origin). */
export function subscribeToMetrics(onUpdate: (m: TweetMetrics) => void): () => void {
  const es = new EventSource('/api/x/metrics/events')
  es.onmessage = e => {
    try { onUpdate(JSON.parse(e.data) as TweetMetrics) } catch {}
  }
  es.onerror = () => {}
  return () => es.close()
}

export interface MemeShareItem {
  id: string
  wallet: string
  meme_id: string
  meme_type: string
  tweet_id: string | null
  tweet_url: string | null
  tweet_text: string | null
  x_handle: string | null
  creator_wallet: string | null
  created_at: number
  like_count: number | null
  retweet_count: number | null
  reply_count: number | null
  quote_count: number | null
  impression_count: number | null
  metrics_updated_at: number | null
}

export interface MemeTotals {
  share_count: number
  total_likes: number
  total_rts: number
  total_replies: number
  total_views: number
}

export async function fetchMemeShares(meme_id: string, meme_type: string): Promise<MemeShareItem[]> {
  try {
    const res = await fetch(`/api/x/shares/meme?meme_id=${encodeURIComponent(meme_id)}&meme_type=${encodeURIComponent(meme_type)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.items ?? []
  } catch { return [] }
}

export async function fetchMemeTotals(meme_id: string, meme_type: string): Promise<MemeTotals> {
  try {
    const res = await fetch(`/api/x/meme-totals?meme_id=${encodeURIComponent(meme_id)}&meme_type=${encodeURIComponent(meme_type)}`)
    if (!res.ok) return { share_count: 0, total_likes: 0, total_rts: 0, total_replies: 0, total_views: 0 }
    return res.json()
  } catch { return { share_count: 0, total_likes: 0, total_rts: 0, total_replies: 0, total_views: 0 } }
}

export async function fetchCreatorShares(wallet: string): Promise<MemeShareItem[]> {
  try {
    const res = await fetch(`/api/x/shares/creator?wallet=${encodeURIComponent(wallet)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.items ?? []
  } catch { return [] }
}

export interface CreatorEngagement {
  total_shares: number
  total_likes: number
  total_rts: number
  total_replies: number
  total_views: number
}

export async function fetchCreatorEngagement(wallet: string): Promise<CreatorEngagement> {
  try {
    const res = await fetch(`/api/x/creator-engagement?wallet=${encodeURIComponent(wallet)}`)
    if (!res.ok) return { total_shares: 0, total_likes: 0, total_rts: 0, total_replies: 0, total_views: 0 }
    return res.json()
  } catch { return { total_shares: 0, total_likes: 0, total_rts: 0, total_replies: 0, total_views: 0 } }
}
