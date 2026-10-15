import { api } from './client'

// Comments live in memestudio-backend (/api/comments), keyed by the meme's source and id.
// (The old /comments endpoint on the retired quiz server is gone.)

export type CommentSource = 'factory' | 'studio' | 'reddit'

export interface Comment {
  id: string
  wallet: string
  text: string
  createdAt: string
  like_count: number
  parent_id: string | null
  your_like: boolean
}

interface ServerComment {
  id: string
  wallet: string
  body: string
  created_at: string
  likes: number
  parent_id: string | null
  your_like: boolean
  replies: ServerComment[]
}

const toComment = (c: ServerComment): Comment => ({
  id: c.id, wallet: c.wallet, text: c.body, createdAt: c.created_at,
  like_count: c.likes ?? 0, parent_id: c.parent_id, your_like: !!c.your_like,
})

/** Flat list (top-level + replies); your_like is set when a member is signed in. */
export async function fetchComments(source: CommentSource, memeId: string): Promise<Comment[]> {
  try {
    const { items } = await api<{ items: ServerComment[] }>(`/api/comments/${source}/${encodeURIComponent(memeId)}?limit=100`)
    return items.flatMap(c => [toComment(c), ...c.replies.map(toComment)])
  } catch {
    return []
  }
}

export async function postComment(source: CommentSource, memeId: string, text: string, parentId?: string): Promise<void> {
  await api('/api/comments', { method: 'POST', body: { meme_id: memeId, meme_source: source, body: text, parent_id: parentId ?? null } })
}

/** Toggle your like. */
export async function likeComment(commentId: string): Promise<{ like_count: number; your_like: boolean }> {
  const r = await api<{ likes: number; your_like: boolean }>(`/api/comments/${encodeURIComponent(commentId)}/like`, { method: 'POST' })
  return { like_count: r.likes, your_like: r.your_like }
}
