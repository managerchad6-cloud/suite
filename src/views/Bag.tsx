import { useEffect, useState } from 'react'
import {
  daysSince, fetchDex, fmtPct, fmtSol, fmtTokens, fmtUsd, livePosition, setBagPublic, since, until,
  type Bag as BagData, type Dex, type Market, type Window,
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

/** DexScreener's market data, refreshed every 20s while the page is open. */
function useDex() {
  const [dex, setDex] = useState<Dex | null>(null)
  useEffect(() => {
    let stop = false
    const load = () => fetchDex().then(d => { if (!stop) setDex(d) }).catch(() => {})
    load()
    const id = setInterval(load, 20_000)
    return () => { stop = true; clearInterval(id) }
  }, [])
  return dex
}

const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : fmtTokens(n))
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const logScale = (x: number, full: number) => clamp01(Math.log1p(Math.max(0, x)) / Math.log1p(full))

// ─── The score: six traits, each placed between Virgin (0) and Chad (1); the meter shows their average ────

interface Row { label: string; virgin: string; chad: string; you: string; pos: number | null }

function scorecard(bag: BagData | null, live: ReturnType<typeof livePosition>, memberSince: string | null): Row[] {
  if (!bag) {
    return [
      { label: 'PnL', virgin: 'Down bad, blames the devs', chad: 'In profit, says nothing', you: '?', pos: null },
      { label: 'Hands', virgin: 'Sells on every red candle', chad: 'Never sold a single token', you: '?', pos: null },
      { label: 'Holding', virgin: 'Flips within the hour', chad: 'Holds for months', you: '?', pos: null },
      { label: 'Bag', virgin: "Can't afford the minimum", chad: 'Kraken bag', you: '?', pos: null },
      { label: 'Aping', virgin: 'Bought once, cried', chad: 'Buys every dip', you: '?', pos: null },
      { label: 'Loyalty', virgin: 'Joined yesterday', chad: 'Here since day one', you: '?', pos: null },
    ]
  }
  const pnl = live?.pnlPct ?? null
  const bought = bag.trades.filter(t => t.kind === 'buy' || t.kind === 'in').reduce((s, t) => s + t.tokens, 0)
  const sold = bag.trades.filter(t => t.kind === 'sell').reduce((s, t) => s - t.tokens, 0)
  const buys = bag.trades.filter(t => t.kind === 'buy').length
  const held = bag.oldestBagSince ?? bag.holdingSince
  const heldDays = held ? daysSince(held) : 0
  const memberDays = memberSince ? daysSince(memberSince) : 0
  const tierPos: Record<string, number> = { holder: 0.45, bag: 0.65, whale: 0.85, kraken: 1 }
  return [
    { label: 'PnL', virgin: 'Down bad, blames the devs', chad: 'In profit, says nothing',
      you: pnl === null ? 'no buys yet' : fmtPct(pnl), pos: pnl === null ? null : clamp01(0.5 + pnl / 200) },
    { label: 'Hands', virgin: 'Sells on every red candle', chad: 'Never sold a single token',
      you: sold > 0 ? `sold ${short(sold)}` : bought > 0 ? 'never sold' : '—', pos: bought > 0 ? clamp01(1 - sold / bought) : null },
    { label: 'Holding', virgin: 'Flips within the hour', chad: 'Holds for months',
      you: held ? `${heldDays}d` : '—', pos: held ? logScale(heldDays, 90) : null },
    { label: 'Bag', virgin: "Can't afford the minimum", chad: 'Kraken bag',
      you: bag.tier ? bag.tier.name : `${short(bag.balance)} $VVC`, pos: bag.tier ? tierPos[bag.tier.key] ?? 0.45 : 0.08 },
    { label: 'Aping', virgin: 'Bought once, cried', chad: 'Buys every dip',
      you: `${buys} buy${buys === 1 ? '' : 's'}`, pos: clamp01(buys / 8) },
    { label: 'Loyalty', virgin: 'Joined yesterday', chad: 'Here since day one',
      you: memberSince ? `${memberDays}d member` : '—', pos: memberSince ? logScale(memberDays, 120) : null },
  ]
}

