import { api } from './client'
import { dispatchBadges, type BadgeDef } from './player'

export interface VoteState {
  up_votes: number
  down_votes: number
  score: number
  tier: 'fresh' | 'rising' | 'hot' | 'legendary' | 'pantheon'
  your_vote: 1 | -1 | null
}

/** Votes in a row: each within window_ms of the last; milestones pay a bonus */
export interface StreakState {
  count: number
  expires_at: string | null
  window_ms: number
  best: number
  next_bonus: { at: number; xp: number } | null
  /** On a vote: the bonus this vote just paid */
  bonus_xp?: number
}

/** Distinct memes voted today (UTC) toward the daily goal */
export interface DailyState {
  count: number
  goal: number
  completed: boolean
  goal_streak: number
  xp: number
  bonus_xp?: number
  just_completed?: boolean
}

export interface FeedProgress { streak: StreakState; daily: DailyState }

export interface CastVoteResult extends VoteState {
  meme_id: string
  meme_source: string
  prev_tier: VoteState['tier']
  /** Everything this vote paid: the vote itself (first vote on a meme only) plus streak and goal bonuses */
  xp_awarded: number
  rank: string
  ranked_up: boolean
  /** Null when the vote didn't count toward them (taken back, flipped, or voted before) */
  streak: StreakState | null
  daily: DailyState | null
}

/** Up/down vote as the signed-in member (toggle: the same direction again removes it). */
export function castVote(meme_id: string, meme_source: string, direction: 1 | -1): Promise<CastVoteResult> {
  return api<CastVoteResult & { new_badges?: BadgeDef[] }>('/api/votes', { method: 'POST', body: { meme_id, meme_source, direction } })
    .then(data => { dispatchBadges(data.new_badges); return data })
}

/** Your streak and daily goal (members only) */
export function getFeedProgress(): Promise<FeedProgress> {
  return api('/api/feed/progress')
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
