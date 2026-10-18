// One meme in the feed, laid out like the meme page's post: who made it (with Follow), the matchup
// as the headline, the meme. Tap to open it, double-tap to call it Based; flip it for the breakdown.
// After a vote, the crowd's verdict slides up over the meme.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { bestImage, getPublicProfile, type PublicProfile } from '../identity/api'
import { displayName } from '../identity/archetypes'
import { TIERS, splitSide, useMeme } from '../lib/memeInfo'
import { shortWallet } from './ProfileShowcase'
import type { UnifiedMemeItem } from '../types/unified'
import './FeedPost.css'

export interface Verdict { pct: number; dir: 1 | -1; key: number }

interface Props {
  item: UnifiedMemeItem
  current: boolean
  /** null while unknown or not applicable (guests, your own meme) */
  following: boolean | null
  own: boolean
  onFollow: () => void
  onOpen: () => void
  onOpenProfile?: (wallet: string) => void
  onDoubleTap: () => void
  flipped: boolean
  verdict: Verdict | null
  children?: ReactNode
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (!isFinite(s)) return ''
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function FeedPost({ item, current, following, own, onFollow, onOpen, onOpenProfile, onDoubleTap, flipped, verdict, children }: Props) {
  const [creator, setCreator] = useState<PublicProfile | null>(null)
  // The card hugs the meme's shape (until it runs out of room)
  const [ratio, setRatio] = useState<number | null>(null)
  useEffect(() => { if (item.wallet) getPublicProfile(item.wallet).then(setCreator) }, [item.wallet])

  // Tap opens the meme page; a second tap within 300ms makes it a double-tap (Based) instead
  const lastTap = useRef(0)
  const [burst, setBurst] = useState(0)
  const tap = () => {
    if (!current) return
    const now = Date.now()
    if (now - lastTap.current < 300) {
      lastTap.current = 0
      setBurst(b => b + 1)
      onDoubleTap()
      return
    }
    lastTap.current = now
    window.setTimeout(() => { if (lastTap.current === now) { lastTap.current = 0; onOpen() } }, 310)
  }

  const tier = TIERS[item.tier ?? 'fresh']
  const { kicker: k1, rest: r1 } = splitSide(item.title.split(' vs ')[0] ?? '')
  const parts = item.title.split(' vs ')
  const matchup = parts.length === 2 && k1 && splitSide(parts[1]).kicker
  const name = creator ? displayName(creator) : item.wallet ? shortWallet(item.wallet) : item.type === 'reddit' ? 'r/VirginVsChad' : 'Anonymous'

  return (
    <article className={`fp${flipped ? ' fp--flipped' : ''}`} style={{ ['--tier' as string]: tier.color, ['--ar' as string]: ratio ?? 4 / 3 }}>
      <header className="fp-head">
        <button className="fp-avatar" onClick={() => item.wallet && onOpenProfile?.(item.wallet)} disabled={!item.wallet} tabIndex={current ? 0 : -1}>
          {creator ? <img src={bestImage(creator)} alt="" /> : <span>{(item.wallet ?? 'VC').slice(0, 2).toUpperCase()}</span>}
        </button>
        <div className="fp-who">
          <button className="fp-name" onClick={() => item.wallet && onOpenProfile?.(item.wallet)} disabled={!item.wallet} tabIndex={current ? 0 : -1}>{name}</button>
          <span className="fp-sub">
            {item.wallet && <>@{shortWallet(item.wallet)} · </>}{ago(item.dateIso)}
            <span className="fp-tier">{tier.icon} {tier.label}{item.tier === 'fresh' || !item.tier ? ' · scout it' : ''}</span>
            {item.remixed_from && <span className="fp-remix">🎨 Remix</span>}
          </span>
        </div>
        {own ? <span className="fp-own">Yours</span>
          : following !== null && (
            <button className={`fp-follow${following ? ' fp-follow--on' : ''}`} onClick={onFollow} tabIndex={current ? 0 : -1}>
              {following ? 'Following' : 'Follow'}
            </button>
          )}
      </header>

      {matchup ? (
        <h2 className="fp-title fp-title--vs">
          <span className="fp-side fp-side--virgin"><small>{k1}</small>{r1}</span>
          <em className="fp-vs">vs</em>
          <span className="fp-side fp-side--chad"><small>{splitSide(parts[1]).kicker}</small>{splitSide(parts[1]).rest}</span>
        </h2>
      ) : <h2 className="fp-title">{item.title}</h2>}

      <div className="fp-stage" style={ratio ? { aspectRatio: String(ratio) } : undefined}>
        <div className="fp-flip">
          <div className="fp-face fp-front" onClick={tap} role="button" tabIndex={-1} aria-label="Open the meme (double-tap for Based)">
            <img src={item.imageUrl} alt={item.title} draggable={false} loading={current ? 'eager' : 'lazy'}
              onLoad={e => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight) }} />
            {burst > 0 && <span key={burst} className="fp-burst" aria-hidden>▲<b>BASED</b></span>}
            {verdict && (
              <div key={verdict.key} className={`fp-verdict fp-verdict--${verdict.pct >= 50 === (verdict.dir === 1) ? 'with' : 'against'}`}>
                <b>{verdict.dir === 1 ? verdict.pct : 100 - verdict.pct}%</b>
                <span>{verdict.dir === 1 ? 'said Based' : 'said Cringe'}
                  {' · '}{(verdict.pct >= 50) === (verdict.dir === 1) ? "you're with the crowd" : 'hot take'}</span>
                <i className="fp-verdict-bar"><s style={{ width: `${verdict.pct}%` }} /></i>
              </div>
            )}
            {children}
          </div>
          <div className="fp-face fp-back">{flipped && <Breakdown item={item} />}</div>
        </div>
      </div>
    </article>
  )
}

/** The back of the card: what each side is about */
function Breakdown({ item }: { item: UnifiedMemeItem }) {
  const { info } = useMeme(item.type, item.sourceId)
  const reddit = item.type === 'reddit'
  const sides = reddit
    ? [
      { name: item.redditLeftTitle ?? 'Left', labels: item.redditLeftLabels ?? [] },
      { name: item.redditRightTitle ?? 'Right', labels: item.redditRightLabels ?? [] },
    ]
    : info?.sides ?? []
  if (!reddit && !info) return <div className="fp-back-empty"><span className="fp-spin" /></div>
  if (!sides.some(s => s.labels.length)) return <div className="fp-back-empty">No breakdown for this one. Flip it back and judge it yourself.</div>
  return (
    <div className="fp-tape">
      {sides.map((s, i) => {
        const { kicker, rest } = splitSide(s.name)
        const side = kicker?.toLowerCase() ?? (i % 2 ? 'chad' : 'virgin')
        return (
          <div key={i} className={`fp-tape-col fp-tape-col--${side}`}>
            <h3>{kicker && <small>{kicker}</small>}{rest}</h3>
            <ul>{s.labels.map((l, j) => <li key={j} style={{ animationDelay: `${j * 50}ms` }}>{l}</li>)}</ul>
          </div>
        )
      })}
    </div>
  )
}
