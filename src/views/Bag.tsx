import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  daysSince, fmtPct, fmtSol, fmtTokens, fmtUsd, livePosition, setBagPublic, since, until,
  type Bag as BagData, type Market,
} from '../api/bag'
import { openBuyVvc, openSellVvc, fetchTokenConfig, type TokenConfig } from '../api/credits'
import { useBag, refreshBag } from '../hooks/useBag'
import { useIdentity } from '../identity/IdentityProvider'
import { profileImage } from '../identity/api'
import './Bag.css'

/** Re-render every `ms` (the clocks tick). */
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

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : fmtTokens(n))

/**
 * Your bag as a Virgin vs Chad meme: what makes you a Chad, what makes you a virgin.
 * Written like the captions on the memes, about you, from your real trades.
 */
function traits(bag: BagData, live: ReturnType<typeof livePosition>, market: Market | null, memberSince: string | null) {
  const chad: string[] = []
  const virgin: string[] = []
  const sym = `$${market?.symbol ?? 'VVC'}`
  const pnl = live?.pnlPct ?? null
  const held = bag.oldestBagSince ?? bag.holdingSince
  const sells = bag.trades.filter(t => t.kind === 'sell')
  const buys = bag.trades.filter(t => t.kind === 'buy')

  if (bag.balance > 0) chad.push(`Holds ${short(bag.balance)} ${sym}${bag.tier ? ` (${bag.tier.name})` : ''}`)
  if (pnl !== null && pnl >= 0) chad.push(`Up ${fmtPct(pnl)} on the bags${live?.pnlSol ? `, +${fmtSol(live.pnlSol)}` : ''}`)
  if (held && daysSince(held) >= 1) chad.push(`Hasn't let go of a bag in ${daysSince(held)} days`)
  if (bag.tier && bag.tier.loyalty.key !== 'fresh') chad.push(`${bag.tier.loyalty.name}. Earns +${bag.tier.loyalty.bonusPct}% credits for it`)
  if (buys.length >= 3) chad.push(`Aped in ${buys.length} times`)
  if (memberSince && daysSince(memberSince) >= 7) chad.push(`VVC member for ${daysSince(memberSince)} days`)

  if (pnl !== null && pnl < 0) virgin.push(`Down ${fmtPct(pnl)}. Still checks the chart every 5 minutes`)
  if (sells.length) {
    const worst = sells.reduce((a, b) => (Math.abs(b.tokens) > Math.abs(a.tokens) ? b : a))
    virgin.push(`Paper-handed ${short(Math.abs(worst.tokens))} on ${shortDate(worst.at)}`)
    const sold = sells.reduce((s, t) => s - t.tokens, 0)
    const got = sells.reduce((s, t) => s + t.sol, 0)
    const missed = market ? sold * market.sol - got : 0
    if (missed > 0.01) virgin.push(`Left ${fmtSol(missed)} on the table`)
  }
  if (!bag.tier) virgin.push('Not even a Holder yet')
  else if (bag.tier.nextBag) virgin.push(`Not a ${bag.tier.nextBag.name}. ${short(bag.tier.nextBag.minBalance - bag.balance)} short`)
  if (bag.tier?.nextLoyalty) virgin.push(`Not ${bag.tier.nextLoyalty.name} for another ${Math.max(1, Math.ceil((Date.parse(bag.tier.nextLoyalty.at) - Date.now()) / 86_400_000))} days`)

  if (!chad.length) chad.push('Nothing. Has never bought a single token')
  if (!virgin.length) virgin.push('Nothing. Not one virgin trait. Disgusting')
  return { chad, virgin }
}

// The bag: who you are on the Virgin–Chad scale, what you hold, what it's done. Home of the suite.
export function Bag() {
  const { status, me, profile, join } = useIdentity()
  const { market, bag } = useBag()
  const live = livePosition(bag, market)
  const memberSince = me && me.state !== 'guest' ? me.account.memberSince : null
  const sym = `$${market?.symbol ?? 'VVC'}`

  if (status !== 'member' || !bag) {
    return (
      <div className="bag-view">
        <Panel
          verdict={null}
          virgin={['Doesn\'t hold ' + sym, 'Watches the chart from the sidelines', 'Says "it\'s just a meme coin"']}
          chad={['Holds ' + sym, 'Number go up', 'Gets free credits every week for it']}
          center={<GuestCenter market={market} />}
        />
        <div className="bag-actions">
          <button className="bag-btn bag-btn--buy" onClick={() => openBuyVvc()}>APE IN</button>
          {status !== 'member' && (
            <button className="bag-btn bag-btn--sell" onClick={() => join('track your bag')}>{status === 'pending' ? 'FINISH JOINING' : 'JOIN'}</button>
          )}
        </div>
        <Chart market={market} bag={null} />
      </div>
    )
  }

  const t = traits(bag, live, market, memberSince)
  const pnl = live?.pnlPct ?? null
  const verdict: 'chad' | 'virgin' = bag.balance <= 0 || (pnl !== null && pnl < 0) ? 'virgin' : 'chad'

  return (
    <div className="bag-view">
      <Panel
        verdict={verdict}
        virgin={t.virgin}
        chad={t.chad}
        center={<YouCenter bag={bag} live={live} verdict={verdict} portrait={profile ? profileImage(profile) : null} sym={sym} />}
      />
      <div className="bag-actions">
        <button className="bag-btn bag-btn--buy" onClick={() => openBuyVvc()}>APE IN</button>
        <button className="bag-btn bag-btn--sell" onClick={openSellVvc}>PAPER HAND IT</button>
      </div>
      <div className="bag-row">
        <Chart market={market} bag={bag} />
        <Receipts bag={bag} memberSince={memberSince} />
      </div>
      <Bags bag={bag} />
      <Trades bag={bag} />
      <Privacy bag={bag} />
    </div>
  )
}

