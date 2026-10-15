import { api } from './client'

// Follower counts and lists are public; following someone and "do I follow them?" are yours (session).

export interface FollowStats {
  followers: number
  following: number
}

export async function fetchFollowStats(wallet: string): Promise<FollowStats> {
  try { return await api(`/api/follow/stats/${encodeURIComponent(wallet)}`) } catch { return { followers: 0, following: 0 } }
}

export async function fetchFollowing(wallet: string): Promise<string[]> {
  try { return await api(`/api/follow/following/${encodeURIComponent(wallet)}`) } catch { return [] }
}

export async function fetchFollowers(wallet: string): Promise<string[]> {
  try { return await api(`/api/follow/followers/${encodeURIComponent(wallet)}`) } catch { return [] }
}

/** Follow or unfollow `wallet` as the signed-in member. */
export function toggleFollow(wallet: string): Promise<{ is_following: boolean; follower_count: number }> {
  return api('/api/follow', { method: 'POST', body: { following: wallet } })
}

/** Whether you follow `wallet` (false for guests). */
export async function checkIsFollowing(wallet: string): Promise<boolean> {
  try {
    return (await api<{ is_following: boolean }>(`/api/follow/check?following=${encodeURIComponent(wallet)}`)).is_following
  } catch { return false }
}
