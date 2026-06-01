import { useEffect, useRef, useState, useCallback } from 'react'
import { truncateAddress } from '../wallet'
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
  address: string
  depth: number
  onLike: (id: string) => void
  onReply: (id: string, wallet: string) => void
  onDelete: (id: string) => void
}

function CommentRow({ comment, address, depth, onLike, onReply, onDelete }: CommentRowProps) {
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
            onClick={() => onLike(comment.id)}
          >
            {comment.your_like ? '❤️' : '🤍'} {comment.likes > 0 ? comment.likes : ''}
          </button>
          {depth === 0 && (
            <button className="cp-reply-btn" onClick={() => onReply(comment.id, comment.wallet)}>
              Reply
            </button>
          )}
          {comment.wallet === address && (
            <button className="cp-delete-btn" onClick={() => onDelete(comment.id)}>Delete</button>
          )}
        </div>
        {comment.replies.map(r => (
          <CommentRow key={r.id} comment={r} address={address} depth={depth + 1} onLike={onLike} onReply={onReply} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

interface Props {
  item: UnifiedMemeItem
  address: string
  onClose: () => void
}

export function CommentsPanel({ item, address, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading,  setLoading]  = useState(true)
  const [input,    setInput]    = useState('')
  const [replyTo,  setReplyTo]  = useState<{ id: string; wallet: string } | null>(null)
  const [posting,  setPosting]  = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/comments/${encodeURIComponent(item.type)}/${encodeURIComponent(item.sourceId)}?wallet=${encodeURIComponent(address)}&limit=100`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setComments(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item.type, item.sourceId, address])

  useEffect(() => { load() }, [load])

  async function post() {
    const body = input.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meme_id: item.sourceId, meme_source: item.type,
          wallet: address, body,
          parent_id: replyTo?.id ?? null,
        }),
      })
      if (!res.ok) return
      const newComment: Comment = await res.json()
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
    const res = await fetch(`/api/comments/${id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address }),
    })
    if (!res.ok) return
    const { likes, your_like } = await res.json()
    const update = (c: Comment): Comment => c.id === id
      ? { ...c, likes, your_like }
      : { ...c, replies: c.replies.map(update) }
    setComments(prev => prev.map(update))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/comments/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address }),
    })
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
            address={address}
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
        <div className="cp-compose-row">
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
        </div>
      </div>
    </div>
  )
}
