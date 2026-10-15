import { api } from './client'

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

/** Up/down vote as the signed-in member (toggle: the same direction again removes it). */
export function castVote(meme_id: string, meme_source: string, direction: 1 | -1): Promise<CastVoteResult> {
  return api('/api/votes', { method: 'POST', body: { meme_id, meme_source, direction } })
}

/** Public vote counts; your_vote is filled in when a member is signed in. */
export function getVoteState(meme_id: string, meme_source: string): Promise<VoteState> {
  return api(`/api/votes/${encodeURIComponent(meme_source)}/${encodeURIComponent(meme_id)}`)
}

/** Engagement signal for the member's feed (members only; guests are not tracked). */
export async function trackFeedAction(
  meme_id: string,
  meme_source: string,
  action: 'up' | 'down' | 'skip' | 'comment' | 'share' | 'detail',
  dwell_ms?: number,
): Promise<void> {
  await api('/api/feed/track', { method: 'POST', body: { meme_id, meme_source, action, dwell_ms } }).catch(() => {})
}
