import { useEffect, useRef, useState, useCallback } from 'react'
import { truncateAddress } from '../wallet'
import { api } from '../api/client'
import { MemberGate, useMemberGate } from '../identity/gate'
import type { UnifiedMemeItem } from '../types/unified'
import './CommentsPanel.css'

interface Comment {
  id: string
  meme_id: string
  meme_source: string
  wallet: string
  parent_id: string | null
  body: string
  likes: number
  your_like: boolean
  created_at: string
  avatar?: string | null
  replies: Comment[]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

interface CommentRowProps {
  comment: Comment
  wallet: string | null
  depth: number
  onLike: (id: string) => void
  onReply: (id: string, wallet: string) => void
  onDelete: (id: string) => void
}

function CommentRow({ comment, wallet, depth, onLike, onReply, onDelete }: CommentRowProps) {
  const gate = useMemberGate()
  return (
    <div className={`cp-comment ${depth > 0 ? 'cp-comment--reply' : ''}`}>
      <div className="cp-comment-avatar">
        {comment.avatar
          ? <img src={comment.avatar} alt="" className="cp-avatar-img" />
          : <div className="cp-avatar-placeholder">{comment.wallet.slice(0, 1).toUpperCase()}</div>
        }
      </div>
      <div className="cp-comment-body">
        <div className="cp-comment-meta">
          <span className="cp-comment-wallet">{truncateAddress(comment.wallet)}</span>
          <span className="cp-comment-time">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="cp-comment-text">{comment.body}</p>
        <div className="cp-comment-actions">
          <button
            className={`cp-like-btn ${comment.your_like ? 'active' : ''}`}
            {...gate.lockProps('like')}
            onClick={gate.guard(() => onLike(comment.id), 'like')}
          >
            {comment.your_like ? '❤️' : '🤍'} {comment.likes > 0 ? comment.likes : ''}
          </button>
          {depth === 0 && (
            <button className="cp-reply-btn" {...gate.lockProps('reply')} onClick={gate.guard(() => onReply(comment.id, comment.wallet), 'reply')}>
              Reply
            </button>
          )}
          {wallet && comment.wallet === wallet && (
            <button className="cp-delete-btn" onClick={() => onDelete(comment.id)}>Delete</button>
          )}
        </div>
        {comment.replies.map(r => (
          <CommentRow key={r.id} comment={r} wallet={wallet} depth={depth + 1} onLike={onLike} onReply={onReply} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

interface Props {
  item: UnifiedMemeItem
  onClose: () => void
}

export function CommentsPanel({ item, onClose }: Props) {
  const { wallet } = useMemberGate()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading,  setLoading]  = useState(true)
  const [input,    setInput]    = useState('')
  const [replyTo,  setReplyTo]  = useState<{ id: string; wallet: string } | null>(null)
  const [posting,  setPosting]  = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    // your_like comes from the session when a member is signed in
    api<{ items: Comment[] }>(`/api/comments/${encodeURIComponent(item.type)}/${encodeURIComponent(item.sourceId)}?limit=100`)
      .then(d => setComments(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item.type, item.sourceId, wallet])

  useEffect(() => { load() }, [load])

  async function post() {
    const body = input.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const newComment = await api<Comment>('/api/comments', {
        method: 'POST',
        body: { meme_id: item.sourceId, meme_source: item.type, body, parent_id: replyTo?.id ?? null },
      }).catch(() => null)
      if (!newComment) return
      if (replyTo) {
        setComments(prev => prev.map(c =>
          c.id === replyTo.id ? { ...c, replies: [...c.replies, newComment] } : c
        ))
      } else {
        setComments(prev => [newComment, ...prev])
      }
      setInput('')
      setReplyTo(null)
    } finally { setPosting(false) }
  }

  async function handleLike(id: string) {
    const r = await api<{ likes: number; your_like: boolean }>(`/api/comments/${encodeURIComponent(id)}/like`, { method: 'POST' }).catch(() => null)
    if (!r) return
    const { likes, your_like } = r
    const update = (c: Comment): Comment => c.id === id
      ? { ...c, likes, your_like }
      : { ...c, replies: c.replies.map(update) }
    setComments(prev => prev.map(update))
  }

  async function handleDelete(id: string) {
    await api(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    const remove = (list: Comment[]): Comment[] =>
      list.filter(c => c.id !== id).map(c => ({ ...c, replies: remove(c.replies) }))
    setComments(prev => remove(prev))
  }

  function startReply(id: string, wallet: string) {
    setReplyTo({ id, wallet })
    setInput(`@${truncateAddress(wallet)} `)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const total = comments.reduce((n, c) => n + 1 + c.replies.length, 0)

  return (
    <div className="cp-panel">
      <div className="cp-header">
        <span className="cp-title">Comments {total > 0 && <span className="cp-count">{total}</span>}</span>
        <button className="cp-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="cp-list">
        {loading ? (
          <p className="cp-empty">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="cp-empty">No comments yet. Be first!</p>
        ) : comments.map(c => (
          <CommentRow
            key={c.id}
            comment={c}
            wallet={wallet}
            depth={0}
            onLike={handleLike}
            onReply={startReply}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <div className="cp-compose">
        {replyTo && (
          <div className="cp-reply-label">
            Replying to {truncateAddress(replyTo.wallet)}
            <button className="cp-cancel-reply" onClick={() => { setReplyTo(null); setInput('') }}>✕</button>
          </div>
        )}
        <MemberGate reason="comment" className="cp-compose-row">
          <textarea
            ref={inputRef}
            className="cp-input"
            placeholder="Add a comment…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post() } }}
            rows={1}
          />
          <button className="cp-post-btn" onClick={post} disabled={!input.trim() || posting}>
            {posting ? '…' : '↑'}
          </button>
        </MemberGate>
      </div>
    </div>
  )
}
