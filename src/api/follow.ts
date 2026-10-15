export interface FollowStats {
  followers: number
  following: number
}

export async function fetchFollowStats(wallet: string): Promise<FollowStats> {
  try {
    const r = await fetch(`/api/follow/stats/${encodeURIComponent(wallet)}`)
    return r.ok ? r.json() : { followers: 0, following: 0 }
  } catch { return { followers: 0, following: 0 } }
}

export async function fetchFollowing(wallet: string): Promise<string[]> {
  try {
    const r = await fetch(`/api/follow/following/${encodeURIComponent(wallet)}`)
    return r.ok ? r.json() : []
  } catch { return [] }
}

export async function fetchFollowers(wallet: string): Promise<string[]> {
  try {
    const r = await fetch(`/api/follow/followers/${encodeURIComponent(wallet)}`)
    return r.ok ? r.json() : []
  } catch { return [] }
}

export async function toggleFollow(
  follower: string,
  following: string,
): Promise<{ is_following: boolean; follower_count: number }> {
  const r = await fetch('/api/follow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ follower, following }),
  })
  if (!r.ok) throw new Error('Follow request failed')
  return r.json()
}

export async function checkIsFollowing(follower: string, following: string): Promise<boolean> {
  try {
    const r = await fetch(
      `/api/follow/check?follower=${encodeURIComponent(follower)}&following=${encodeURIComponent(following)}`,
    )
    if (!r.ok) return false
    const data = await r.json()
    return data.is_following
  } catch { return false }
}
