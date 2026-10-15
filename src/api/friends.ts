export type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends'

export interface FriendStatusResult {
  status: FriendStatus
  request_id?: number
}

export interface FriendRequest {
  id: number
  from_wallet: string
  to_wallet: string
  created_at: string
}

export async function fetchFriends(wallet: string): Promise<string[]> {
  try {
    const r = await fetch(`/api/friends/${encodeURIComponent(wallet)}`)
    const d = r.ok ? await r.json() : []
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

export async function fetchFriendRequests(wallet: string): Promise<FriendRequest[]> {
  try {
    const r = await fetch(`/api/friends/requests/${encodeURIComponent(wallet)}`)
    const d = r.ok ? await r.json() : []
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

export async function fetchFriendStatus(a: string, b: string): Promise<FriendStatusResult> {
  try {
    const r = await fetch(`/api/friends/status?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
    return r.ok ? r.json() : { status: 'none' }
  } catch { return { status: 'none' } }
}

export async function sendFriendRequest(from: string, to: string): Promise<FriendStatusResult> {
  const r = await fetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  })
  if (!r.ok) throw new Error('Friend request failed')
  return r.json()
}

export async function respondToFriendRequest(
  request_id: number,
  action: 'accept' | 'decline',
): Promise<{ status: string }> {
  const r = await fetch('/api/friends/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id, action }),
  })
  if (!r.ok) throw new Error('Friend response failed')
  return r.json()
}

export async function removeFriend(wallet_a: string, wallet_b: string): Promise<void> {
  await fetch('/api/friends', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_a, wallet_b }),
  })
}
