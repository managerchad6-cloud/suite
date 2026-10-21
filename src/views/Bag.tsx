import { useEffect, useState } from 'react'
import {
  daysSince, fetchDex, fmtPct, fmtSol, fmtTokens, fmtUsd, livePosition, rankArt, setBagPublic, since, until, RANK_EVENT,
  fetchArena, subscribeStream,
  type ArenaTrade, type Bag as BagData, type Dex, type Market, type Pressure as LivePressure, type Rank, type RankEvent, type Window,
} from '../api/bag'
import { openBuyVvc, openSellVvc, fetchTokenConfig, type TokenConfig } from '../api/credits'
import { useBag, refreshBag } from '../hooks/useBag'
import { useIdentity } from '../identity/IdentityProvider'
import { profileImage } from '../identity/api'
import { MyChart } from '../components/MyChart'
import { Arena } from '../components/Arena'
import { Leaders } from '../components/Leaders'
import { TradePanel } from '../components/TradePanel'
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

/** The arena, live: latest trades (newest first), buys vs sells, and which trades just arrived. */
function useArena() {
  const [trades, setTrades] = useState<ArenaTrade[]>([])
  const [pressure, setPressure] = useState<LivePressure | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [last, setLast] = useState<ArenaTrade | null>(null)
  useEffect(() => {
    let stop = false
    fetchArena().then(a => { if (!stop) { setTrades(a.trades); setPressure(a.pressure) } }).catch(() => {})
    const offs = [
      subscribeStream('trade', t => {
        setTrades(prev => (prev.some(p => p.signature === t.signature) ? prev : [t, ...prev].slice(0, 60)))
        setFresh(prev => new Set(prev).add(t.signature))
        setTimeout(() => setFresh(prev => { const n = new Set(prev); n.delete(t.signature); return n }), 2000)
        setLast(t)
      }),
      subscribeStream('pressure', setPressure),
      subscribeStream('rank', r => setTrades(prev => prev.map(t => (t.signature === r.signature ? { ...t, rankTo: r.to } : t)))),
    ]
    return () => { stop = true; offs.forEach(off => off()) }
  }, [])
  return { trades, pressure, fresh, last }
}

