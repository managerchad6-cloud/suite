import { api } from './client'

// Anyone's friend list is public; requests and your relation to someone are yours (session).

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
    const d = await api<unknown>(`/api/friends/${encodeURIComponent(wallet)}`)
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

/** Requests waiting for your answer. */
export async function fetchFriendRequests(): Promise<FriendRequest[]> {
  try {
    const d = await api<unknown>('/api/friends/requests')
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

/** Your relation to `wallet` ('none' for guests). */
export async function fetchFriendStatus(wallet: string): Promise<FriendStatusResult> {
  try { return await api(`/api/friends/status?with=${encodeURIComponent(wallet)}`) } catch { return { status: 'none' } }
}

export function sendFriendRequest(to: string): Promise<FriendStatusResult> {
  return api('/api/friends/request', { method: 'POST', body: { to } })
}

/** Answer a request sent to you. */
export function respondToFriendRequest(request_id: number, action: 'accept' | 'decline'): Promise<{ status: string }> {
  return api('/api/friends/respond', { method: 'POST', body: { request_id, action } })
}

export async function removeFriend(wallet: string): Promise<void> {
  await api('/api/friends', { method: 'DELETE', body: { wallet } })
}
