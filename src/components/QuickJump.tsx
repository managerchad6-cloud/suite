// Jump anywhere: Ctrl/⌘ K (or the Search button in the nav) opens a palette. Type to filter the pages
// and actions, and from two letters on it also finds memes and members (a pasted wallet works too).
// Arrows to move, Enter to go, Esc to close.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { searchAll, type SearchResult } from '../api/search'
import { openBuyVvc } from '../api/credits'
import { bestImage } from '../identity/api'
import { displayName } from '../identity/archetypes'
import { useIdentity } from '../identity/IdentityProvider'
import './QuickJump.css'

interface Place { label: string; hint: string; icon: string; path?: string; run?: () => void; keywords?: string }
type Row = { kind: 'place'; place: Place } | { kind: 'result'; result: SearchResult }

/** Open the palette from anywhere */
export const openQuickJump = () => window.dispatchEvent(new CustomEvent('vvc:quick-jump'))

export function QuickJump({ navigate, places }: { navigate: (path: string) => void; places: Place[] }) {
  const { status, join } = useIdentity()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('vvc:quick-jump', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('vvc:quick-jump', onOpen) }
  }, [])

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setActive(0); return }
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  // Memes and members, from two letters on
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(() => {
      searchAll(q, 8).then(setResults).catch(() => setResults([])).finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(t)
  }, [query])

  const allPlaces = useMemo<Place[]>(() => [
    ...places,
    { label: 'Buy $VVC', hint: 'Hold $VVC for free weekly credits', icon: '🪙', run: openBuyVvc, keywords: 'token swap holder credits' },
    ...(status !== 'member' ? [{ label: status === 'pending' ? 'Finish joining' : 'Join', hint: 'Sign in with your wallet', icon: '🔑', run: () => join(), keywords: 'sign in login wallet' }] : []),
  ], [places, status, join])

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = allPlaces.filter(p => !q || `${p.label} ${p.hint} ${p.keywords ?? ''}`.toLowerCase().includes(q))
    return [...matched.map(place => ({ kind: 'place' as const, place })), ...results.map(result => ({ kind: 'result' as const, result }))]
  }, [allPlaces, results, query])

  useEffect(() => { setActive(0) }, [query, results.length])
  useEffect(() => { listRef.current?.querySelector('.qj-row.is-active')?.scrollIntoView({ block: 'nearest' }) }, [active])

  const go = (row: Row | undefined) => {
    if (!row) return
    setOpen(false)
    if (row.kind === 'place') { if (row.place.run) row.place.run(); else if (row.place.path) navigate(row.place.path); return }
    const r = row.result
    navigate(r.kind === 'meme' ? `/memes/${r.item.type}/${r.item.sourceId}` : `/u/${r.wallet}`)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(rows[active]) }
  }

  if (!open) return null
  const firstResult = rows.findIndex(r => r.kind === 'result')
  return createPortal(
    <div className="qj-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="qj" role="dialog" aria-label="Jump to" onKeyDown={onKeyDown}>
        <div className="qj-field">
          <span className="qj-glass" aria-hidden>⌕</span>
          <input ref={inputRef} className="qj-input" placeholder="Jump to a page, find a meme or a member…" value={query}
            onChange={e => setQuery(e.target.value)} autoComplete="off" spellCheck={false} />
          {loading ? <span className="qj-spin" /> : <kbd className="qj-kbd">Esc</kbd>}
        </div>
        <div className="qj-list" ref={listRef}>
          {rows.map((row, i) => (
            <div key={i}>
              {i === 0 && row.kind === 'place' && <div className="qj-section">Go to</div>}
              {i === firstResult && <div className="qj-section">Memes and members</div>}
              <button className={`qj-row${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(row)}>
                {row.kind === 'place' ? (
                  <>
                    <span className="qj-icon">{row.place.icon}</span>
                    <span className="qj-text"><b>{row.place.label}</b><small>{row.place.hint}</small></span>
                  </>
                ) : row.result.kind === 'meme' ? (
                  <>
                    <img className="qj-thumb" src={row.result.item.imageUrl} alt="" loading="lazy" />
                    <span className="qj-text"><b>{row.result.item.title}</b><small>{row.result.item.type} meme</small></span>
                  </>
                ) : (
                  <>
                    <span className="qj-avatar">{row.result.profile ? <img src={bestImage(row.result.profile)} alt="" /> : row.result.wallet[0]?.toUpperCase()}</span>
                    <span className="qj-text">
                      <b>{row.result.profile ? displayName(row.result.profile) : `${row.result.wallet.slice(0, 6)}…${row.result.wallet.slice(-4)}`}</b>
                      <small>{row.result.profile ? 'member' : 'wallet'} · {row.result.wallet.slice(0, 4)}…{row.result.wallet.slice(-4)}</small>
                    </span>
                  </>
                )}
                {i === active && <kbd className="qj-enter">↵</kbd>}
              </button>
            </div>
          ))}
          {rows.length === 0 && !loading && <p className="qj-empty">Nothing for “{query.trim()}”</p>}
        </div>
        <div className="qj-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> go</span><span><kbd>Ctrl</kbd><kbd>K</kbd> anywhere</span></div>
      </div>
    </div>,
    document.body,
  )
}
