export interface VoteState {
  up_votes: number
  down_votes: number
  score: number
  tier: 'fresh' | 'rising' | 'hot' | 'legendary' | 'pantheon'
  your_vote: 1 | -1 | null
}

export interface CastVoteResult extends VoteState {
  meme_id: string
  meme_source: string
  xp_awarded: number
  rank: string
  ranked_up: boolean
}

export async function castVote(
  meme_id: string,
  meme_source: string,
  direction: 1 | -1,
  wallet: string,
): Promise<CastVoteResult> {
  const res = await fetch('/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meme_id, meme_source, direction, wallet }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Vote failed: ${res.status}`)
  }
  return res.json()
}

export async function getVoteState(
  meme_id: string,
  meme_source: string,
  wallet?: string,
): Promise<VoteState> {
  const url = `/api/votes/${encodeURIComponent(meme_source)}/${encodeURIComponent(meme_id)}` +
    (wallet ? `?wallet=${encodeURIComponent(wallet)}` : '')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Vote state failed: ${res.status}`)
  return res.json()
}

export async function trackFeedAction(
  wallet: string,
  meme_id: string,
  meme_source: string,
  action: 'up' | 'down' | 'skip' | 'comment' | 'share' | 'detail',
  dwell_ms?: number,
): Promise<void> {
  await fetch('/api/feed/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, meme_id, meme_source, action, dwell_ms }),
  }).catch(() => {})
}
