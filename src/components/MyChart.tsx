import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type IPriceLine, type SeriesMarker, type Time, type UTCTimestamp,
} from 'lightweight-charts'
import { fetchCandles, fmtPct, type Bag, type ChartTf, type Market } from '../api/bag'
import './MyChart.css'

// Your own chart: $VVC candles in SOL with your buys and sells on them, a line at your average
// entry, and everything above it shaded Chad gold (profit) and below it Virgin grey (loss).
// Hover any candle to see what you'd be up or down if you sold there.

const TFS: ChartTf[] = ['1m', '5m', '15m', '1h', '4h', '1d']
const GOLD = '#F0A020', GOLD_HI = '#ffd27a', VIRGIN = '#8a90ad', VIRGIN_HI = '#c9cde0'
const fmtSolPrice = (p: number) => (p >= 1 ? p.toFixed(3) : p.toPrecision(4))
const shortTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)))

/** Average entry (SOL per token) of the bags you still hold that had a known cost. */
export function averageEntry(bag: Bag | null): number | null {
  if (!bag) return null
  let tokens = 0, cost = 0
  for (const l of bag.lots) if (l.entrySol !== null) { tokens += l.tokens; cost += l.tokens * l.entrySol }
  return tokens > 0 ? cost / tokens : null
}

