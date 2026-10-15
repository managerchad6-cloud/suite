import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { searchAll, type SearchResult } from '../api/search'
import { CHARACTERS } from '../data/characterLore'
import './GlobalSearch.css'

interface Props {
  navigate: (path: string) => void
}

export function GlobalSearch({ navigate }: Props) {
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 62, right: 8 })

  const btnRef       = useRef<HTMLButtonElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropRef      = useRef<HTMLDivElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openSearch = () => {
    // Anchor dropdown below the nav bar, right-aligned to button
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen(true)
  }

  const closeSearch = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
  }, [])

  // Focus input when bar opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20)
  }, [open])

  // Click-outside closes both inline bar and dropdown
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      const inBar  = containerRef.current?.contains(t)
      const inDrop = dropRef.current?.contains(t)
      if (!inBar && !inDrop) closeSearch()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, closeSearch])

  // Debounced search
  const handleChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try { setResults(await searchAll(val, 10)) }
      finally { setLoading(false) }
    }, 300)
  }

  const handleSelect = (r: SearchResult) => {
    navigate(r.kind === 'meme' ? `/memes/${r.item.type}/${r.item.sourceId}` : `/u/${r.wallet}`)
    closeSearch()
  }

  const showEmpty   = open && query.trim().length >= 2 && !loading && results.length === 0
  const showDropdown = open && (results.length > 0 || showEmpty)

  return (
    <>
      {/* Inline bar — lives inside the topnav */}
      <div ref={containerRef} className={`gsearch${open ? ' gsearch--open' : ''}`}>
        <button
          ref={btnRef}
          className="gsearch-btn"
          onClick={open ? closeSearch : openSearch}
          aria-label={open ? 'Close search' : 'Search'}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="13" y1="13" x2="17" y2="17" />
          </svg>
        </button>

        {open && (
          <input
            ref={inputRef}
            className="gsearch-input"
            placeholder="Search memes, paste wallet or ID…"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') closeSearch() }}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {open && loading && <span className="gsearch-spinner" />}
      </div>

      {/* Dropdown — portalled to body, appears below the nav */}
      {showDropdown && createPortal(
        <div ref={dropRef} className="gsearch-dropdown" style={{ top: dropPos.top, right: dropPos.right }}>
          {results.map((r, i) =>
            r.kind === 'meme' ? (
              <button key={i} className="gsearch-result" onClick={() => handleSelect(r)}>
                <img src={r.item.imageUrl} className="gsearch-thumb" alt="" loading="lazy" />
                <div className="gsearch-result-info">
                  <span className="gsearch-result-title">{r.item.title}</span>
                  <span className={`gsearch-badge gsearch-badge--${r.item.type}`}>{r.item.type}</span>
                </div>
              </button>
            ) : (
              <button key={i} className="gsearch-result" onClick={() => handleSelect(r)}>
                <div className="gsearch-avatar">
                  {r.character ? (
                    <img
                      src={`/profiles/${encodeURIComponent(r.wallet)}/portrait`}
                      alt=""
                      onError={e => {
                        const img = e.currentTarget
                        if (!img.dataset.triedFull) {
                          img.dataset.triedFull = '1'
                          img.onerror = () => {
                            img.onerror = null
                            const cd = CHARACTERS.find(c => c.key === r.character)
                            img.src = cd ? `/assets/chars/${cd.file}.${cd.ext}` : `/assets/chars/${r.character!}.png`
                          }
                          img.src = `/profiles/${encodeURIComponent(r.wallet)}/portrait/full`
                        }
                      }}
                    />
                  ) : (
                    <span>{r.wallet[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="gsearch-result-info">
                  <span className="gsearch-result-title">
                    {(() => {
                      const charName = CHARACTERS.find(c => c.key === r.character)?.name ?? r.character
                      const full = r.title && charName ? `${r.title} ${charName}` : charName
                      return full ?? r.wallet.slice(0, 8) + '…'
                    })()}
                  </span>
                  <span className="gsearch-result-sub">{r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}</span>
                </div>
              </button>
            )
          )}
          {showEmpty && <p className="gsearch-empty">No results for "{query.trim()}"</p>}
        </div>,
        document.body
      )}
    </>
  )
}