export function Bag() {
  const { status, me, profile, join } = useIdentity()
  const { market, bag } = useBag()
  const dex = useDex()
  const isMember = status === 'member' && !!bag
  const live = livePosition(isMember ? bag : null, market)
  const memberSince = me && me.state !== 'guest' ? me.account.memberSince : null
  const rows = scorecard(isMember ? bag : null, live, memberSince)
  const scored = rows.filter(r => r.pos !== null)
  const score = scored.length ? Math.round((scored.reduce((s, r) => s + r.pos!, 0) / scored.length) * 100) : null
  const verdict = score === null ? null : score >= 50 ? 'chad' : 'virgin'

  return (
    <div className="bag-view">
      <section className="bag-room">
        <ChartRoom dex={dex} market={market} />
        <aside className="bag-side-panel">
          <div className="bag-actions">
            <button className="bag-btn bag-btn--buy" onClick={() => openBuyVvc()}>APE IN</button>
            <button className="bag-btn bag-btn--sell" onClick={openSellVvc}>PAPER HAND IT</button>
          </div>
          <Pressure dex={dex} />
          <Stats dex={dex} market={market} />
          <Pools dex={dex} />
        </aside>
      </section>

      <YouStrip
        bag={isMember ? bag : null} live={live} verdict={verdict} score={score} market={market}
        portrait={profile ? profileImage(profile) : null}
        onJoin={status !== 'member' ? () => join('track your bag') : null}
        pending={status === 'pending'}
      />


      {isMember && (
        <section className="bag-bottom">
          <Bags bag={bag!} />
          <Receipts bag={bag!} memberSince={memberSince} />
        </section>
      )}
      {isMember && <Trades bag={bag!} />}
      {isMember && <Privacy bag={bag!} />}
    </div>
  )
}

/** You on one Virgin–Chad meter: the verdict, the score, and your bag in a single strip. */
function YouStrip({ bag, live, verdict, score, market, portrait, onJoin, pending }: {
  bag: BagData | null; live: ReturnType<typeof livePosition>; verdict: 'chad' | 'virgin' | null; score: number | null
  market: Market | null; portrait: string | null; onJoin: (() => void) | null; pending: boolean
}) {
  const now = useNow()
  const value = useRolling(live?.valueUsd ?? null)
  const pnl = useRolling(live?.pnlPct ?? null)
  const held = bag ? bag.oldestBagSince ?? bag.holdingSince : null
  const at = score === null ? 50 : Math.max(6, Math.min(94, score))
  return (
    <section className={`bag-strip${verdict ? ` bag-strip--${verdict}` : ''}`}>
      <img className="bag-strip-char bag-strip-char--virgin" src="/assets/chars/virgin.png" alt="The Virgin" />
      <div className="bag-strip-you">
        <div className={`bag-you${verdict ? ` bag-you--${verdict}` : ''}`}>
          {portrait && bag ? <img src={portrait} alt="You" /> : <span>?</span>}
        </div>
        <div className={`bag-stamp${verdict ? ` bag-stamp--${verdict}` : ''}`}>
          {verdict ? `CERTIFIED ${verdict === 'chad' ? 'CHAD' : 'VIRGIN'}` : 'WHICH ONE ARE YOU?'}
        </div>
      </div>
      <div className="bag-meter" aria-label={score === null ? 'Virgin to Chad' : `Chad score ${score} out of 100`}>
        <span className="bag-meter-end bag-meter-end--virgin">VIRGIN</span>
        <div className="bag-meter-track">
          <b className={`bag-meter-you${verdict ? ` is-${verdict}` : ''}`} style={{ left: `${at}%` }}>{score === null ? '?' : score}</b>
        </div>
        <span className="bag-meter-end bag-meter-end--chad">CHAD</span>
      </div>
      {bag ? (
        <div className="bag-strip-nums">
          <div className="bag-num"><small>BAG</small><span className="bag-value">{fmtUsd(value)}</span><em>{short(bag.balance)} ${market?.symbol ?? 'VVC'}</em></div>
          <div className="bag-num"><small>PNL</small><span className={`bag-pnl bag-pnl--${(live?.pnlPct ?? 0) >= 0 ? 'up' : 'down'}`}>{pnl === null ? (bag.syncing || !bag.synced ? '…' : '—') : fmtPct(pnl)}</span><em>{live?.pnlSol != null ? `${live.pnlSol >= 0 ? '+' : ''}${fmtSol(live.pnlSol)}` : 'all bags'}</em></div>
          <div className="bag-num"><small>HOLDING</small><span className="bag-clock">{held ? since(held, now) : '—'}</span><em>oldest bag</em></div>
        </div>
      ) : onJoin ? (
        <button className="bag-join" onClick={onJoin}>{pending ? 'Finish joining' : 'Join to find out'}</button>
      ) : null}
      <img className="bag-strip-char bag-strip-char--chad" src="/assets/chars/chad.png" alt="The Chad" />
    </section>
  )
}

