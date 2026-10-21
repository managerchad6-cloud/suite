import { useState } from 'react'
import { fmtSol, fmtTokens, fmtUsd, fmtPct, rankArt, type Bag, type Dex, type Market } from '../api/bag'
import { openBuyVvc, openSellVvc } from '../api/credits'
import './TradePanel.css'

// The one place to trade, pump.fun style: Buy / Sell, an amount with quick picks, what you'd get,
// where it would put you on the Chad ladder, and one big button that opens the swap with that amount.

const BUY_PICKS = [0.1, 0.5, 1, 5]
const SELL_PICKS = [25, 50, 75, 100]
const trim = (n: number) => String(Number(n.toPrecision(6)))

/** The what-if point nearest this SOL amount (log scale), from the server's 0.1–10 SOL table. */
function projected(bag: Bag | null, sol: number) {
  const pts = bag?.game?.whatIf ?? []
  if (!pts.length || !(sol > 0)) return null
  return pts.reduce((a, b) => (Math.abs(Math.log(b.sol / sol)) < Math.abs(Math.log(a.sol / sol)) ? b : a))
}

export function TradePanel({ market, dex, bag, onJoin }: { market: Market | null; dex: Dex | null; bag: Bag | null; onJoin: (() => void) | null }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0.5')
  const [hint, setHint] = useState<string | null>(null)
  const sym = `$${market?.symbol ?? 'VVC'}`
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0
  const balance = bag?.balance ?? 0

  const switchSide = (s: 'buy' | 'sell') => {
    setSide(s)
    setHint(null)
    setAmount(s === 'buy' ? '0.5' : balance > 0 ? trim(balance / 2) : '')
  }

  const go = () => {
    if (!valid) { setHint(side === 'buy' ? 'Pick how much SOL to ape' : `Pick how much ${sym} to sell`); return }
    if (side === 'sell' && n > balance) { setHint(`You only have ${fmtTokens(balance)} ${sym}`); return }
    setHint(null)
    if (side === 'buy') openBuyVvc(trim(n)); else openSellVvc(trim(n))
  }

  // What you'd get, at today's price (the swap shows the exact quote)
  const getTokens = side === 'buy' && valid && market?.sol ? n / market.sol : null
  const getSol = side === 'sell' && valid && market?.sol ? n * market.sol : null
  const proj = side === 'buy' && valid ? projected(bag, n) : null
  const score = bag?.game?.score ?? null

  return (
    <div className={`trade trade--${side}`}>
      <div className="trade-tabs" role="tablist" aria-label="Buy or sell">
        <button role="tab" aria-selected={side === 'buy'} className={side === 'buy' ? 'on' : ''} onClick={() => switchSide('buy')}>BUY</button>
        <button role="tab" aria-selected={side === 'sell'} className={side === 'sell' ? 'on' : ''} onClick={() => switchSide('sell')}>SELL</button>
      </div>

      <label className="trade-input">
        <input
          inputMode="decimal" value={amount} placeholder="0.0" aria-label={side === 'buy' ? 'SOL to spend' : `${sym} to sell`}
          onChange={e => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); setHint(null) }}
        />
        <span>{side === 'buy' ? 'SOL' : sym}</span>
      </label>

      <div className="trade-picks">
        <button onClick={() => setAmount('')}>reset</button>
        {side === 'buy'
          ? BUY_PICKS.map(p => <button key={p} className={n === p ? 'on' : ''} onClick={() => setAmount(String(p))}>{p} SOL</button>)
          : SELL_PICKS.map(p => <button key={p} onClick={() => setAmount(balance > 0 ? trim((balance * p) / 100) : '')} disabled={balance <= 0}>{p}%</button>)}
      </div>

      <div className="trade-get">
        {side === 'buy'
          ? <>You get <b>≈ {getTokens ? fmtTokens(getTokens) : '—'} {sym}</b></>
          : <>You get <b>≈ {getSol ? fmtSol(getSol) : '—'}</b>{balance > 0 && <em> · you hold {fmtTokens(balance)}</em>}</>}
      </div>

      {side === 'buy' ? (
        proj && score !== null ? (
          <div className={`trade-rank${proj.score > score ? ' is-up' : ''}`}>
            <img src={rankArt(proj.rank.key)} alt="" />
            <span>→ you'd be a <b>{proj.rank.name}</b></span>
            <em>{proj.score > score ? `+${proj.score - score}` : '±0'} · {proj.score}/100</em>
          </div>
        ) : (
          <div className="trade-rank trade-rank--none">Every real buy climbs the Chad ladder</div>
        )
      ) : (
        <div className="trade-rank trade-rank--sell">🧻 Paper hands cost you Chad points (they fade if you hold after)</div>
      )}

      {onJoin && side === 'buy' && <button className="trade-join" onClick={onJoin}>Join to get ranked</button>}

      <button className="trade-go" onClick={go}>
        {side === 'buy' ? `APE ${valid ? trim(n) : ''} SOL` : `PAPER HAND ${valid ? fmtTokens(n) : ''}`}
      </button>
      {hint && <div className="trade-hint" role="alert">{hint}</div>}

      <dl className="trade-facts">
        <div><dt>Price</dt><dd>{market ? `$${market.usd.toPrecision(4)}` : '—'}</dd></div>
        <div><dt>24h</dt><dd className={(market?.change24h ?? 0) >= 0 ? 'is-up' : 'is-down'}>{fmtPct(market?.change24h)}</dd></div>
        <div><dt>Market cap</dt><dd>{fmtUsd(dex?.marketCap ?? market?.mcapUsd ?? null)}</dd></div>
        <div><dt>Liquidity</dt><dd>{fmtUsd(dex?.liquidityUsd ?? null)}</dd></div>
      </dl>
    </div>
  )
}
