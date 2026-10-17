// The pieces both profile pages are built from (yours at /profile, anyone's at /u/:wallet):
// the character as a collectible card, the hero around it, the Virgin–Chad spectrum, counting
// stats, the tab bar, the meme grid (each meme opens its page) and the activity list.
import { useState, useEffect, useMemo, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { imageUrl, parseMemeId, type Meme } from '../api/memes'
import { studioMemeImageUrl, type StudioMeme } from '../api/studio'
import { fetchPlayerTimeline, type ActivityEvent, type PlayerState } from '../api/player'
import { archetypeName } from '../identity/archetypes'
import './ProfileShowcase.css'

export type MemeSource = 'factory' | 'studio'
export interface MemeCard { key: string; source: MemeSource; id: string; img: string; virgin: string; chad: string; label: string; votes: number; at: string }

const ALIGN_ACCENT = { chad: '#F0A020', virgin: '#8fb3c9', neutral: '#c9c2b3' } as const
export type Direction = keyof typeof ALIGN_ACCENT

/** Which side of the spectrum a player leans, and the accent colour that goes with it */
export function alignment(player: PlayerState | null): { direction: Direction; accent: string; spectrum: number } {
  const direction = (player?.rank_direction ?? 'neutral') as Direction
  return { direction, accent: ALIGN_ACCENT[direction], spectrum: Math.min(1, Math.max(0, player?.spectrum_position ?? 0.5)) }
}

export const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`
export const since = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
const RANK_NAME: Record<string, string> = { virgin_rank: 'Virgin', basic: 'Basic' }
const rankName = (r: string) => RANK_NAME[r] ?? archetypeName(r)

/** Numbers that count up when they arrive */
function useCountUp(target: number | null, ms = 700) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target === null) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return target === null ? null : n
}

export function Stat({ value, label, onClick, title }: { value: number | null; label: string; onClick?: () => void; title?: string }) {
  const n = useCountUp(value)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`pp-stat${onClick ? ' pp-stat--link' : ''}`} onClick={onClick} title={title}>
      <span className="pp-stat-num">{n === null ? '…' : n.toLocaleString()}</span>
      <span className="pp-stat-label">{label}</span>
    </Tag>
  )
}

/** The character as a collectible card that tilts toward the pointer, with a moving shine */
export function CharacterCard({ image, name, tier, rarity, accent, overlay }: {
  image: string | null; name: string; tier?: string; rarity: string; accent: string
  /** Shown over the art (e.g. "Drawing your character…") */
  overlay?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 18}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }
  const leave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg')
  }
  return (
    <div className="pp-card-stage">
      <div ref={ref} className={`pp-card pp-card--${rarity}`} style={{ '--pp-accent': accent } as CSSProperties}
        onPointerMove={move} onPointerLeave={leave}>
        <div className="pp-card-inner">
          <div className="pp-card-top">
            <span className="pp-card-rarity">{rarity}</span>
            {tier && <span className="pp-card-tier">{tier}</span>}
          </div>
          <div className="pp-card-art">
            {image ? <img src={image} alt={name} draggable={false} /> : <div className="pp-card-art-empty" />}
            {overlay && <div className="pp-card-overlay">{overlay}</div>}
          </div>
          <div className="pp-card-name">{name}</div>
        </div>
        <div className="pp-card-shine" aria-hidden />
      </div>
    </div>
  )
}

/** Placeholder card while the profile loads (undefined) or when there is none (null) */
export function EmptyCard({ loading, initials }: { loading: boolean; initials?: string }) {
  return (
    <div className="pp-card-stage">
      {loading ? <div className="pp-card pp-card--skeleton" /> : <div className="pp-card pp-card--none"><span>{initials ?? '?'}</span></div>}
    </div>
  )
}

/** Card on the left, info column on the right (stacked on phones), the full art blurred behind */
export function ProfileHero({ art, card, children }: { art: string | null; card: ReactNode; children: ReactNode }) {
  return (
    <section className="pp-hero">
      {art && <div className="pp-hero-bg" style={{ backgroundImage: `url("${art}")` }} aria-hidden />}
      {card}
      <div className="pp-info">{children}</div>
    </section>
  )
}

/** Round PFP, archetype kicker, name, tagline and the Oracle's description */
export function HeroIdentity({ pfp, kicker, sinceIso, name, loading, tagline, description, children }: {
  pfp: string | null; kicker: string; sinceIso?: string | null
  /** null: no archetype yet */
  name: string | null; loading?: boolean; tagline?: string; description?: string
  /** Extra line under the kicker (e.g. a status chip) */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="pp-id-row">
        {pfp ? <img className="pp-pfp" src={pfp} alt="" /> : <div className="pp-pfp pp-pfp--empty" />}
        <div className="pp-id-meta">
          <span className="pp-kicker">{kicker}</span>
          {sinceIso && <span className="pp-since">Member since {since(sinceIso)}</span>}
          {children}
        </div>
      </div>
      {loading ? <div className="pp-name-skeleton" />
        : name ? <h1 className="pp-name">{name}</h1>
        : <h1 className="pp-name pp-name--none">No archetype yet</h1>}
      {tagline && <p className="pp-tagline">“{tagline}”</p>}
      {description && (
        <blockquote className={`pp-oracle${open ? ' pp-oracle--open' : ''}`} onClick={() => setOpen(o => !o)}
          title={open ? 'Show less' : 'Read all'}>
          <span className="pp-oracle-label">The Oracle says</span>
          <span className="pp-oracle-text">{description}</span>
        </blockquote>
      )}
    </>
  )
}

/** Rank, XP, streak and a marker on the Virgin–Chad bar */
export function SpectrumBar({ player }: { player: PlayerState }) {
  const { direction, accent, spectrum } = alignment(player)
  return (
    <div className="pp-spectrum" title={`${Math.round(spectrum * 100)}% Chad`}>
      <div className="pp-spectrum-head">
        <span className="pp-rank" style={{ color: accent }}>
          {rankName(player.current_rank)}
          <small>{direction === 'neutral' ? 'Perfectly balanced' : `${direction === 'chad' ? 'Chad' : 'Virgin'} side`}</small>
        </span>
        <span className="pp-xp">⚡ {player.total_xp.toLocaleString()} XP{player.login_streak > 1 && <em> · 🔥 {player.login_streak}-day streak</em>}</span>
      </div>
      <div className="pp-spectrum-bar">
        <span className="pp-spectrum-end">Virgin</span>
        <div className="pp-spectrum-track"><span className="pp-spectrum-marker" style={{ left: `${spectrum * 100}%` }} /></div>
        <span className="pp-spectrum-end">Chad</span>
      </div>
    </div>
  )
}

/** Sticky tab bar; `extra` sits at the right end (the meme sort) */
export function ProfileTabs<T extends string>({ tabs, tab, onTab, extra }: {
  tabs: readonly (readonly [T, string, number | null])[]; tab: T; onTab: (t: T) => void; extra?: ReactNode
}) {
  return (
    <nav className="pp-tabs" role="tablist">
      {tabs.map(([id, label, n]) => (
        <button key={id} role="tab" aria-selected={tab === id} className={`pp-tab${tab === id ? ' pp-tab--on' : ''}`} onClick={() => onTab(id)}>
          {label}{n !== null && n > 0 && <span className="pp-tab-count">{n}</span>}
        </button>
      ))}
      {extra}
    </nav>
  )
}

export function SortToggle({ sort, onSort }: { sort: 'top' | 'new'; onSort: (s: 'top' | 'new') => void }) {
  return (
    <div className="pp-sort">
      <button className={sort === 'top' ? 'pp-sort--on' : ''} onClick={() => onSort('top')}>Top</button>
      <button className={sort === 'new' ? 'pp-sort--on' : ''} onClick={() => onSort('new')}>New</button>
    </div>
  )
}

/** AI (factory) and hand-made (studio) memes as one list, sorted by votes or date, plus the top one */
export function useMemeCards(memes: Meme[], studioMemes: StudioMeme[], sort: 'top' | 'new') {
  const cards = useMemo<MemeCard[]>(() => {
    const all: MemeCard[] = [
      ...memes.map(m => {
        const { virgin, chad } = parseMemeId(m.meme_id)
        return { key: `f:${m.job_id}`, source: 'factory' as const, id: m.job_id, img: imageUrl(m.job_id), virgin, chad, label: `${virgin} vs ${chad}`, votes: m.vote_count ?? 0, at: m.completed_at ?? m.created_at }
      }),
      ...studioMemes.map(m => {
        const label = (m.titles?.filter(Boolean).length ? m.titles : (m.characters ?? []).map(c => c.replace(/_/g, ' '))).join(' vs ')
        return { key: `s:${m.id}`, source: 'studio' as const, id: m.id, img: studioMemeImageUrl(m.id), virgin: '', chad: '', label, votes: 0, at: m.created_at }
      }),
    ]
    return sort === 'top'
      ? all.sort((a, b) => b.votes - a.votes || +new Date(b.at) - +new Date(a.at))
      : all.sort((a, b) => +new Date(b.at) - +new Date(a.at))
  }, [memes, studioMemes, sort])
  const topKey = useMemo(() => {
    const best = [...cards].sort((a, b) => b.votes - a.votes)[0]
    return best && best.votes > 0 ? best.key : null
  }, [cards])
  const votes = memes.reduce((s, m) => s + (m.vote_count ?? 0), 0)
  return { cards, topKey, votes }
}

export function MemeGrid({ cards, topKey, loading, empty, onOpenMeme }: {
  cards: MemeCard[]; topKey: string | null; loading: boolean; empty: ReactNode
  onOpenMeme?: (source: MemeSource, id: string) => void
}) {
  if (loading) return <div className="pp-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="pp-meme pp-meme--skeleton" />)}</div>
  if (cards.length === 0) return <div className="pp-empty">{empty}</div>
  return (
    <div className="pp-grid">
      {cards.map((c, i) => (
        <button key={c.key} className="pp-meme" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
          onClick={() => onOpenMeme?.(c.source, c.id)} title="Open meme">
          <div className="pp-meme-img"><img src={c.img} alt={c.label} loading="lazy" /></div>
          {c.key === topKey && <span className="pp-meme-crown">👑 Top meme</span>}
          <div className="pp-meme-foot">
            <span className="pp-meme-label">
              {c.virgin || c.chad
                ? <><span className="pp-v">{c.virgin}</span> <i>vs</i> <span className="pp-c">{c.chad}</span></>
                : <span className="pp-meme-studio">{c.label || 'Studio meme'}</span>}
            </span>
            {c.source === 'studio' && <span className="pp-meme-tag">Studio</span>}
            {c.votes > 0 && <span className="pp-meme-votes">▲ {c.votes}</span>}
          </div>
          <span className="pp-meme-open" aria-hidden>View ↗</span>
        </button>
      ))}
    </div>
  )
}

/** XP events, newest first; loads when first shown */
export function ActivityList({ wallet, onOpenMeme }: { wallet: string; onOpenMeme?: (source: MemeSource, id: string) => void }) {
  const [timeline, setTimeline] = useState<ActivityEvent[] | null>(null)
  useEffect(() => {
    setTimeline(null)
    fetchPlayerTimeline(wallet, 40).then(setTimeline).catch(() => setTimeline([]))
  }, [wallet])
  if (timeline === null) return <p className="pp-empty">Loading…</p>
  if (timeline.length === 0) return <p className="pp-empty">No activity yet.</p>
  return (
    <ul className="pp-activity">
      {timeline.map(ev => (
        <li key={ev.id} className={`pp-ev pp-ev--${ev.xp_alignment}`}>
          <span className="pp-ev-dot" />
          <span className="pp-ev-text">
            {ev.event_type.replace(/_/g, ' ')}
            {ev.meme_id && (ev.meme_source === 'factory' || ev.meme_source === 'studio') && (
              <button className="pp-ev-link" onClick={() => onOpenMeme?.(ev.meme_source as MemeSource, ev.meme_id!)}>view meme</button>
            )}
          </span>
          {ev.xp_awarded > 0 && <span className="pp-ev-xp">+{ev.xp_awarded} XP</span>}
          <span className="pp-ev-time">{ago(ev.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}
