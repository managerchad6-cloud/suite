import { useState, useEffect, useRef } from 'react'
import { fetchComments, postComment, likeComment, type Comment } from '../api/comments'
import { truncateAddress } from '../wallet'
import { MemberGate, useMemberGate } from '../identity/gate'
import { bestImage, getPublicProfile, type PublicProfile } from '../identity/api'

type CachedProfile = PublicProfile | null
const getProfile = getPublicProfile

type CommentNode = Comment & { replies: CommentNode[] }

function buildTree(flat: Comment[]): CommentNode[] {
  const map = new Map<number, CommentNode>()
  const roots: CommentNode[] = []
  for (const c of flat) map.set(c.id, { ...c, replies: [] })
  for (const c of flat) {
    const node = map.get(c.id)!
    if (c.parent_id != null && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function getLikedKey(wallet: string, commentId: number) {
  return `vvc_liked_comment_v1_${wallet}_${commentId}`
}

function CommentRow({ comment, onOpenProfile, onReply }: {
  comment: Comment
  onOpenProfile?: (wallet: string) => void
  onReply?: () => void
}) {
  const gate = useMemberGate()
  const address = gate.wallet
  const [profile, setProfile] = useState<CachedProfile | undefined>(undefined)
  const [liked, setLiked]     = useState(() =>
    address ? !!localStorage.getItem(getLikedKey(address, comment.id)) : false
  )
  const [likeCount, setLikeCount] = useState(comment.like_count ?? 0)
  const [liking, setLiking]       = useState(false)

  useEffect(() => { getProfile(comment.wallet).then(setProfile) }, [comment.wallet])

  const src = profile ? bestImage(profile) : null

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!address || liked || liking) return
    setLiking(true)
    try {
      const result = await likeComment(comment.id, address)
      localStorage.setItem(getLikedKey(address, comment.id), '1')
      setLiked(true)
      setLikeCount(result.like_count)
    } catch { /* already liked or failed */ } finally { setLiking(false) }
  }

  return (
    <div className="md-comment">
      <div
        className={`md-comment-avatar ${onOpenProfile ? 'md-comment-avatar--clickable' : ''}`}
        onClick={() => onOpenProfile?.(comment.wallet)}
      >
        {src
          ? <img src={src} alt="" className="md-comment-img" />
          : <div className="md-comment-placeholder">{comment.wallet.slice(0, 2).toUpperCase()}</div>
        }
      </div>
      <div className="md-comment-body">
        <div className="md-comment-meta">
          <span
            className={`md-comment-wallet ${onOpenProfile ? 'md-comment-wallet--clickable' : ''}`}
            onClick={() => onOpenProfile?.(comment.wallet)}
          >{truncateAddress(comment.wallet)}</span>
          <span className="md-comment-time">
            {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <p className="md-comment-text">{comment.text}</p>
        {onReply && (
          <button className="md-comment-reply-btn" {...gate.lockProps('reply')} onClick={gate.guard(onReply, 'reply')}>Reply</button>
        )}
      </div>
      <button
        className={`md-comment-like ${liked ? 'md-comment-like--liked' : ''}`}
        {...gate.lockProps('like')}
        onClick={e => { e.stopPropagation(); gate.guard(handleLike, 'like')(e) }}
        disabled={!gate.locked && (liked || liking)}
        title={gate.locked ? undefined : liked ? 'Liked' : 'Like'}
      >
        <span className="md-comment-like-icon">♥</span>
        {likeCount > 0 && <span className="md-comment-like-count">{likeCount}</span>}
      </button>
    </div>
  )
}

function CommentThread({ node, jobId, depth = 0, onOpenProfile, onReplyPosted }: {
  node: CommentNode
  jobId: string
  depth?: number
  onOpenProfile?: (wallet: string) => void
  onReplyPosted: () => void
}) {
  const { wallet: address } = useMemberGate()
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting] = useState(false)

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !replyText.trim() || posting) return
    setPosting(true)
    try {
      await postComment(jobId, address, replyText.trim(), node.id)
      setReplyText('')
      setReplying(false)
      onReplyPosted()
    } catch {} finally { setPosting(false) }
  }

  return (
    <div className={`md-thread${depth > 0 ? ' md-thread--nested' : ''}`}>
      <CommentRow
        comment={node}
        onOpenProfile={onOpenProfile}
        onReply={() => setReplying(r => !r)}
      />
      {replying && (
        <form className="md-reply-form" onSubmit={handleReply}>
          <input
            className="md-comment-input"
            placeholder={`Replying to ${node.wallet.slice(0, 8)}…`}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            maxLength={280}
            autoFocus
          />
          <div className="md-reply-actions">
            <button type="button" className="md-reply-cancel" onClick={() => { setReplying(false); setReplyText('') }}>Cancel</button>
            <button className="md-comment-submit" disabled={!replyText.trim() || posting}>{posting ? '…' : 'Reply'}</button>
          </div>
        </form>
      )}
      {node.replies.length > 0 && (
        <div className="md-thread-replies">
          {node.replies.map(r => (
            <CommentThread
              key={r.id}
              node={r}
              jobId={jobId}
              depth={Math.min(depth + 1, 3)}
              onOpenProfile={onOpenProfile}
              onReplyPosted={onReplyPosted}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  jobId: string
  onOpenProfile?: (wallet: string) => void
}

export function CommentSection({ jobId, onOpenProfile }: Props) {
  const { wallet: address } = useMemberGate()
  const [comments, setComments]           = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentText, setCommentText]     = useState('')
  const [posting, setPosting]             = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setComments([])
    setCommentsLoading(true)
    fetchComments(jobId)
      .then(setComments)
      .finally(() => setCommentsLoading(false))
  }, [jobId])

  const reload = () => fetchComments(jobId).then(setComments)

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !commentText.trim() || posting) return
    setPosting(true)
    try {
      await postComment(jobId, address, commentText.trim())
      setCommentText('')
      await reload()
    } catch { /* ignore */ } finally { setPosting(false) }
  }

  return (
    <div className="md-comments">
      <h3 className="md-comments-title">
        Replies {!commentsLoading && <span className="md-comments-count">({comments.length})</span>}
      </h3>

      <MemberGate reason="reply">
        <form className="md-comment-form" onSubmit={handleComment}>
          <input
            ref={inputRef}
            className="md-comment-input"
            placeholder="Leave a reply…"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            maxLength={280}
          />
          <button className="md-comment-submit" disabled={!commentText.trim() || posting}>
            {posting ? '…' : 'Reply'}
          </button>
        </form>
      </MemberGate>

      {commentsLoading ? (
        <div style={{ color: '#444', fontSize: 13, padding: '24px 0' }}>Loading…</div>
      ) : comments.length === 0 ? (
        <p className="md-no-comments">No replies yet. Be the first.</p>
      ) : (
        <div className="md-comment-list">
          {buildTree(comments).map(node => (
            <CommentThread
              key={node.id}
              node={node}
              jobId={jobId}
              onOpenProfile={onOpenProfile}
              onReplyPosted={reload}
            />
          ))}
        </div>
      )}
    </div>
  )
}
