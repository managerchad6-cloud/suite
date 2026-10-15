import { api } from './client'

// Direct messages: only the two people in a conversation can read it. Everything here is yours
// (the session decides who "you" are); the other side is named by wallet.

export interface DirectMessage {
  id: string
  from_wallet: string
  to_wallet: string
  body: string
  read: number
  created_at: string
}

export interface Conversation {
  partner: string
  last_message: DirectMessage | null
  unread_count: number
}

export async function fetchConversations(): Promise<{ items: Conversation[]; unread_total: number }> {
  try {
    const d = await api<{ items?: Conversation[]; unread_total?: number }>('/api/messages/conversations')
    return Array.isArray(d?.items) ? { items: d.items, unread_total: d.unread_total ?? 0 } : { items: [], unread_total: 0 }
  } catch { return { items: [], unread_total: 0 } }
}

/** Your conversation with `wallet`, oldest first. */
export async function fetchThread(wallet: string, limit = 50): Promise<DirectMessage[]> {
  try {
    const d = await api<unknown>(`/api/messages/thread/${encodeURIComponent(wallet)}?limit=${limit}`)
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

export function sendMessage(to: string, body: string): Promise<DirectMessage> {
  return api('/api/messages', { method: 'POST', body: { to, body } })
}

export async function markThreadRead(wallet: string): Promise<void> {
  await api('/api/messages/read', { method: 'POST', body: { with: wallet } }).catch(() => {})
}