// ─── The chart room: DexScreener's TradingView chart, wrapped in the meme ────

function ChartRoom({ dex, market }: { dex: Dex | null; market: Market | null }) {
  const [pair, setPair] = useState<string | null>(null)
  const active = pair ?? dex?.main?.pair ?? null
  const up = (dex?.change.h24 ?? market?.change24h ?? 0) >= 0
  const src = active
    ? `https://dexscreener.com/solana/${active}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=1&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15`
    : null
  return (
    <section className={`bag-chartroom${up ? ' is-up' : ' is-down'}`}>
      <header className="bag-chartroom-head">
        <h2 className="bag-h"><small>${market?.symbol ?? 'VVC'} · the chart room</small>{up ? 'Number go up' : 'Number go down'}</h2>
        {dex && dex.pools.length > 1 && (
          <select className="bag-pool-pick" value={active ?? ''} onChange={e => setPair(e.target.value)} aria-label="Pool">
            {dex.pools.map(p => <option key={p.pair} value={p.pair}>{p.dex} · {p.quote} · {fmtUsd(p.liquidityUsd)}</option>)}
          </select>
        )}
      </header>
      <div className="bag-chart-frame">
        {src ? (
          <iframe key={src} src={src} title="$VVC chart" loading="lazy" allow="clipboard-write" />
        ) : (
          <div className="bag-chart-empty">{dex ? 'No pool found for $VVC yet.' : 'Loading the chart…'}</div>
        )}
      </div>
      <footer className="bag-chartroom-foot">
        Indicators, drawing tools and timeframes are in the chart. Data: DexScreener.
        {dex?.main && <a href={dex.main.url} target="_blank" rel="noopener noreferrer">Open full screen ↗</a>}
      </footer>
    </section>
  )
}

const WINDOWS: [Window, string][] = [['m5', '5m'], ['h1', '1h'], ['h6', '6h'], ['h24', '24h']]

