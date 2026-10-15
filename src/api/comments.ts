export interface Comment {
  id: string
  wallet: string
  body: string
  created_at: string
  likes: number
  parent_id: string | null
  your_like: boolean
  replies: Comment[]
}

export async function fetchComments(source: string, memeId: string, wallet?: string): Promise<Comment[]> {
  try {
    const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''
    const res = await fetch(`/api/comments/${encodeURIComponent(source)}/${encodeURIComponent(memeId)}${q}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.items ?? []
  } catch {
    return []
  }
}

export async function postComment(
  memeId: string,
  source: string,
  wallet: string,
  body: string,
  parentId?: string | null,
): Promise<Comment> {
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meme_id: memeId, meme_source: source, wallet, body, parent_id: parentId ?? null }),
  })
  if (!res.ok) throw new Error('Failed to post comment')
  return res.json()
}

export async function likeComment(commentId: string, wallet: string): Promise<{ likes: number }> {
  const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) throw new Error('Already liked or failed')
  return res.json()
}
