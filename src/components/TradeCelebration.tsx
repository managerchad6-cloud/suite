import { useEffect, useMemo, useRef, useState } from 'react'
import { RANK_EVENT, TRADE_EVENT, fmtTokens, rankArt, type RankEvent, type TradeEvent } from '../api/bag'
import { playBuy, playSell } from '../lib/sounds'
import './TradeCelebration.css'

const BUY_MS = 3400
const SELL_MS = 4800
const SELL_TEXT = 'you fucking virgin'
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// Buying is an event: Chad bursts in and calls you one. Selling drains the colour out of the suite.
// Ranking up on the Chad ladder gets the same treatment with your new rank; ranking down, the gloom.
// Mounted once in App; fire it with announceTrade() (or a RANK_EVENT) from anywhere.
export function TradeCelebration() {
  const [ev, setEv] = useState<(TradeEvent & { key: number; rank?: RankEvent }) | null>(null)
  const [typed, setTyped] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<TradeEvent>).detail
      if (!d) return
      if (timer.current) clearTimeout(timer.current)
      setTyped('')
      setEv({ ...d, key: Date.now() })
      if (d.side === 'buy') playBuy(); else playSell()
      timer.current = window.setTimeout(() => setEv(null), d.side === 'buy' ? BUY_MS : SELL_MS)
    }
    const onRank = (e: Event) => {
      const r = (e as CustomEvent<RankEvent>).detail
      if (!r) return
      if (timer.current) clearTimeout(timer.current)
      setTyped('')
      const side = r.dir === 'up' ? 'buy' : 'sell'
      setEv({ side, rank: r, key: Date.now() })
      if (side === 'buy') playBuy(); else playSell()
      timer.current = window.setTimeout(() => setEv(null), side === 'buy' ? BUY_MS : SELL_MS)
    }
    window.addEventListener(TRADE_EVENT, on)
    window.addEventListener(RANK_EVENT, onRank)
    return () => { window.removeEventListener(TRADE_EVENT, on); window.removeEventListener(RANK_EVENT, onRank) }
  }, [])

  // The whole suite reacts: shakes on a buy, goes grey on a sell
  useEffect(() => {
    const root = document.documentElement
    if (!ev) { root.classList.remove('vvc-shake', 'vvc-gloom'); return }
    if (reducedMotion()) return
    root.classList.add(ev.side === 'buy' ? 'vvc-shake' : 'vvc-gloom')
    const t = ev.side === 'buy' ? setTimeout(() => root.classList.remove('vvc-shake'), 700) : null
    return () => { if (t) clearTimeout(t) }
  }, [ev])

  // Typed out slowly, like it hurts
  useEffect(() => {
    if (ev?.side !== 'sell') return
    const text = ev.rank ? `demoted to ${ev.rank.name.toLowerCase()}` : SELL_TEXT
    let i = 0
    const id = setInterval(() => { setTyped(text.slice(0, ++i)); if (i >= text.length) clearInterval(id) }, 120)
    return () => clearInterval(id)
  }, [ev])

  const particles = useMemo(() => {
    if (!ev || reducedMotion()) return []
    const n = ev.side === 'buy' ? 34 : 60
    return Array.from({ length: n }, (_, i) => ({
      i,
      left: Math.random() * 100,
      delay: Math.random() * (ev.side === 'buy' ? 0.9 : 1.6),
      dur: ev.side === 'buy' ? 1.3 + Math.random() * 1.1 : 0.7 + Math.random() * 0.6,
      size: 18 + Math.random() * 22,
      glyph: ev.side === 'buy' ? ['💰', '💵', '🤑', '🚀', '💎'][i % 5] : '',
    }))
  }, [ev])

  if (!ev) return null
  const dismiss = () => { if (timer.current) clearTimeout(timer.current); setEv(null) }

  if (ev.side === 'buy') {
    return (
      <div key={ev.key} className="trade-fx trade-fx--buy" onClick={dismiss} role="status" aria-live="polite">
        <div className="trade-fx-flash" />
        {particles.map(p => (
          <span key={p.i} className="trade-fx-coin" style={{ left: `${p.left}%`, fontSize: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}>{p.glyph}</span>
        ))}
        <img className="trade-fx-chad" src={ev.rank ? rankArt(ev.rank.key) : '/assets/chars/chad.png'} alt="" />
        {ev.rank
          ? <div className="trade-fx-stamp">RANKED UP<br />YOU'RE A {ev.rank.name.toUpperCase()}</div>
          : <div className="trade-fx-stamp">YOU ABSOLUTE<br />FUCKING CHAD</div>}
        {!ev.rank && (ev.tokens || ev.tierUp) && (
          <div className="trade-fx-sub">
            {ev.tokens ? `+${fmtTokens(ev.tokens)} $VVC` : ''}{ev.tokens && ev.tierUp ? ' · ' : ''}{ev.tierUp ? `${ev.tierUp.toUpperCase()} UNLOCKED` : ''}
          </div>
        )}
      </div>
    )
  }

  return (
    <div key={ev.key} className="trade-fx trade-fx--sell" onClick={dismiss} role="status" aria-live="polite">
      {particles.map(p => (
        <span key={p.i} className="trade-fx-drop" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />
      ))}
      <img className="trade-fx-virgin" src={ev.rank ? rankArt(ev.rank.key) : '/assets/chars/virgin.png'} alt="" />
      <div className="trade-fx-typed">{typed}<span className="trade-fx-caret">|</span></div>
      <div className="trade-fx-paper">{ev.rank ? 'RANKED DOWN' : 'PAPER HANDS'}</div>
      {!ev.rank && ev.tokens ? <div className="trade-fx-sub trade-fx-sub--sell">−{fmtTokens(ev.tokens)} $VVC</div> : null}
    </div>
  )
}
