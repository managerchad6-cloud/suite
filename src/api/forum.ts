export const ADMIN_WALLET = 'VVCAdmin'

export interface ForumBoard {
  id: string
  category: 'platform' | 'community'
  name: string
  description: string
  icon: string
  sort_order: number
  thread_count: number
  post_count: number
  last_thread_id: string | null
  last_thread_title: string | null
  last_activity_at: string | null
  last_post_wallet: string | null
}

export interface ForumStats {
  thread_count: number
  reply_count: number
  member_count: number
}

export interface ForumThread {
  id: string
  title: string
  body: string
  wallet: string
  tags: string[]
  board_id: string
  is_pinned: boolean
  is_locked: boolean
  created_at: string
  last_activity_at: string
  reply_count: number
  like_count: number
  view_count: number
  your_like: boolean
  last_reply_wallet?: string | null
  last_reply_at?: string | null
  top_reply_body?: string | null
  top_reply_wallet?: string | null
  top_reply_at?: string | null
}

export interface ForumReply {
  id: string
  thread_id: string
  wallet: string
  body: string
  created_at: string
  like_count: number
  your_like: boolean
  parent_id: string | null
}

export interface ForumThreadDetail extends ForumThread {
  replies: ForumReply[]
}

export interface ForumMember {
  wallet: string
  reply_count: number
}

export interface ForumTopThread {
  id: string
  title: string
  reply_count: number
  like_count: number
  view_count: number
  last_activity_at: string
}

export async function fetchBoards(): Promise<ForumBoard[]> {
  try {
    const res = await fetch('/api/forum/boards')
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function fetchStats(): Promise<ForumStats | null> {
  try {
    const res = await fetch('/api/forum/stats')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function fetchThreads(
  page = 1,
  wallet?: string,
  sort: 'latest' | 'top' | 'unanswered' = 'latest',
  q?: string,
  boardId?: string,
): Promise<{ items: ForumThread[]; has_more: boolean }> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: '20', sort })
    if (wallet)  params.set('wallet', wallet)
    if (q)       params.set('q', q)
    if (boardId) params.set('board_id', boardId)
    const res = await fetch(`/api/forum/threads?${params}`)
    if (!res.ok) return { items: [], has_more: false }
    return res.json()
  } catch {
    return { items: [], has_more: false }
  }
}

export async function fetchThread(id: string, wallet?: string): Promise<ForumThreadDetail | null> {
  try {
    const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''
    const res = await fetch(`/api/forum/threads/${encodeURIComponent(id)}${q}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function createThread(
  wallet: string,
  title: string,
  body: string,
  tags: string[] = [],
  boardId = 'general',
): Promise<ForumThread> {
  const res = await fetch('/api/forum/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, title, body, tags, board_id: boardId }),
  })
  if (!res.ok) throw new Error('Failed to create thread')
  return res.json()
}

export async function postReply(
  threadId: string,
  wallet: string,
  body: string,
  parentId?: string | null,
): Promise<ForumReply> {
  const res = await fetch('/api/forum/replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, wallet, body, parent_id: parentId ?? null }),
  })
  if (!res.ok) throw new Error('Failed to post reply')
  return res.json()
}

export async function likeThread(id: string, wallet: string): Promise<{ like_count: number; your_like: boolean }> {
  const res = await fetch(`/api/forum/threads/${encodeURIComponent(id)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) throw new Error('Failed to like thread')
  return res.json()
}

export async function likeReply(id: string, wallet: string): Promise<{ like_count: number; your_like: boolean }> {
  const res = await fetch(`/api/forum/replies/${encodeURIComponent(id)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) throw new Error('Failed to like reply')
  return res.json()
}

export async function fetchTopMembers(boardId?: string): Promise<ForumMember[]> {
  try {
    const q = boardId ? `?board_id=${encodeURIComponent(boardId)}` : ''
    const res = await fetch(`/api/forum/top-members${q}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function fetchTopThreads(boardId?: string): Promise<ForumTopThread[]> {
  try {
    const q = boardId ? `?board_id=${encodeURIComponent(boardId)}` : ''
    const res = await fetch(`/api/forum/top-threads${q}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
