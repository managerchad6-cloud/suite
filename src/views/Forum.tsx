import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import MDEditor, { commands, type ICommand, type TextAreaTextApi } from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { truncateAddress } from '@mf/wallet'
import { UserChip } from '../components/UserChip'
import {
  fetchBoards, fetchStats, fetchThreads, fetchThread, createThread, postReply,
  likeThread, likeReply, fetchTopMembers, fetchTopThreads,
  ADMIN_WALLET,
  type ForumBoard, type ForumStats, type ForumThread, type ForumReply, type ForumThreadDetail,
  type ForumMember, type ForumTopThread,
} from '../api/forum'
import '../forum.css'

type SortMode = 'latest' | 'top' | 'unanswered'

const ALL_TAGS = ['general', 'factory', 'studio', 'live', 'vote', 'cast', 'help', 'feedback', 'offtopic'] as const

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function displayWallet(wallet: string): string {
  if (wallet === ADMIN_WALLET) return 'VVC Admin'
  return truncateAddress(wallet)
}

function isAdmin(wallet: string): boolean {
  return wallet === ADMIN_WALLET
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/\n+/g, ' ')
    .trim()
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface ForumProps {
  address: string
  view?: 'index' | 'board' | 'thread'
  boardId?: string
  threadId?: string
  onOpenBoard?: (id: string) => void
  onOpenThread?: (id: string) => void
  onBack?: () => void
}

export function Forum({ address, view = 'index', boardId, threadId, onOpenBoard, onOpenThread, onBack }: ForumProps) {
  if (view === 'thread' && threadId) {
    return <ThreadDetail address={address} threadId={threadId} onBack={onBack!} />
  }
  if (view === 'board' && boardId) {
    return <BoardView address={address} boardId={boardId} onOpenThread={onOpenThread!} onBack={onBack!} />
  }
  return <ForumIndex address={address} onOpenBoard={onOpenBoard!} />
}

// ─── Forum Index (Board List) ─────────────────────────────────────────────────

function ForumIndex({ address, onOpenBoard }: { address: string; onOpenBoard: (id: string) => void }) {
  const [boards, setBoards] = useState<ForumBoard[]>([])
  const [stats,  setStats]  = useState<ForumStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchBoards(), fetchStats()]).then(([b, s]) => {
      setBoards(b)
      setStats(s)
      setLoading(false)
    })
  }, [])

  const platform  = boards.filter(b => b.category === 'platform')
  const community = boards.filter(b => b.category === 'community')

  return (
    <div className="forum-shell forum-index-shell">
      <div className="forum-hero">
        <div className="forum-hero-left">
          <h1 className="forum-hero-title">COMMUNITY FORUM</h1>
          {stats && (
            <div className="forum-hero-stats">
              <span>{stats.thread_count.toLocaleString()} threads</span>
              <span className="fhs-dot">·</span>
              <span>{stats.reply_count.toLocaleString()} replies</span>
              <span className="fhs-dot">·</span>
              <span>{stats.member_count.toLocaleString()} members</span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="forum-state">Loading…</div>
      ) : (
        <div className="forum-index-content">
          <BoardCategory label="PLATFORM" boards={platform} onOpenBoard={onOpenBoard} />
          <BoardCategory label="COMMUNITY" boards={community} onOpenBoard={onOpenBoard} />
        </div>
      )}
    </div>
  )
}

function BoardCategory({ label, boards, onOpenBoard }: {
  label: string; boards: ForumBoard[]; onOpenBoard: (id: string) => void
}) {
  return (
    <div className="board-category">
      <div className="board-category-header">{label}</div>
      <div className="board-list">
        {boards.map(b => <BoardRow key={b.id} board={b} onClick={() => onOpenBoard(b.id)} />)}
      </div>
    </div>
  )
}

