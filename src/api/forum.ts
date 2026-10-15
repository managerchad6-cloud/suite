import { api } from './client'

// Reading the forum is public (your_like is filled in for members); posting and liking act as
// the signed-in member.

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
  try { return await api('/api/forum/boards') } catch { return [] }
}

export async function fetchStats(): Promise<ForumStats | null> {
  try { return await api('/api/forum/stats') } catch { return null }
}

export async function fetchThreads(
  page = 1,
  sort: 'latest' | 'top' | 'unanswered' = 'latest',
  q?: string,
  boardId?: string,
): Promise<{ items: ForumThread[]; has_more: boolean }> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: '20', sort })
    if (q)       params.set('q', q)
    if (boardId) params.set('board_id', boardId)
    return await api(`/api/forum/threads?${params}`)
  } catch {
    return { items: [], has_more: false }
  }
}

export async function fetchThread(id: string): Promise<ForumThreadDetail | null> {
  try { return await api(`/api/forum/threads/${encodeURIComponent(id)}`) } catch { return null }
}

export function createThread(title: string, body: string, tags: string[] = [], boardId = 'general'): Promise<ForumThread> {
  return api('/api/forum/threads', { method: 'POST', body: { title, body, tags, board_id: boardId } })
}

export function postReply(threadId: string, body: string, parentId?: string | null): Promise<ForumReply> {
  return api('/api/forum/replies', { method: 'POST', body: { thread_id: threadId, body, parent_id: parentId ?? null } })
}

export function likeThread(id: string): Promise<{ like_count: number; your_like: boolean }> {
  return api(`/api/forum/threads/${encodeURIComponent(id)}/like`, { method: 'POST' })
}

export function likeReply(id: string): Promise<{ like_count: number; your_like: boolean }> {
  return api(`/api/forum/replies/${encodeURIComponent(id)}/like`, { method: 'POST' })
}

export async function fetchTopMembers(boardId?: string): Promise<ForumMember[]> {
  try { return await api(`/api/forum/top-members${boardId ? `?board_id=${encodeURIComponent(boardId)}` : ''}`) } catch { return [] }
}

export async function fetchTopThreads(boardId?: string): Promise<ForumTopThread[]> {
  try { return await api(`/api/forum/top-threads${boardId ? `?board_id=${encodeURIComponent(boardId)}` : ''}`) } catch { return [] }
}