export function MyChart({ bag, market }: { bag: Bag | null; market: Market | null }) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const zone = useRef<ISeriesApi<'Baseline'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const entryLine = useRef<IPriceLine | null>(null)
  const lastBar = useRef<{ time: UTCTimestamp; open: number; high: number; low: number; close: number } | null>(null)
  const [tf, setTf] = useState<ChartTf>('15m')
  const [rows, setRows] = useState<[number, number, number, number, number, number][] | null>(null)
  const [error, setError] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const entry = averageEntry(bag)

  // The chart itself, once
  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0e0e0e' }, textColor: '#8a8a8a', fontSize: 11 },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
      rightPriceScale: { borderColor: '#262626', scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderColor: '#262626', timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#555', labelBackgroundColor: '#2a2a2a' }, horzLine: { color: '#555', labelBackgroundColor: '#2a2a2a' } },
      localization: { priceFormatter: fmtSolPrice },
    })
    const priceFormat = { type: 'custom' as const, formatter: fmtSolPrice, minMove: 1e-12 }
    // The profit/loss shading goes first so it sits behind the candles
    zone.current = c.addBaselineSeries({
      priceFormat,
      topFillColor1: 'rgba(240, 160, 32, 0.24)', topFillColor2: 'rgba(240, 160, 32, 0.03)',
      bottomFillColor1: 'rgba(93, 98, 128, 0.03)', bottomFillColor2: 'rgba(93, 98, 128, 0.32)',
      topLineColor: 'rgba(0, 0, 0, 0)', bottomLineColor: 'rgba(0, 0, 0, 0)',
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false,
    })
    candles.current = c.addCandlestickSeries({
      priceFormat,
      upColor: GOLD, downColor: VIRGIN, borderUpColor: GOLD, borderDownColor: VIRGIN, wickUpColor: GOLD_HI, wickDownColor: VIRGIN,
    })
    volume.current = c.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })
    c.subscribeCrosshairMove(p => {
      const d = p.seriesData.get(candles.current!) as { close?: number } | undefined
      setHover(d?.close ?? null)
    })
    chart.current = c
    return () => { c.remove(); chart.current = null }
  }, [])

  // Candles for the timeframe (refreshed every 30s)
  useEffect(() => {
    let stop = false
    const load = () => fetchCandles(tf)
      .then(r => { if (!stop) { setRows(r.candles); setError(false) } })
      .catch(() => { if (!stop) setError(true) })
    setRows(null)
    load()
    const id = setInterval(load, 30_000)
    return () => { stop = true; clearInterval(id) }
  }, [tf])

  useEffect(() => {
    if (!rows || !candles.current || !volume.current || !zone.current) return
    const bars = rows.map(([t, o, h, l, c]) => ({ time: t as UTCTimestamp, open: o, high: h, low: l, close: c }))
    candles.current.setData(bars)
    volume.current.setData(rows.map(([t, o, , , c, v]) => ({ time: t as UTCTimestamp, value: v, color: c >= o ? 'rgba(240, 160, 32, 0.35)' : 'rgba(138, 144, 173, 0.35)' })))
    zone.current.setData(bars.map(b => ({ time: b.time, value: b.close })))
    lastBar.current = bars[bars.length - 1] ?? null
    chart.current?.timeScale().fitContent()
  }, [rows])

  // The live price moves the last candle between refreshes
  useEffect(() => {
    const b = lastBar.current
    if (!b || !market?.sol || !candles.current) return
    const next = { ...b, close: market.sol, high: Math.max(b.high, market.sol), low: Math.min(b.low, market.sol) }
    lastBar.current = next
    candles.current.update(next)
    zone.current?.update({ time: next.time, value: next.close })
  }, [market?.sol])

  // Your entry: the dashed line and the gold/grey zones around it
  useEffect(() => {
    const s = candles.current
    if (!s || !zone.current) return
    if (entryLine.current) { s.removePriceLine(entryLine.current); entryLine.current = null }
    zone.current.applyOptions({ visible: entry !== null, baseValue: { type: 'price', price: entry ?? 0 } })
    if (entry !== null) {
      entryLine.current = s.createPriceLine({ price: entry, color: GOLD_HI, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'YOUR ENTRY' })
    }
  }, [entry])

  // Your buys and sells, on the candle they happened in
  const markers = useMemo(() => {
    if (!rows?.length || !bag) return []
    const times = rows.map(r => r[0])
    const out: SeriesMarker<Time>[] = []
    for (const t of [...bag.trades].reverse()) {
      if (t.kind !== 'buy' && t.kind !== 'sell') continue
      const s = Math.floor(Date.parse(t.at) / 1000)
      if (s < times[0]) continue
      let i = times.length - 1
      while (i > 0 && times[i] > s) i--
      const buy = t.kind === 'buy'
      out.push({
        time: times[i] as UTCTimestamp,
        position: buy ? 'belowBar' : 'aboveBar',
        shape: buy ? 'arrowUp' : 'arrowDown',
        color: buy ? GOLD_HI : VIRGIN_HI,
        text: `${buy ? 'APE' : 'PAPER'} ${shortTokens(Math.abs(t.tokens))}`,
        size: 1.4,
      })
    }
    return out.sort((a, b) => (a.time as number) - (b.time as number))
  }, [rows, bag])
  useEffect(() => { candles.current?.setMarkers(markers) }, [markers])

  const now = market?.sol ?? (rows?.length ? rows[rows.length - 1][4] : null)
  const pnlNow = entry && now ? (now / entry - 1) * 100 : null
  const pnlHover = entry && hover ? (hover / entry - 1) * 100 : null
  const hiddenTrades = bag ? bag.trades.filter(t => (t.kind === 'buy' || t.kind === 'sell') && rows?.length && Date.parse(t.at) / 1000 < rows[0][0]).length : 0

  return (
    <div className="mychart">
      <div className="mychart-bar">
        <div className="mychart-tfs" role="group" aria-label="Timeframe">
          {TFS.map(t => <button key={t} className={tf === t ? 'on' : ''} onClick={() => setTf(t)}>{t}</button>)}
        </div>
        <span className="mychart-legend">
          <i className="mychart-key mychart-key--ape" /> you aped <i className="mychart-key mychart-key--paper" /> you paper-handed
          {entry !== null && <><i className="mychart-key mychart-key--entry" /> your entry</>}
        </span>
      </div>
      <div className="mychart-stage">
        <div ref={box} className="mychart-canvas" />
        <div className="mychart-hud">
          {entry === null ? (
            <div className="mychart-hud-none">{bag ? 'No entries yet. Ape in and your entry shows up here.' : 'Join and hold $VVC to see your entries here.'}</div>
          ) : (
            <>
              <div className={`mychart-hud-pnl ${pnlNow !== null && pnlNow >= 0 ? 'is-chad' : 'is-virgin'}`}>
                {fmtPct(pnlNow)} <small>from your entry</small>
              </div>
              <div className="mychart-hud-sub">Entry {fmtSolPrice(entry)} SOL · now {now ? fmtSolPrice(now) : '—'} SOL</div>
              {pnlHover !== null && (
                <div className={`mychart-hud-hover ${pnlHover >= 0 ? 'is-chad' : 'is-virgin'}`}>If you sold at this candle: <b>{fmtPct(pnlHover)}</b></div>
              )}
            </>
          )}
        </div>
        {!rows && <div className="mychart-msg">{error ? 'Chart data unavailable right now.' : 'Loading candles…'}</div>}
      </div>
      {hiddenTrades > 0 && <div className="mychart-note">{hiddenTrades} older trade{hiddenTrades === 1 ? '' : 's'} before this window. Pick a longer timeframe to see {hiddenTrades === 1 ? 'it' : 'them'}.</div>}
    </div>
  )
}