function BoardRow({ board, onClick }: { board: ForumBoard; onClick: () => void }) {
  return (
    <div className="board-row" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="board-row-icon">{board.icon}</div>
      <div className="board-row-info">
        <div className="board-row-name">{board.name}</div>
        <div className="board-row-desc">{board.description}</div>
      </div>
      <div className="board-row-stats">
        <div className="board-stat-item">
          <span className="board-stat-num">{board.post_count.toLocaleString()}</span>
          <span className="board-stat-label">Posts</span>
        </div>
        <div className="board-stat-item">
          <span className="board-stat-num">{board.thread_count.toLocaleString()}</span>
          <span className="board-stat-label">Topics</span>
        </div>
      </div>
      <div className="board-row-lastpost">
        {board.last_thread_id ? (
          <>
            <div className="board-lp-who">
              {board.last_post_wallet
                ? <UserChip wallet={board.last_post_wallet} size="sm" />
                : '—'}
            </div>
            <div className="board-lp-title" title={board.last_thread_title ?? ''}>
              {board.last_thread_title}
            </div>
            <div className="board-lp-time">
              {board.last_activity_at ? timeAgo(board.last_activity_at) : ''}
            </div>
          </>
        ) : (
          <span className="board-lp-empty">No posts yet</span>
        )}
      </div>
    </div>
  )
}

// ─── Board View (Thread List) ─────────────────────────────────────────────────

