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

export async function fetchConversations(wallet: string): Promise<{ items: Conversation[]; unread_total: number }> {
  try {
    const r = await fetch(`/api/messages/conversations/${encodeURIComponent(wallet)}`)
    const d = r.ok ? await r.json() : null
    return Array.isArray(d?.items) ? d : { items: [], unread_total: 0 }
  } catch { return { items: [], unread_total: 0 } }
}

export async function fetchThread(walletA: string, walletB: string, limit = 50): Promise<DirectMessage[]> {
  try {
    const r = await fetch(`/api/messages/${encodeURIComponent(walletA)}/${encodeURIComponent(walletB)}?limit=${limit}`)
    const d = r.ok ? await r.json() : []
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

export async function sendMessage(from: string, to: string, body: string): Promise<DirectMessage> {
  const r = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, body }),
  })
  if (!r.ok) throw new Error('Message send failed')
  return r.json()
}

export async function markThreadRead(wallet: string, otherWallet: string): Promise<void> {
  await fetch('/api/messages/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, otherWallet }),
  })
}
