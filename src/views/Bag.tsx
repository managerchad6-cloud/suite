import { useEffect, useMemo, useState } from 'react'
import {
  daysSince, fmtPct, fmtSol, fmtTokens, fmtUsd, livePosition, setBagPublic, since, until,
  type Bag as BagData, type Market,
} from '../api/bag'
import { openBuyVvc, openSellVvc } from '../api/credits'
import { useBag, refreshBag } from '../hooks/useBag'
import { useIdentity } from '../identity/IdentityProvider'
import './Bag.css'

const TIER_ICON: Record<string, string> = { holder: '💵', bag: '💰', whale: '🐋', kraken: '🦑' }

/** Re-render every second (the clocks tick). */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return now
}

/** The number counts to its new value instead of jumping. */
function useRolling(target: number | null, ms = 900) {
  const [shown, setShown] = useState(target)
  useEffect(() => {
    if (target === null) { setShown(null); return }
    const from = shown ?? target
    if (from === target) return
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setShown(from + (target - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])  // eslint-disable-line react-hooks/exhaustive-deps
  return shown
}

// The bag: what you hold, what it's done, how long you've held it. Home of the suite.
export function Bag() {
  const { status, me, join } = useIdentity()
  const { market, bag } = useBag()
  const live = livePosition(bag, market)
  const pnl = live?.pnlPct ?? null
  const mood = pnl === null ? 'flat' : pnl >= 0 ? 'up' : 'down'
  const memberSince = me && me.state !== 'guest' ? me.account.memberSince : null

  return (
    <div className={`bag-view bag-view--${mood}`}>
      {status === 'member' && bag ? (
        <>
          <Hero bag={bag} market={market} live={live} />
          <Clocks bag={bag} memberSince={memberSince} />
          <Chart market={market} bag={bag} />
          <div className="bag-actions">
            <button className="bag-btn bag-btn--buy" onClick={() => openBuyVvc()}>Buy ${market?.symbol ?? 'VVC'}</button>
            <button className="bag-btn bag-btn--sell" onClick={openSellVvc}>Sell</button>
          </div>
          <Bags bag={bag} />
          <Trades bag={bag} />
          <Privacy bag={bag} />
        </>
      ) : (
        <>
          <MarketHero market={market} />
          <Chart market={market} bag={null} />
          <div className="bag-cta">
            <h2>Every Chad holds a bag.</h2>
            <p>Buy $VVC, join, and watch your bag, your PnL and your diamond hands right here.</p>
            <div className="bag-actions">
              <button className="bag-btn bag-btn--buy" onClick={() => openBuyVvc()}>Buy ${market?.symbol ?? 'VVC'}</button>
              {status !== 'member' && <button className="bag-btn bag-btn--ghost" onClick={() => join('track your bag')}>{status === 'pending' ? 'Finish joining' : 'Join'}</button>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Hero({ bag, market, live }: { bag: BagData; market: Market | null; live: ReturnType<typeof livePosition> }) {
  const value = useRolling(live?.valueUsd ?? null)
  const pnl = useRolling(live?.pnlPct ?? null)
  const dir = (live?.pnlPct ?? 0) >= 0 ? 'up' : 'down'
  // Where you sit between Virgin (−100%) and Chad (+100% and up)
  const meter = live?.pnlPct == null ? 50 : Math.max(2, Math.min(98, 50 + live.pnlPct / 2))
  return (
    <section className="bag-hero">
      <div className="bag-hero-main">
        <div className="bag-label">YOUR BAG</div>
        <div className="bag-value">{fmtUsd(value)}</div>
        <div className="bag-sub">{fmtTokens(bag.balance)} ${market?.symbol ?? 'VVC'} · {fmtSol(live?.valueSol)}</div>
      </div>
      <div className="bag-hero-pnl">
        <div className="bag-label">PNL · ALL BAGS</div>
        <div className={`bag-pnl bag-${pnl === null ? 'flat' : dir}`}>{pnl === null ? (bag.syncing || !bag.synced ? '…' : '—') : fmtPct(pnl)}</div>
        <div className="bag-sub">
          {live?.pnlSol != null ? `${live.pnlSol >= 0 ? '+' : ''}${fmtSol(live.pnlSol)}` : bag.costSol > 0 ? '' : 'No buys found for this wallet yet'}
        </div>
      </div>
      <div className="bag-hero-tier">
        {bag.tier ? (
          <>
            <div className="bag-tier">{TIER_ICON[bag.tier.key] ?? '💵'} {bag.tier.name}</div>
            <div className="bag-loyalty">{bag.tier.loyalty.name}{bag.tier.loyalty.bonusPct ? ` · +${bag.tier.loyalty.bonusPct}% credits` : ''}</div>
            {bag.tier.nextBag && <div className="bag-next">{bag.tier.nextBag.name} at {fmtTokens(bag.tier.nextBag.minBalance)}</div>}
          </>
        ) : (
          <>
            <div className="bag-tier bag-tier--none">No tier yet</div>
            <div className="bag-next">Hold the minimum to become a Holder</div>
          </>
        )}
      </div>
      <div className="bag-meter" aria-label="Virgin to Chad">
        <span>VIRGIN</span>
        <div className="bag-meter-track"><div className="bag-meter-dot" style={{ left: `${meter}%` }} /></div>
        <span>CHAD</span>
      </div>
      {(bag.syncing || !bag.synced) && <div className="bag-syncing">Reading your trades from the chain…</div>}
    </section>
  )
}

function MarketHero({ market }: { market: Market | null }) {
  return (
    <section className="bag-hero bag-hero--market">
      <div className="bag-hero-main">
        <div className="bag-label">${market?.symbol ?? 'VVC'}</div>
        <div className="bag-value">{market ? (market.usd >= 1 ? `$${market.usd.toFixed(3)}` : `$${market.usd.toPrecision(4)}`) : '…'}</div>
        <div className="bag-sub">{market ? `${market.sol.toPrecision(3)} SOL` : ''}</div>
      </div>
      <div className="bag-hero-pnl">
        <div className="bag-label">24H</div>
        <div className={`bag-pnl bag-${(market?.change24h ?? 0) >= 0 ? 'up' : 'down'}`}>{fmtPct(market?.change24h)}</div>
        <div className="bag-sub">Market cap {fmtUsd(market?.mcapUsd)}</div>
      </div>
    </section>
  )
}

function Clocks({ bag, memberSince }: { bag: BagData; memberSince: string | null }) {
  const now = useNow()
  const held = bag.oldestBagSince ?? bag.holdingSince
  const next = bag.tier?.nextLoyalty
  return (
    <section className="bag-clocks">
      <div className="bag-card">
        <div className="bag-label">HOLDING FOR</div>
        <div className="bag-clock">{held ? since(held, now) : '—'}</div>
        <div className="bag-sub">{held ? `your oldest bag, since ${new Date(held).toLocaleDateString()}` : 'Buy to start the clock'}</div>
      </div>
      <div className="bag-card">
        <div className="bag-label">VVC MEMBER FOR</div>
        <div className="bag-clock">{memberSince ? `${daysSince(memberSince)} days` : '—'}</div>
        <div className="bag-sub">{memberSince ? `since ${new Date(memberSince).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</div>
      </div>
      <div className="bag-card">
        <div className="bag-label">NEXT LEVEL</div>
        <div className="bag-clock">{next ? until(next.at, now) : bag.tier ? 'Maxed' : '—'}</div>
        <div className="bag-sub">{next ? `until ${next.name} (+${next.bonusPct}% credits)` : bag.tier ? 'OG: the longest hands there are' : 'Become a Holder first'}</div>
      </div>
    </section>
  )
}

function Chart({ market, bag }: { market: Market | null; bag: BagData | null }) {
  const W = 800, H = 180, PAD = 8
  const pts = market?.history ?? []
  const geo = useMemo(() => {
    if (pts.length < 2) return null
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0]
    const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]))
    const x = (t: number) => PAD + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * PAD)
    const y = (v: number) => H - PAD - ((v - lo) / Math.max(1e-12, hi - lo)) * (H - 2 * PAD)
    const line = pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')
    const marks = (bag?.trades ?? [])
      .filter(t => (t.kind === 'buy' || t.kind === 'sell') && Date.parse(t.at) >= t0)
      .map(t => {
        const ts = Date.parse(t.at)
        const near = pts.reduce((a, b) => (Math.abs(b[0] - ts) < Math.abs(a[0] - ts) ? b : a))
        return { key: t.signature, kind: t.kind, cx: x(ts), cy: y(near[1]) }
      })
    return { line, marks, up: pts[pts.length - 1][1] >= pts[0][1] }
  }, [pts, bag?.trades])

  return (
    <section className="bag-card bag-chart">
      <div className="bag-chart-head">
        <span className="bag-label">${market?.symbol ?? 'VVC'} · 24H</span>
        {bag && <span className="bag-chart-legend"><i className="bag-dot bag-dot--buy" /> your buys <i className="bag-dot bag-dot--sell" /> your sells</span>}
      </div>
      {geo ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="bag-chart-svg" aria-hidden>
          <polyline points={geo.line} fill="none" className={geo.up ? 'bag-line-up' : 'bag-line-down'} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
          {geo.marks.map(m => <circle key={m.key} cx={m.cx} cy={m.cy} r="5" className={`bag-mark bag-mark--${m.kind}`} />)}
        </svg>
      ) : (
        <div className="bag-chart-empty">The chart fills in as prices come in.</div>
      )}
    </section>
  )
}

function Bags({ bag }: { bag: BagData }) {
  const now = useNow(60_000)
  if (!bag.lots.length) return null
  return (
    <section>
      <h3 className="bag-h">Your bags</h3>
      <div className="bag-lots">
        {[...bag.lots].reverse().map(l => (
          <div key={l.since} className="bag-card bag-lot">
            <div className="bag-lot-size">💰 {fmtTokens(l.tokens)}</div>
            <div className="bag-sub">{l.entrySol !== null ? `in at ${l.entrySol.toPrecision(3)} SOL` : 'transferred in'}</div>
            <div className="bag-sub">held {Math.floor((now - Date.parse(l.since)) / 86_400_000)}d</div>
            {l.pnlPct !== null && <div className={`bag-lot-pnl bag-${l.pnlPct >= 0 ? 'up' : 'down'}`}>{fmtPct(l.pnlPct)}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

const KIND: Record<string, string> = { buy: '🟢 Bought', sell: '🔴 Sold', in: '↘ Received', out: '↗ Sent' }

function Trades({ bag }: { bag: BagData }) {
  if (!bag.trades.length) return null
  return (
    <section>
      <h3 className="bag-h">Your trades</h3>
      <div className="bag-card bag-trades">
        {bag.trades.slice(0, 12).map(t => (
          <a key={t.signature} className="bag-trade" href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noopener noreferrer">
            <span>{KIND[t.kind]}</span>
            <span>{fmtTokens(Math.abs(t.tokens))}</span>
            <span className="bag-sub">{t.sol ? fmtSol(Math.abs(t.sol)) : ''}</span>
            <span className="bag-sub">{new Date(t.at).toLocaleDateString()}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

function Privacy({ bag }: { bag: BagData }) {
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try { await setBagPublic(!bag.public); refreshBag() } finally { setBusy(false) }
  }
  return (
    <label className="bag-privacy">
      <input type="checkbox" checked={bag.public} disabled={busy} onChange={toggle} />
      Show my bag, PnL and hold time on my public profile
    </label>
  )
}
