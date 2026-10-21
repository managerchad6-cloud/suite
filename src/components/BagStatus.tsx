import { useEffect, useState } from 'react'
import { daysSince, fmtPct, fmtSol, fmtTokens, fmtUsd, livePosition, rankArt, since, type Bag, type Market } from '../api/bag'
import { fetchTokenConfig, type TokenConfig } from '../api/credits'
import './BagStatus.css'

// Your bag at a glance, above the trade panel: what it's worth, how it's doing, where you stand on the
// Chad ladder and what's next. Everything ticks with the live price.

const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : fmtTokens(n))

export function BagStatus({ bag, market, memberSince, onJoin }: { bag: Bag | null; market: Market | null; memberSince: string | null; onJoin: (() => void) | null }) {
  const [now, setNow] = useState(Date.now())
  const [config, setConfig] = useState<TokenConfig | null>(null)
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { fetchTokenConfig().then(setConfig).catch(() => {}) }, [])

  if (!bag) {
    return (
      <div className="bstat bstat--guest">
        <div className="bstat-kicker">YOUR BAG</div>
        <p>Hold $VVC and join: your bag, PnL and Chad rank live here, ticking with the price.</p>
        {onJoin && <button className="bstat-join" onClick={onJoin}>Join to track your bag</button>}
      </div>
    )
  }

  const live = livePosition(bag, market)
  const game = bag.game ?? null
  const rank = game?.rank ?? null
  const pnl = live?.pnlPct ?? null
  const up = (pnl ?? 0) >= 0
  const held = bag.oldestBagSince ?? bag.holdingSince
  const costed = bag.lots.reduce((s, l) => s + (l.entrySol !== null ? l.tokens : 0), 0)
  const entry = costed > 0 ? bag.lots.reduce((s, l) => s + (l.entrySol !== null ? l.tokens * l.entrySol : 0), 0) / costed : null
  // The next bag tier: the one above yours, or Holder (the first) when you have none yet
  const first = config?.tiers?.[0]
  const nextTier = bag.tier ? bag.tier.nextBag : first ? { name: first.name, minBalance: first.minBalance } : null
  const rankProgress = rank?.next && game ? Math.max(0, Math.min(1, (game.score - rank.min) / (rank.next.min - rank.min))) : 1

  return (
    <div className={`bstat bstat--${up ? 'up' : 'down'}`}>
      <div className="bstat-head">
        <span className="bstat-kicker">YOUR BAG</span>
        {rank && <span className="bstat-rank"><img src={rankArt(rank.key)} alt="" />{rank.name}</span>}
      </div>

      <div className="bstat-main">
        <span className="bstat-value">{fmtUsd(live?.valueUsd)}</span>
        <span className={`bstat-pnl ${up ? 'is-up' : 'is-down'}`}>
          {pnl === null ? (bag.syncing || !bag.synced ? '…' : '—') : fmtPct(pnl)}
          {live?.pnlSol != null && <em>{live.pnlSol >= 0 ? '+' : ''}{fmtSol(live.pnlSol)}</em>}
        </span>
      </div>
      <div className="bstat-sub">{fmtTokens(bag.balance)} ${market?.symbol ?? 'VVC'} · {fmtSol(live?.valueSol)}</div>

      {rank && game && (
        <div className="bstat-climb">
          <div className="bstat-bar"><i style={{ width: `${rankProgress * 100}%` }} /></div>
          <span>Chad score <b>{game.score}</b>{rank.next ? <> · <b>{rank.next.points}</b> to {rank.next.name}</> : ' · top of the ladder'}</span>
        </div>
      )}

      <dl className="bstat-grid">
        <div><dt>Avg entry</dt><dd>{entry ? `${entry.toPrecision(3)} SOL` : '—'}</dd></div>
        <div><dt>Holding</dt><dd>{held ? since(held, now).split(' ').slice(0, 3).join(' ') : '—'}</dd></div>
        <div><dt>Paid in</dt><dd>{bag.costSol > 0 ? fmtSol(bag.costSol) : '—'}</dd></div>
        <div><dt>Bag tier</dt><dd>{bag.tier ? bag.tier.name : 'None yet'}</dd></div>
        <div><dt>{nextTier ? `To ${nextTier.name}` : 'Next tier'}</dt><dd>{nextTier ? `${short(Math.max(0, nextTier.minBalance - bag.balance))} $VVC` : bag.tier ? 'Maxed' : '—'}</dd></div>
        <div><dt>Member for</dt><dd>{memberSince ? `${daysSince(memberSince)} days` : '—'}</dd></div>
      </dl>
      {(bag.syncing || !bag.synced) && <div className="bstat-sync">Reading your trades from the chain…</div>}
    </div>
  )
}