const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : fmtTokens(n))
export function Bag() {
  const { status, me, profile, join, memberWallet } = useIdentity()
  const { market, bag } = useBag()
  const dex = useDex()
  const arena = useArena()
  const isMember = status === 'member' && !!bag
  const live = livePosition(isMember ? bag : null, market)
  const memberSince = me && me.state !== 'guest' ? me.account.memberSince : null

  return (
    <div className="bag-view">
      <section className="bag-room">
        <ChartRoom dex={dex} market={market} bag={isMember ? bag : null} />
        <aside className="bag-trade-col">
          <TradePanel market={market} dex={dex} bag={isMember ? bag : null} onJoin={status !== 'member' ? () => join('get ranked') : null} />
        </aside>
      </section>

      {/* Under the chart, like pump.fun's trades: the live arena, who's winning, the market */}
      <section className="bag-pit">
        <Arena trades={arena.trades} fresh={arena.fresh} me={memberWallet} wide />
        <div className="bag-pit-side">
          <Pressure dex={dex} live={arena.pressure} last={arena.last} />
          <Stats dex={dex} market={market} />
          <Pools dex={dex} />
        </div>
      </section>

      <Climb
        bag={isMember ? bag : null} live={live} market={market}
        portrait={profile ? profileImage(profile) : null}
        onJoin={status !== 'member' ? () => join('get ranked') : null}
        pending={status === 'pending'}
      />

      <Leaders me={memberWallet} />

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

// ─── The climb: your rank on the ladder, and how to get Chadder ──────────────

const TRAIT_ICON: Record<string, string> = { holding: '💎', hands: '🧻', bag: '💰', aping: '🦍', entries: '🎯', pnl: '📈', loyalty: '🫡' }

const DEFAULT_LADDER: Rank[] = ([
  ['incel', 'Incel', 0], ['virgin', 'Virgin', 10], ['lshad', 'Lshad', 25], ['shlad', 'Shlad', 32], ['cad', 'Cad', 39], ['basic', 'Basic', 47],
  ['brad', 'Brad', 55], ['lad', 'Lad', 62], ['boomer', 'Dad', 67], ['thad', 'Thad', 74], ['chad', 'Chad', 84], ['gigachad', 'Gigachad', 94],
] as const).map(([key, name, min]) => ({ key, name, min }))

function Climb({ bag, live, market, portrait, onJoin, pending }: {
  bag: BagData | null; live: ReturnType<typeof livePosition>; market: Market | null
  portrait: string | null; onJoin: (() => void) | null; pending: boolean
}) {
  const now = useNow()
  const game = bag?.game ?? null
  const value = useRolling(live?.valueUsd ?? null)
  const pnl = useRolling(live?.pnlPct ?? null)
  const held = bag ? bag.oldestBagSince ?? bag.holdingSince : null

  // Ranked up or down since this browser last looked: celebrate (or mourn) it
  useEffect(() => {
    if (!game || !bag) return
    const key = `vvc:rank:${bag.wallet}`
    let prev: number | null = null
    try {
      const v = localStorage.getItem(key)
      prev = v === null ? null : Number(v)
      localStorage.setItem(key, String(game.rank.index))
    } catch { return }
    if (prev === null || !Number.isFinite(prev) || prev === game.rank.index) return
    window.dispatchEvent(new CustomEvent<RankEvent>(RANK_EVENT, {
      detail: { dir: game.rank.index > prev ? 'up' : 'down', key: game.rank.key, name: game.rank.name },
    }))
  }, [game?.rank.index, bag?.wallet])  // eslint-disable-line react-hooks/exhaustive-deps

  const ladder = game?.ladder ?? DEFAULT_LADDER
  const rank = game?.rank ?? null
  const progress = rank?.next && game ? Math.max(0, Math.min(1, (game.score - rank.min) / (rank.next.min - rank.min))) : 1

  return (
    <section className={`climb${rank ? ` climb--${rank.index >= 6 ? 'chad' : 'virgin'}` : ''}`}>
      <div className="climb-you">
        <div className="climb-art">
          {rank ? <img src={rankArt(rank.key)} alt={rank.name} /> : <span>?</span>}
          {portrait && bag && <img className="climb-pfp" src={portrait} alt="You" />}
        </div>
        <div className="climb-who">
          <small>{rank ? "YOU'RE A" : 'WHICH ONE ARE YOU?'}</small>
          <h2>{rank ? rank.name : 'Unranked'}</h2>
          {game && <div className="climb-score">Chad score <b>{game.score}</b>/100</div>}
          {rank?.next ? (
            <div className="climb-progress">
              <div className="climb-bar"><i style={{ width: `${progress * 100}%` }} /></div>
              <span><b>{rank.next.points}</b> point{rank.next.points === 1 ? '' : 's'} to <img src={rankArt(rank.next.key)} alt="" /> <b>{rank.next.name}</b></span>
            </div>
          ) : rank ? (
            <div className="climb-progress climb-progress--max">Top of the ladder. Nothing above you but Zad.</div>
          ) : null}
          {onJoin && <button className="bag-join" onClick={onJoin}>{pending ? 'Finish joining' : 'Join to get ranked'}</button>}
        </div>
        {bag && (
          <div className="climb-nums">
            <div className="bag-num"><small>BAG</small><span className="bag-value">{fmtUsd(value)}</span><em>{short(bag.balance)} ${market?.symbol ?? 'VVC'}</em></div>
            <div className="bag-num"><small>PNL</small><span className={`bag-pnl bag-pnl--${(live?.pnlPct ?? 0) >= 0 ? 'up' : 'down'}`}>{pnl === null ? (bag.syncing || !bag.synced ? '…' : '—') : fmtPct(pnl)}</span><em>{live?.pnlSol != null ? `${live.pnlSol >= 0 ? '+' : ''}${fmtSol(live.pnlSol)}` : 'all bags'}</em></div>
            <div className="bag-num"><small>HOLDING</small><span className="bag-clock">{held ? since(held, now) : '—'}</span><em>oldest bag</em></div>
          </div>
        )}
      </div>

      <div className="climb-moves">
        <h3 className="bag-h"><small>Level up</small>How to get Chadder</h3>
        {game ? (
          <ol>
            {game.moves.slice(0, 5).map(m => (
              <li key={m.trait + m.text}>
                <span className="climb-icon" aria-hidden>{TRAIT_ICON[m.trait] ?? '⬆'}</span>
                <span className="climb-move">{m.text}</span>
                <b className={`climb-gain${m.gain && m.gain > 0 ? '' : ' climb-gain--none'}`}>{m.gain && m.gain > 0 ? `+${m.gain}` : '↗'}</b>
              </li>
            ))}
          </ol>
        ) : (
          <ol>
            <li><span className="climb-icon" aria-hidden>🦍</span><span className="climb-move">Ape in. Every real buy counts</span></li>
            <li><span className="climb-icon" aria-hidden>💎</span><span className="climb-move">Hold. Diamond hands climb by themselves</span></li>
            <li><span className="climb-icon" aria-hidden>🎯</span><span className="climb-move">Buy red candles, not green ones</span></li>
          </ol>
        )}
      </div>

      <ol className="climb-ladder" aria-label="The ladder">
        {ladder.map((r, i) => (
          <li key={r.key} className={!rank ? '' : i < rank.index ? 'done' : i === rank.index ? 'here' : i === rank.index + 1 ? 'next' : ''}>
            <img src={rankArt(r.key)} alt="" loading="lazy" />
            <span>{r.name}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── The chart room: DexScreener's TradingView chart, wrapped in the meme ────

/**
 * The chart room. MY CHART: your entries, your entry line and your profit/loss zones on the candles.
 * PRO TOOLS: DexScreener's full TradingView chart (indicators, drawing tools) for proper analysis.
 */
function ChartRoom({ dex, market, bag }: { dex: Dex | null; market: Market | null; bag: BagData | null }) {
  const [pair, setPair] = useState<string | null>(null)
  const [view, setView] = useState<'mine' | 'pro'>('mine')
  const active = pair ?? dex?.main?.pair ?? null
  const up = (dex?.change.h24 ?? market?.change24h ?? 0) >= 0
  const src = active
    ? `https://dexscreener.com/solana/${active}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=1&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15`
    : null
  return (
    <section className={`bag-chartroom${up ? ' is-up' : ' is-down'}`}>
      <header className="bag-chartroom-head">
        <h2 className="bag-h"><small>${market?.symbol ?? 'VVC'} · the chart room</small>{up ? 'Number go up' : 'Number go down'}</h2>
        <div className="bag-views" role="tablist" aria-label="Chart">
          <button role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>MY CHART</button>
          <button role="tab" aria-selected={view === 'pro'} className={view === 'pro' ? 'on' : ''} onClick={() => setView('pro')}>PRO TOOLS</button>
        </div>
        {view === 'pro' && dex && dex.pools.length > 1 && (
          <select className="bag-pool-pick" value={active ?? ''} onChange={e => setPair(e.target.value)} aria-label="Pool">
            {dex.pools.map(p => <option key={p.pair} value={p.pair}>{p.dex} · {p.quote} · {fmtUsd(p.liquidityUsd)}</option>)}
          </select>
        )}
      </header>
      <div className="bag-chart-frame">
        {view === 'mine' ? (
          <MyChart bag={bag} market={market} />
        ) : src ? (
          <iframe key={src} src={src} title="$VVC chart" loading="lazy" allow="clipboard-write" />
        ) : (
          <div className="bag-chart-empty">{dex ? 'No pool found for $VVC yet.' : 'Loading the chart…'}</div>
        )}
      </div>
      <footer className="bag-chartroom-foot">
        {view === 'mine'
          ? 'Prices in SOL, main pool. Gold above your entry, grey below it. Data: GeckoTerminal.'
          : 'Indicators, drawing tools and timeframes are in the chart. Data: DexScreener.'}
        {dex?.main && <a href={dex.main.url} target="_blank" rel="noopener noreferrer">Open full screen ↗</a>}
      </footer>
    </section>
  )
}

const WINDOWS: [Window, string][] = [['m5', '5m'], ['h1', '1h'], ['h6', '6h'], ['h24', '24h']]

/**
 * Who's winning: Chads buying vs Virgins selling, per timeframe. Live from the arena (every trade
 * moves it) where its log covers the window; DexScreener's counts (all pools, every 20s) otherwise.
 */
function Pressure({ dex, live, last }: { dex: Dex | null; live: LivePressure | null; last: ArenaTrade | null }) {
  const [w, setW] = useState<Window>('h1')
  const fromArena = !!live && !live[w].partial
  const t = fromArena ? live![w] : dex?.txns[w] ?? { buys: 0, sells: 0 }
  const total = t.buys + t.sells
  const buyShare = total ? t.buys / total : 0.5
  const verdict = !total ? 'Dead quiet. Even the virgins left' : buyShare >= 0.55 ? 'Chads are buying' : buyShare <= 0.45 ? 'Virgins are dumping' : 'Chads and virgins fighting it out'
  return (
    <div className="bag-box">
      <div className="bag-box-head">
        <h3 className="bag-h"><small>Who's winning{fromArena ? ' · live' : ''}</small>Chads vs virgins</h3>
        <div className="bag-tf bag-tf--small">
          {WINDOWS.map(([k, l]) => <button key={k} className={w === k ? 'on' : ''} onClick={() => setW(k)}>{l}</button>)}
        </div>
      </div>
      <div className={`bag-tug${last ? ` bag-tug--${last.kind}` : ''}`} key={last?.signature ?? 'tug'}>
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