/** The meme: Virgin on the left, Chad on the right, you in the middle. The side you're on lights up. */
function Panel({ verdict, virgin, chad, center }: { verdict: 'chad' | 'virgin' | null; virgin: string[]; chad: string[]; center: ReactNode }) {
  return (
    <section className={`bag-panel${verdict ? ` bag-panel--${verdict}` : ''}`}>
      <div className="bag-side bag-side--virgin">
        <img className="bag-side-art" src="/assets/chars/virgin.png" alt="" />
        <h2><small>The</small>Virgin you</h2>
        <ul>{virgin.map(v => <li key={v}>{v}</li>)}</ul>
      </div>
      <div className="bag-center">{center}</div>
      <div className="bag-side bag-side--chad">
        <img className="bag-side-art" src="/assets/chars/gigachad.webp" alt="" />
        <h2><small>The</small>Chad you</h2>
        <ul>{chad.map(c => <li key={c}>{c}</li>)}</ul>
      </div>
    </section>
  )
}

function YouCenter({ bag, live, verdict, portrait, sym }: {
  bag: BagData; live: ReturnType<typeof livePosition>; verdict: 'chad' | 'virgin'; portrait: string | null; sym: string
}) {
  const now = useNow()
  const value = useRolling(live?.valueUsd ?? null)
  const pnl = useRolling(live?.pnlPct ?? null)
  const held = bag.oldestBagSince ?? bag.holdingSince
  // Where you sit between Virgin (−100%) and Chad (+100% and up)
  const meter = live?.pnlPct == null ? (verdict === 'chad' ? 65 : 35) : Math.max(4, Math.min(96, 50 + live.pnlPct / 2))
  return (
    <>
      <div className={`bag-you bag-you--${verdict}`}>
        {portrait ? <img src={portrait} alt="You" /> : <span>?</span>}
        <i className="bag-vs">vs</i>
      </div>
      <div className={`bag-stamp bag-stamp--${verdict}`}>CERTIFIED {verdict === 'chad' ? 'CHAD' : 'VIRGIN'}</div>
      <div className="bag-meter" aria-label="Virgin to Chad">
        <div className="bag-meter-track"><div className="bag-meter-dot" style={{ left: `${meter}%` }} /></div>
      </div>
      <div className="bag-value">{fmtUsd(value)}</div>
      <div className="bag-sub">{fmtTokens(bag.balance)} {sym} · {fmtSol(live?.valueSol)}</div>
      <div className={`bag-pnl bag-pnl--${(live?.pnlPct ?? 0) >= 0 ? 'up' : 'down'}`}>
        {pnl === null ? (bag.syncing || !bag.synced ? '…' : 'no buys yet') : fmtPct(pnl)}
      </div>
      {held && <div className="bag-clock" title="Holding your oldest bag for">⏳ {since(held, now)}</div>}
      {(bag.syncing || !bag.synced) && <div className="bag-syncing">Reading your trades from the chain…</div>}
    </>
  )
}

function GuestCenter({ market }: { market: Market | null }) {
  return (
    <>
      <div className="bag-you bag-you--guest"><span>?</span><i className="bag-vs">vs</i></div>
      <div className="bag-stamp">WHICH ONE ARE YOU?</div>
      <div className="bag-value">{market ? (market.usd >= 1 ? `$${market.usd.toFixed(3)}` : `$${market.usd.toPrecision(4)}`) : '…'}</div>
      <div className={`bag-pnl bag-pnl--${(market?.change24h ?? 0) >= 0 ? 'up' : 'down'}`}>{fmtPct(market?.change24h)} <small>24h</small></div>
      <div className="bag-sub">Market cap {fmtUsd(market?.mcapUsd)}</div>
    </>
  )
}

