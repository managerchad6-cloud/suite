import { useEffect, useMemo, useRef, useState } from 'react'
import { TRADE_EVENT, fmtTokens, type TradeEvent } from '../api/bag'
import { playBuy, playSell } from '../lib/sounds'
import './TradeCelebration.css'

const BUY_MS = 3400
const SELL_MS = 4800
const SELL_TEXT = 'you fucking virgin'
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// Buying is an event: Chad bursts in and calls you one. Selling drains the colour out of the suite.
// Mounted once in App; fire it with announceTrade() from anywhere.
export function TradeCelebration() {
  const [ev, setEv] = useState<(TradeEvent & { key: number }) | null>(null)
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
    window.addEventListener(TRADE_EVENT, on)
    return () => window.removeEventListener(TRADE_EVENT, on)
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
    let i = 0
    const id = setInterval(() => { setTyped(SELL_TEXT.slice(0, ++i)); if (i >= SELL_TEXT.length) clearInterval(id) }, 120)
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
        <img className="trade-fx-chad" src="/assets/chars/chad.png" alt="" />
        <div className="trade-fx-stamp">YOU ABSOLUTE<br />FUCKING CHAD</div>
        {(ev.tokens || ev.tierUp) && (
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
      <img className="trade-fx-virgin" src="/assets/chars/virgin.png" alt="" />
      <div className="trade-fx-typed">{typed}<span className="trade-fx-caret">|</span></div>
      <div className="trade-fx-paper">PAPER HANDS</div>
      {ev.tokens ? <div className="trade-fx-sub trade-fx-sub--sell">−{fmtTokens(ev.tokens)} $VVC</div> : null}
    </div>
  )
}