function BoardView({ address, boardId, onOpenThread, onBack }: {
  address: string; boardId: string; onOpenThread: (id: string) => void; onBack: () => void
}) {
  const [board,    setBoard]    = useState<ForumBoard | null>(null)
  const [threads,  setThreads]  = useState<ForumThread[]>([])
  const [sort,     setSort]     = useState<SortMode>('latest')
  const [page,     setPage]     = useState(1)
  const [hasMore,  setHasMore]  = useState(true)
  const [loading,  setLoading]  = useState(true)
  const [composing, setComposing] = useState(false)
  const [search,   setSearch]   = useState('')
  const [searchQ,  setSearchQ]  = useState('')
  const [members,  setMembers]  = useState<ForumMember[]>([])
  const [hotThreads, setHotThreads] = useState<ForumTopThread[]>([])

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchBoards().then(bs => setBoard(bs.find(b => b.id === boardId) ?? null))
    fetchTopMembers(boardId).then(setMembers)
    fetchTopThreads(boardId).then(setHotThreads)
  }, [boardId])

  const load = useCallback(async (nextSort: SortMode, nextPage: number, append: boolean, q: string) => {
    setLoading(true)
    const result = await fetchThreads(nextPage, address, nextSort, q || undefined, boardId)
    setThreads(prev => append ? [...prev, ...result.items] : result.items)
    setHasMore(result.has_more)
    setLoading(false)
  }, [address, boardId])

  useEffect(() => { setPage(1); load(sort, 1, false, searchQ) }, [sort, load, searchQ])

  const loadMore = () => { const next = page + 1; setPage(next); load(sort, next, true, searchQ) }

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchQ(val), 400)
  }

  const handleCreated = (t: ForumThread) => {
    setThreads(prev => [t, ...prev])
    setComposing(false)
    if (board) setBoard({ ...board, thread_count: board.thread_count + 1 })
  }

  const handleLike = (id: string, r: { like_count: number; your_like: boolean }) => {
    setThreads(prev => prev.map(x => x.id === id ? { ...x, like_count: r.like_count, your_like: r.your_like } : x))
  }

  return (
    <div className="forum-shell">
      <div className="forum-hero forum-hero--board">
        <div className="forum-hero-left">
          <nav className="forum-breadcrumb forum-breadcrumb--hero">
            <button className="forum-back-btn" onClick={onBack}>← Forum</button>
            <span className="forum-breadcrumb-sep">/</span>
            <span className="forum-breadcrumb-board">
              {board ? `${board.icon} ${board.name}` : '…'}
            </span>
          </nav>
          {board && <p className="forum-board-desc">{board.description}</p>}
        </div>
        <button className="forum-new-btn" onClick={() => setComposing(true)}>+ New Thread</button>
      </div>

      <div className="forum-search-row">
        <div className="forum-search-wrap">
          <span className="forum-search-icon">⌕</span>
          <input className="forum-search-input" placeholder="Search threads…" value={search}
            onChange={e => handleSearchChange(e.target.value)} />
          {search && <button className="forum-search-clear" onClick={() => { setSearch(''); setSearchQ('') }}>✕</button>}
        </div>
      </div>

      <div className="forum-body">
        <div className="forum-main">
          <div className="forum-tabs">
            {(['latest', 'top', 'unanswered'] as SortMode[]).map(s => (
              <button key={s} className={`forum-tab ${sort === s ? 'forum-tab--active' : ''}`} onClick={() => setSort(s)}>
                {s === 'latest' ? 'Latest' : s === 'top' ? 'Top' : 'Unanswered'}
              </button>
            ))}
          </div>

          {loading && threads.length === 0 ? (
            <div className="forum-state">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="forum-state">
              {searchQ ? `No results for "${searchQ}"` : 'No threads yet — '}
              {!searchQ && <button className="forum-state-link" onClick={() => setComposing(true)}>start one</button>}
            </div>
          ) : (
            <div className="forum-list">
              {threads.map(t => (
                <ThreadCard key={t.id} thread={t} address={address}
                  onClick={() => onOpenThread(t.id)}
                  onLike={r => handleLike(t.id, r)}
                />
              ))}
            </div>
          )}

          {hasMore && !loading && <button className="forum-load-more" onClick={loadMore}>Load more</button>}
          {loading && threads.length > 0 && <div className="forum-state" style={{ padding: '12px 0' }}>Loading…</div>}
        </div>

        <aside className="forum-sidebar">
          <ForumSidebar members={members} hotThreads={hotThreads} onOpenThread={onOpenThread} />
        </aside>
      </div>

      {composing && (
        <ComposeModal address={address} defaultBoardId={boardId}
          onCreated={handleCreated} onClose={() => setComposing(false)} />
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function ForumSidebar({ members, hotThreads, onOpenThread }: {
  members: ForumMember[]; hotThreads: ForumTopThread[]; onOpenThread: (id: string) => void
}) {
  return (
    <>
      <div className="sidebar-panel">
        <div className="sidebar-panel-title">Active Members</div>
        {members.length === 0 ? (
          <p className="sidebar-empty">No activity yet</p>
        ) : (
          <ul className="sidebar-member-list">
            {members.map((m, i) => (
              <li key={m.wallet} className="sidebar-member">
                <span className="sidebar-member-rank">#{i + 1}</span>
                <UserChip wallet={m.wallet} size="sm" className="sidebar-member-chip" />
                <span className="sidebar-member-count">{m.reply_count} <span className="sidebar-meta">replies</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sidebar-panel">
        <div className="sidebar-panel-title">Hot Threads</div>
        {hotThreads.length === 0 ? (
          <p className="sidebar-empty">No threads yet</p>
        ) : (
          <ul className="sidebar-hot-list">
            {hotThreads.map(t => (
              <li key={t.id} className="sidebar-hot-item" onClick={() => onOpenThread(t.id)}
                role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onOpenThread(t.id)}
              >
                <span className="sidebar-hot-title">{t.title}</span>
                <span className="sidebar-hot-stats">
                  <span>{t.reply_count} replies</span>
                  <span className="fhs-dot">·</span>
                  <span>{t.view_count} views</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

// ─── Thread Card ──────────────────────────────────────────────────────────────

function ThreadCard({ thread, address, onClick, onLike }: {
  thread: ForumThread; address: string
  onClick: () => void; onLike: (r: { like_count: number; your_like: boolean }) => void
}) {
  const [liking, setLiking] = useState(false)

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (liking) return
    setLiking(true)
    try { onLike(await likeThread(thread.id, address)) } catch {} finally { setLiking(false) }
  }

  const preview = stripMarkdown(thread.body).slice(0, 120) + (thread.body.length > 120 ? '…' : '')
  const topReply = thread.top_reply_body
    ? stripMarkdown(thread.top_reply_body).slice(0, 90) + (thread.top_reply_body.length > 90 ? '…' : '')
    : null

  return (
    <div className={`ftc ${thread.is_pinned ? 'ftc--pinned' : ''}`}
      onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="ftc-inner">
        <div className="ftc-title-row">
          {thread.is_pinned && <span className="ftc-pin-badge">📌</span>}
          {thread.is_locked && <span className="ftc-lock-badge">🔒</span>}
          <h3 className="ftc-title">{thread.title}</h3>
        </div>

        {thread.tags && thread.tags.length > 0 && (
          <div className="ftc-tags">
            {thread.tags.map(tag => (
              <span key={tag} className={`ftc-tag ftc-tag--${tag}`}>{tag}</span>
            ))}
          </div>
        )}

        <p className="ftc-preview">{preview}</p>

        {topReply && (
          <div className="ftc-top-reply" onClick={e => e.stopPropagation()}>
            <span className="ftc-top-reply-label">Top reply</span>
            <span className="ftc-top-reply-author">
              {thread.top_reply_wallet
                ? <><UserChip wallet={thread.top_reply_wallet} size="sm" />:</>
                : null}
            </span>
            <span className="ftc-top-reply-text">{topReply}</span>
          </div>
        )}

        <div className="ftc-footer">
          <div className="ftc-author-info">
            <span className={`ftc-author ${isAdmin(thread.wallet) ? 'ftc-author--admin' : ''}`}>
              <UserChip wallet={thread.wallet} size="sm" />
            </span>
            <span className="ftc-meta-dot">·</span>
            <span className="ftc-time">{timeAgo(thread.created_at)}</span>
            {thread.last_reply_at && (
              <>
                <span className="ftc-meta-dot">·</span>
                <span className="ftc-last-reply">last reply {timeAgo(thread.last_reply_at)}</span>
              </>
            )}
          </div>
          <div className="ftc-stats" onClick={e => e.stopPropagation()}>
            <span className="ftc-stat">
              <span className="ftc-stat-num">{thread.reply_count}</span>
              <span className="ftc-stat-label">replies</span>
            </span>
            <span className="ftc-stat">
              <span className="ftc-stat-num">{thread.view_count}</span>
              <span className="ftc-stat-label">views</span>
            </span>
            <button className={`ftc-like ${thread.your_like ? 'ftc-like--active' : ''}`}
              onClick={handleLike} disabled={liking}>
              <span>♥</span><span>{thread.like_count}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Image helpers ────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target!.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Forum Editor (MDEditor with custom image command) ────────────────────────

function ForumEditor({ value, onChange, height = 400, preview = 'live' }: {
  value: string
  onChange: (v: string) => void
  height?: number
  preview?: 'live' | 'edit' | 'preview'
}) {
  const [showImageModal, setShowImageModal] = useState(false)
  const textApiRef = useRef<TextAreaTextApi | null>(null)

  const imageCommand = useMemo<ICommand>(() => ({
    name: 'image',
    keyCommand: 'image',
    buttonProps: { 'aria-label': 'Insert image', title: 'Insert image' },
    icon: (
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <path d="M14.5 2h-13A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2zm0 1a.5.5 0 0 1 .5.5v5.793l-2.146-2.147a.5.5 0 0 0-.708 0L9 10.293 6.354 7.646a.5.5 0 0 0-.708 0L1.5 11.793V3.5a.5.5 0 0 1 .5-.5h12.5zM5 6.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
      </svg>
    ),
    execute: (_state, api) => {
      textApiRef.current = api
      setShowImageModal(true)
    },
  }), [])

  const customCommands = useMemo(
    () => commands.getCommands().map(c => (c as ICommand).name === 'image' ? imageCommand : c),
    [imageCommand],
  )

  const handleImageInsert = (markdown: string) => {
    textApiRef.current?.replaceSelection(markdown)
    setShowImageModal(false)
  }

  return (
    <>
      <div className="forum-editor-wrap" data-color-mode="dark">
        <MDEditor
          value={value}
          onChange={v => onChange(v ?? '')}
          height={height}
          preview={preview}
          visibleDragbar={false}
          commands={customCommands}
        />
      </div>
      {showImageModal && (
        <ImageInsertModal onInsert={handleImageInsert} onClose={() => setShowImageModal(false)} />
      )}
    </>
  )
}

// ─── Image Insert Modal ───────────────────────────────────────────────────────

const SIZE_OPTIONS = [
  { label: 'S', value: '240' },
  { label: 'M', value: '480' },
  { label: 'L', value: '720' },
  { label: 'Full', value: '100%' },
] as const

const ALIGN_OPTIONS = [
  { label: '←', value: 'left' },
  { label: '⊡', value: 'center' },
  { label: '→', value: 'right' },
] as const

function ImageInsertModal({ onInsert, onClose }: {
  onInsert: (markdown: string) => void
  onClose: () => void
}) {
  const [tab,       setTab]       = useState<'upload' | 'url'>('upload')
  const [file,      setFile]      = useState<File | null>(null)
  const [preview,   setPreview]   = useState('')
  const [urlInput,  setUrlInput]  = useState('')
  const [alt,       setAlt]       = useState('')
  const [size,      setSize]      = useState('480')
  const [align,     setAlign]     = useState('center')
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const previewSrc = tab === 'url' ? urlInput : preview
  const canInsert  = tab === 'url' ? !!urlInput.trim() : !!file

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (f.size > 10 * 1024 * 1024) { setError('Image must be under 10 MB.'); return }
    setError('')
    setFile(f)
    fileToDataUrl(f).then(setPreview)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleInsert = async () => {
    setError('')
    let finalUrl = urlInput.trim()

    if (tab === 'upload' && file) {
      setUploading(true)
      try {
        const dataUrl = await fileToDataUrl(file)
        const res = await fetch('/api/forum/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataUrl, name: file.name }),
        })
        if (!res.ok) throw new Error('Upload failed')
        const json = await res.json()
        finalUrl = json.url
      } catch {
        setError('Upload failed. Please try again.')
        setUploading(false)
        return
      }
      setUploading(false)
    }

    const altText   = alt.trim() || 'image'
    const sizeAttr  = size === '100%' ? 'style="width:100%;display:block"' : `width="${size}"`
    const marginAttr = align === 'center' ? ' style="display:block;margin:8px auto"'
                     : align === 'right'  ? ' style="float:right;margin:0 0 8px 16px"'
                     : ' style="display:block;margin:8px 0"'
    const html = size === '100%'
      ? `\n<img src="${finalUrl}" alt="${altText}" ${sizeAttr} />\n`
      : `\n<img src="${finalUrl}" alt="${altText}" width="${size}"${marginAttr} />\n`

    onInsert(html)
  }

  return (
    <div className="img-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="img-modal">
        <div className="img-modal-header">
          <h3 className="img-modal-title">Insert Image</h3>
          <button className="forum-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="img-modal-tabs">
          <button className={`img-tab ${tab === 'upload' ? 'img-tab--active' : ''}`} onClick={() => setTab('upload')}>Upload File</button>
          <button className={`img-tab ${tab === 'url'    ? 'img-tab--active' : ''}`} onClick={() => setTab('url')}>From URL</button>
        </div>

        {tab === 'upload' ? (
          <div
            className={`img-dropzone ${dragging ? 'img-dropzone--drag' : ''} ${file ? 'img-dropzone--filled' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
          >
            {file ? (
              <div className="img-preview-wrap">
                <img src={preview} className="img-preview" alt="preview" />
                <button className="img-remove-btn" onClick={e => { e.stopPropagation(); setFile(null); setPreview('') }}>✕</button>
              </div>
            ) : (
              <div className="img-dropzone-placeholder">
                <span className="img-dropzone-icon">⬆</span>
                <span className="img-dropzone-text">Drag & drop or click to browse</span>
                <span className="img-dropzone-hint">PNG · JPG · GIF · WEBP · max 10 MB</span>
              </div>
            )}
          </div>
        ) : (
          <input className="forum-input" placeholder="https://example.com/image.png"
            value={urlInput} onChange={e => setUrlInput(e.target.value)} />
        )}

        {previewSrc && (
          <div className="img-live-preview">
            <img src={previewSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: '140px', borderRadius: 4 }} />
          </div>
        )}

        <div className="img-options">
          <div className="img-option-group">
            <label className="img-option-label">Alt text</label>
            <input className="forum-input forum-input--sm" placeholder="Describe the image…"
              value={alt} onChange={e => setAlt(e.target.value)} />
          </div>
          <div className="img-option-row">
            <div className="img-option-group">
              <label className="img-option-label">Size</label>
              <div className="img-btn-group">
                {SIZE_OPTIONS.map(opt => (
                  <button key={opt.value}
                    className={`img-opt-btn ${size === opt.value ? 'img-opt-btn--active' : ''}`}
                    onClick={() => setSize(opt.value)} type="button"
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="img-option-group">
              <label className="img-option-label">Align</label>
              <div className="img-btn-group">
                {ALIGN_OPTIONS.map(opt => (
                  <button key={opt.value}
                    className={`img-opt-btn ${align === opt.value ? 'img-opt-btn--active' : ''}`}
                    onClick={() => setAlign(opt.value)} type="button"
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="forum-error">{error}</p>}

        <div className="forum-modal-footer">
          <button className="forum-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="forum-btn-primary" onClick={handleInsert} disabled={!canInsert || uploading}>
            {uploading ? 'Uploading…' : 'Insert Image'}
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
      </div>
    </div>
  )
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({ address, defaultBoardId, onCreated, onClose }: {
  address: string; defaultBoardId?: string
  onCreated: (t: ForumThread) => void; onClose: () => void
}) {
  const [title,   setTitle]   = useState('')
  const [body,    setBody]    = useState('')
  const [tags,    setTags]    = useState<string[]>([])
  const [posting, setPosting] = useState(false)
  const [error,   setError]   = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 3 ? [...prev, tag] : prev)
  }

  const submit = async () => {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!body.trim())  { setError('Body is required.');  return }
    setPosting(true); setError('')
    try { onCreated(await createThread(address, title.trim(), body.trim(), tags, defaultBoardId ?? 'general')) }
    catch { setError('Failed to post. Please try again.') }
    finally { setPosting(false) }
  }

  return (
    <div className="forum-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="forum-modal">
        <div className="forum-modal-header">
          <h2 className="forum-modal-title">New Thread</h2>
          <button className="forum-modal-close" onClick={onClose}>✕</button>
        </div>
        <input ref={titleRef} className="forum-input"
          placeholder="Thread title…" value={title}
          onChange={e => setTitle(e.target.value)} maxLength={200} />
        <div className="forum-tag-picker">
          <span className="forum-tag-picker-label">Tags <span className="forum-tag-picker-hint">(up to 3)</span></span>
          <div className="forum-tag-picker-options">
            {ALL_TAGS.map(tag => (
              <button key={tag} type="button"
                className={`ftc-tag ftc-tag--${tag} forum-tag-option ${tags.includes(tag) ? 'forum-tag-option--active' : ''}`}
                onClick={() => toggleTag(tag)}
              >{tag}</button>
            ))}
          </div>
        </div>
        <ForumEditor value={body} onChange={setBody} height={400} preview="live" />
        {error && <p className="forum-error">{error}</p>}
        <div className="forum-modal-footer">
          <span className="forum-char-hint">{body.length} chars</span>
          <button className="forum-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="forum-btn-primary" onClick={submit} disabled={posting}>
            {posting ? 'Posting…' : 'Post Thread'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Thread Detail ────────────────────────────────────────────────────────────

function ThreadDetail({ address, threadId, onBack }: { address: string; threadId: string; onBack: () => void }) {
  const [thread,    setThread]    = useState<ForumThreadDetail | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [quotingId, setQuotingId] = useState<string | null>(null)
  const [posting,   setPosting]   = useState(false)
  const [error,     setError]     = useState('')
  const replyFormRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    fetchThread(threadId, address).then(t => { setThread(t); setLoading(false) })
  }, [threadId, address])

  const handleThreadLike = async () => {
    if (!thread) return
    try {
      const r = await likeThread(thread.id, address)
      setThread(prev => prev ? { ...prev, like_count: r.like_count, your_like: r.your_like } : prev)
    } catch {}
  }

  const handleReplyLike = async (replyId: string) => {
    if (!thread) return
    try {
      const r = await likeReply(replyId, address)
      setThread(prev => prev ? {
        ...prev,
        replies: prev.replies.map(x => x.id === replyId ? { ...x, like_count: r.like_count, your_like: r.your_like } : x),
      } : prev)
    } catch {}
  }

  const handleQuote = (reply: ForumReply) => {
    setQuotingId(reply.id)
    const preview = stripMarkdown(reply.body).slice(0, 80)
    setReplyBody(`> ${preview}${reply.body.length > 80 ? '…' : ''}\n\n`)
    replyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const submitReply = async () => {
    if (!thread || !replyBody.trim()) return
    setPosting(true); setError('')
    try {
      const r = await postReply(thread.id, address, replyBody.trim(), quotingId)
      setThread(prev => prev ? { ...prev, replies: [...prev.replies, r], reply_count: prev.reply_count + 1 } : prev)
      setReplyBody(''); setQuotingId(null)
    } catch { setError('Failed to post reply. Please try again.') }
    finally { setPosting(false) }
  }

  if (loading) return <div className="forum-shell"><div className="forum-state">Loading thread…</div></div>
  if (!thread) return (
    <div className="forum-shell">
      <button className="forum-back-btn" onClick={onBack}>← Back</button>
      <div className="forum-state">Thread not found.</div>
    </div>
  )

  return (
    <div className="forum-shell forum-shell--detail">
      <nav className="forum-breadcrumb">
        <button className="forum-back-btn" onClick={onBack}>← Back</button>
        <span className="forum-breadcrumb-sep">/</span>
        <span className="forum-breadcrumb-current">{thread.title}</span>
      </nav>

      <div className="forum-op">
        {thread.is_pinned && <div className="forum-op-pinned-banner">📌 Pinned by VVC Admin</div>}
        <h2 className="forum-op-title">{thread.title}</h2>
        {thread.tags && thread.tags.length > 0 && (
          <div className="ftc-tags forum-op-tags">
            {thread.tags.map(tag => <span key={tag} className={`ftc-tag ftc-tag--${tag}`}>{tag}</span>)}
          </div>
        )}
        <div className="forum-op-meta">
          <span className={`forum-op-author ${isAdmin(thread.wallet) ? 'forum-op-author--admin' : ''}`}>
            <UserChip wallet={thread.wallet} size="sm" />
          </span>
          <span className="forum-op-meta-dot">·</span>
          <span className="forum-op-time">{timeAgo(thread.created_at)}</span>
          <span className="forum-op-meta-dot">·</span>
          <span className="forum-op-views">{thread.view_count.toLocaleString()} views</span>
        </div>
        <div className="forum-md-body" data-color-mode="dark">
          <MDEditor.Markdown source={thread.body} />
        </div>
        <div className="forum-op-actions">
          <button className={`forum-action-btn forum-like-btn ${thread.your_like ? 'forum-like-btn--active' : ''}`}
            onClick={handleThreadLike}>♥ {thread.like_count}</button>
          <button className="forum-action-btn"
            onClick={() => replyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>↩ Reply</button>
          {thread.is_locked && <span className="forum-locked-badge">🔒 Locked</span>}
        </div>
      </div>

      <div className="forum-replies-header">
        <span className="forum-replies-count">
          {thread.reply_count === 0 ? 'No replies yet' : `${thread.reply_count} ${thread.reply_count === 1 ? 'Reply' : 'Replies'}`}
        </span>
      </div>

      {thread.replies.length > 0 && (
        <div className="forum-replies-list">
          {thread.replies.map((r, idx) => (
            <ReplyCard key={r.id} reply={r} index={idx + 1} address={address}
              onLike={() => handleReplyLike(r.id)} onQuote={() => handleQuote(r)} />
          ))}
        </div>
      )}

      {!thread.is_locked && (
        <div className="forum-reply-form" ref={replyFormRef}>
          <div className="forum-reply-form-label">Your Reply</div>
          {quotingId && (
            <div className="forum-quoting-banner">
              Quoting a message
              <button className="forum-quoting-clear" onClick={() => { setQuotingId(null); setReplyBody('') }}>✕ Clear</button>
            </div>
          )}
          <ForumEditor value={replyBody} onChange={setReplyBody} height={200} preview="edit" />
          {error && <p className="forum-error">{error}</p>}
          <div className="forum-reply-form-footer">
            <span className="forum-char-hint">{replyBody.length} chars</span>
            <button className="forum-btn-primary" onClick={submitReply} disabled={posting || !replyBody.trim()}>
              {posting ? 'Posting…' : 'Post Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reply Card ───────────────────────────────────────────────────────────────

function ReplyCard({ reply, index, address, onLike, onQuote }: {
  reply: ForumReply; index: number; address: string; onLike: () => void; onQuote: () => void
}) {
  const own   = reply.wallet === address
  const admin = isAdmin(reply.wallet)
  return (
    <div className={`forum-reply ${own ? 'forum-reply--own' : ''} ${admin ? 'forum-reply--admin' : ''}`}>
      <div className="forum-reply-index">#{index}</div>
      <div className="forum-reply-body-wrap">
        <div className="forum-reply-meta">
          <span className={`forum-reply-author ${admin ? 'forum-reply-author--admin' : ''}`}>
            <UserChip wallet={reply.wallet} size="sm" />
          </span>
          {own && <span className="forum-you-tag">YOU</span>}
          <span className="forum-reply-meta-dot">·</span>
          <span className="forum-reply-time">{timeAgo(reply.created_at)}</span>
        </div>
        <div className="forum-md-body forum-md-body--reply" data-color-mode="dark">
          <MDEditor.Markdown source={reply.body} />
        </div>
        <div className="forum-reply-actions">
          <button className={`forum-action-btn forum-like-btn ${reply.your_like ? 'forum-like-btn--active' : ''}`} onClick={onLike}>
            ♥ {reply.like_count}
          </button>
          <button className="forum-action-btn" onClick={onQuote}>Quote</button>
        </div>
      </div>
    </div>
  )
}
