export interface Comment {
  id: number
  job_id: string
  wallet: string
  text: string
  createdAt: string
  like_count: number
  parent_id: number | null
}

export async function fetchComments(job_id: string): Promise<Comment[]> {
  try {
    const res = await fetch(`/comments/${encodeURIComponent(job_id)}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function postComment(job_id: string, wallet: string, text: string, parentId?: number): Promise<void> {
  const res = await fetch('/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id, wallet, text, parent_id: parentId ?? null }),
  })
  if (!res.ok) throw new Error('Failed to post comment')
}

export async function likeComment(commentId: number, wallet: string): Promise<{ like_count: number }> {
  const res = await fetch(`/comments/${commentId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) throw new Error('Already liked or failed')
  return res.json()
}