function Receipts({ bag, memberSince }: { bag: BagData; memberSince: string | null }) {
  const now = useNow()
  const [config, setConfig] = useState<TokenConfig | null>(null)
  useEffect(() => { fetchTokenConfig().then(setConfig).catch(() => {}) }, [])
  const next = bag.tier?.nextLoyalty
  const tiers = config?.tiers ?? []
  const idx = bag.tier ? tiers.findIndex(t => t.key === bag.tier!.key) : -1
  return (
    <section className="bag-receipts">
      <h3 className="bag-h"><small>The</small>Receipts</h3>
      <dl>
        <dt>Member for</dt><dd>{memberSince ? `${daysSince(memberSince)} days` : '—'}</dd>
        <dt>Next level</dt><dd>{next ? <>{next.name} in <b>{until(next.at, now)}</b></> : bag.tier ? 'OG. Maxed out' : 'Become a Holder first'}</dd>
        <dt>Paid in</dt><dd>{bag.costSol > 0 ? fmtSol(bag.costSol) : '—'}</dd>
        <dt>Taken out</dt><dd>{bag.proceedsSol > 0 ? fmtSol(bag.proceedsSol) : '—'}</dd>
      </dl>
      {tiers.length > 0 && (
        <ol className="bag-ladder">
          {tiers.map((t, i) => (
            <li key={t.key} className={i < idx ? 'done' : i === idx ? 'here' : ''}>
              <span>{t.name}</span><small>{short(t.minBalance)}</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Chart({ market, bag }: { market: Market | null; bag: BagData | null }) {
  const W = 800, H = 200, PAD = 10
  const pts = market?.history ?? []
  const geo = useMemo(() => {
    if (pts.length < 2) return null
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0]
    const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]))
    const x = (t: number) => PAD + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * PAD)
    const y = (v: number) => H - PAD - ((v - lo) / Math.max(1e-12, hi - lo)) * (H - 2 * PAD)
    const line = pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')
    const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`
    const marks = (bag?.trades ?? [])
      .filter(t => (t.kind === 'buy' || t.kind === 'sell') && Date.parse(t.at) >= t0)
      .map(t => {
        const ts = Date.parse(t.at)
        const near = pts.reduce((a, b) => (Math.abs(b[0] - ts) < Math.abs(a[0] - ts) ? b : a))
        return { key: t.signature, kind: t.kind, cx: x(ts), cy: y(near[1]) }
      })
    return { line, area, marks, up: pts[pts.length - 1][1] >= pts[0][1] }
  }, [pts, bag?.trades])

  return (
    <section className="bag-chart">
      <h3 className="bag-h">
        <small>{market?.symbol ? `$${market.symbol}` : '$VVC'} · 24h</small>
        {geo ? (geo.up ? 'Number go up' : 'Number go down') : 'The chart'}
      </h3>
      {geo ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`bag-chart-svg ${geo.up ? 'is-up' : 'is-down'}`} aria-hidden>
          <polygon points={geo.area} className="bag-chart-area" />
          <polyline points={geo.line} fill="none" className="bag-chart-line" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {geo.marks.map(m => <circle key={m.key} cx={m.cx} cy={m.cy} r="6" className={`bag-mark bag-mark--${m.kind}`} />)}
        </svg>
      ) : (
        <div className="bag-chart-empty">The chart fills in as prices come in.</div>
      )}
      {bag && geo && geo.marks.length > 0 && <div className="bag-chart-legend"><i className="bag-mark--buy" /> you aped <i className="bag-mark--sell" /> you paper-handed</div>}
    </section>
  )
}

function Bags({ bag }: { bag: BagData }) {
  const now = useNow(60_000)
  if (!bag.lots.length) return null
  return (
    <section>
      <h3 className="bag-h"><small>Your</small>Bags</h3>
      <div className="bag-lots">
        {[...bag.lots].reverse().map(l => (
          <div key={l.since} className={`bag-lot${l.pnlPct !== null && l.pnlPct < 0 ? ' bag-lot--down' : ''}`}>
            <div className="bag-lot-sack" aria-hidden>💰</div>
            <div className="bag-lot-size">{short(l.tokens)}</div>
            {l.pnlPct !== null && <div className="bag-lot-pnl">{fmtPct(l.pnlPct)}</div>}
            <div className="bag-lot-meta">{Math.floor((now - Date.parse(l.since)) / 86_400_000)}d old · {l.entrySol !== null ? `in at ${l.entrySol.toPrecision(3)} SOL` : 'sent to you'}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

const KIND: Record<string, string> = { buy: 'Aped', sell: 'Paper-handed', in: 'Received', out: 'Sent' }

function Trades({ bag }: { bag: BagData }) {
  if (!bag.trades.length) return null
  return (
    <details className="bag-trades">
      <summary>Every trade ({bag.trades.length})</summary>
      {bag.trades.map(t => (
        <a key={t.signature} className={`bag-trade bag-trade--${t.kind}`} href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noopener noreferrer">
          <span>{KIND[t.kind]}</span>
          <span>{fmtTokens(Math.abs(t.tokens))}</span>
          <span>{t.sol ? fmtSol(Math.abs(t.sol)) : ''}</span>
          <span>{new Date(t.at).toLocaleDateString()}</span>
        </a>
      ))}
    </details>
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
      Flex my bag, PnL and hold time on my public profile
    </label>
  )
}