/** Who's winning: Chads buying vs Virgins selling, per timeframe. */
function Pressure({ dex }: { dex: Dex | null }) {
  const [w, setW] = useState<Window>('h1')
  const t = dex?.txns[w] ?? { buys: 0, sells: 0 }
  const total = t.buys + t.sells
  const buyShare = total ? t.buys / total : 0.5
  const verdict = !total ? 'Dead quiet. Even the virgins left' : buyShare >= 0.55 ? 'Chads are buying' : buyShare <= 0.45 ? 'Virgins are dumping' : 'Chads and virgins fighting it out'
  return (
    <div className="bag-box">
      <div className="bag-box-head">
        <h3 className="bag-h"><small>Who's winning</small>Chads vs virgins</h3>
        <div className="bag-tf bag-tf--small">
          {WINDOWS.map(([k, l]) => <button key={k} className={w === k ? 'on' : ''} onClick={() => setW(k)}>{l}</button>)}
        </div>
      </div>
      <div className="bag-tug">
        <div className="bag-tug-chad" style={{ width: `${buyShare * 100}%` }}><span>{t.buys} buys</span></div>
        <div className="bag-tug-virgin"><span>{t.sells} sells</span></div>
      </div>
      <div className={`bag-tug-verdict ${buyShare >= 0.5 ? 'is-chad' : 'is-virgin'}`}>{verdict}</div>
      <div className="bag-changes">
        {WINDOWS.map(([k, l]) => {
          const c = dex?.change[k] ?? null
          return (
            <div key={k} className={c == null ? '' : c >= 0 ? 'is-up' : 'is-down'}>
              <small>{l}</small><b>{c == null ? '—' : fmtPct(c)}</b><em>vol {fmtUsd(dex?.volume[k] ?? null)}</em>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stats({ dex, market }: { dex: Dex | null; market: Market | null }) {
  const age = dex?.createdAt ? daysSince(new Date(dex.createdAt).toISOString()) : null
  const t24 = dex?.txns.h24
  const items: [string, string][] = [
    ['Price', dex?.priceUsd != null ? `$${dex.priceUsd.toPrecision(4)}` : market ? `$${market.usd.toPrecision(4)}` : '—'],
    ['In SOL', market ? market.sol.toPrecision(3) : '—'],
    ['Market cap', fmtUsd(dex?.marketCap ?? market?.mcapUsd ?? null)],
    ['FDV', fmtUsd(dex?.fdv ?? null)],
    ['Liquidity', fmtUsd(dex?.liquidityUsd ?? null)],
    ['Volume 24h', fmtUsd(dex?.volume.h24 ?? null)],
    ['Trades 24h', t24 ? (t24.buys + t24.sells).toLocaleString() : '—'],
    ['Age', age !== null ? `${age} days` : '—'],
  ]
  return (
    <div className="bag-box">
      <h3 className="bag-h"><small>The tape</small>Market</h3>
      <dl className="bag-stats">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  )
}

function Pools({ dex }: { dex: Dex | null }) {
  if (!dex?.pools.length) return null
  const total = dex.pools.reduce((s, p) => s + p.liquidityUsd, 0) || 1
  return (
    <div className="bag-box">
      <h3 className="bag-h"><small>Where it trades</small>Pools</h3>
      <ul className="bag-pools">
        {dex.pools.map(p => (
          <li key={p.pair}>
            <span>{p.dex} <small>/{p.quote}</small></span>
            <i style={{ width: `${(p.liquidityUsd / total) * 100}%` }} />
            <b>{fmtUsd(p.liquidityUsd)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Your stuff ──────────────────────────────────────────────────────────────

function Receipts({ bag, memberSince }: { bag: BagData; memberSince: string | null }) {
  const now = useNow()
  const [config, setConfig] = useState<TokenConfig | null>(null)
  useEffect(() => { fetchTokenConfig().then(setConfig).catch(() => {}) }, [])
  const next = bag.tier?.nextLoyalty
  const tiers = config?.tiers ?? []
  const idx = bag.tier ? tiers.findIndex(t => t.key === bag.tier!.key) : -1
  return (
    <div className="bag-box">
      <h3 className="bag-h"><small>The</small>Receipts</h3>
      <dl className="bag-stats">
        <div><dt>Member for</dt><dd>{memberSince ? `${daysSince(memberSince)} days` : '—'}</dd></div>
        <div><dt>Next level</dt><dd>{next ? <>{next.name} in <b>{until(next.at, now)}</b></> : bag.tier ? 'OG. Maxed out' : 'Become a Holder'}</dd></div>
        <div><dt>Paid in</dt><dd>{bag.costSol > 0 ? fmtSol(bag.costSol) : '—'}</dd></div>
        <div><dt>Taken out</dt><dd>{bag.proceedsSol > 0 ? fmtSol(bag.proceedsSol) : '—'}</dd></div>
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
    </div>
  )
}

function Bags({ bag }: { bag: BagData }) {
  const now = useNow(60_000)
  return (
    <div className="bag-box">
      <h3 className="bag-h"><small>Your</small>Bags</h3>
      {bag.lots.length ? (
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
      ) : (
        <p className="bag-empty">No bags yet. Ape in and the first one shows up here.</p>
      )}
    </div>
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
