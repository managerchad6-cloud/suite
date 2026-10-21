import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtPct, fmtUsd, livePosition } from '../api/bag'
import { useBag } from '../hooks/useBag'
import { useIdentity } from '../identity/IdentityProvider'
import { openBuyVvc } from '../api/credits'
import { isMuted, setMuted } from '../lib/sounds'
import './BagTicker.css'

const fmtPrice = (usd: number) => (usd >= 1 ? `$${usd.toFixed(3)}` : `$${usd.toPrecision(4)}`)

// The strip across the top of every page: the coin, live, and your bag in it.
export function BagTicker() {
  const navigate = useNavigate()
  const { status } = useIdentity()
  const { market, bag } = useBag()
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const [muted, setMutedState] = useState(isMuted)
  const lastPrice = useRef<number | null>(null)

  // Green or red flash on every price move
  useEffect(() => {
    if (!market) return
    const prev = lastPrice.current
    lastPrice.current = market.usd
    if (prev === null || prev === market.usd) return
    setFlash(market.usd > prev ? 'up' : 'down')
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [market?.usd])

  const live = livePosition(bag, market)
  const dir = (n: number | null | undefined) => (n == null ? '' : n >= 0 ? 'up' : 'down')

  return (
    <div className="bag-ticker" role="region" aria-label="$VVC ticker">
      <button className="bag-ticker-coin" onClick={() => navigate('/bag')}>
        <span className="bag-ticker-sym">${market?.symbol ?? 'VVC'}</span>
        <span className={`bag-ticker-price${flash ? ` bag-ticker-price--${flash}` : ''}`}>{market ? fmtPrice(market.usd) : '…'}</span>
        {market?.change24h != null && <span className={`bag-ticker-chg bag-${dir(market.change24h)}`}>{fmtPct(market.change24h)} 24h</span>}
        {market?.mcapUsd != null && <span className="bag-ticker-mc">MC {fmtUsd(market.mcapUsd)}</span>}
      </button>

      <div className="bag-ticker-right">
        {status === 'member' && bag ? (
          <button className="bag-ticker-mine" onClick={() => navigate('/bag')} title="Your bag">
            <span className="bag-ticker-label">Your bag</span>
            <strong>{fmtUsd(live?.valueUsd)}</strong>
            {live?.pnlPct != null && <span className={`bag-ticker-pnl bag-${dir(live.pnlPct)}`}>{fmtPct(live.pnlPct)}</span>}
          </button>
        ) : (
          <button className="bag-ticker-ape" onClick={() => openBuyVvc()}>Buy ${market?.symbol ?? 'VVC'}</button>
        )}
        <button
          className="bag-ticker-mute"
          onClick={() => { setMuted(!muted); setMutedState(!muted) }}
          title={muted ? 'Sound off' : 'Sound on'}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        >{muted ? '🔇' : '🔊'}</button>
      </div>
    </div>
  )
}
