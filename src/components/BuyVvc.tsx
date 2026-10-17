// "Buy $VVC": why to hold it (free credits every week), where the member stands, and a Jupiter swap
// right here, so getting the token is one step. After a swap the server re-reads the balance and
// tops up the free credits at once.
//
// <BuyVvcHost/> is mounted once in App; anything opens it with openBuyVvc() (api/credits).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useIdentity } from '../identity/IdentityProvider'
import {
  checkHolderNow, fetchHolderStatus, fetchTokenConfig, openBuyVvc,
  type HolderStatus, type TokenConfig,
} from '../api/credits'
import { Confetti } from './Confetti'
import './BuyVvc.css'

const JUPITER_SCRIPT = 'https://plugin.jup.ag/plugin-v1.js'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const TARGET_ID = 'vvc-jupiter-swap'
// The server allows a forced re-read every ~20s: check soon after the swap, then again
const RECHECK_DELAYS_MS = [2_000, 22_000, 45_000]

interface JupiterPlugin {
  init(opts: Record<string, unknown>): void
  close?(): void
}
type WinJup = Window & { Jupiter?: JupiterPlugin }

let scriptLoad: Promise<JupiterPlugin> | null = null
function loadJupiter(): Promise<JupiterPlugin> {
  const w = window as WinJup
  if (w.Jupiter) return Promise.resolve(w.Jupiter)
  scriptLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = JUPITER_SCRIPT
    s.async = true
    s.onload = () => (w.Jupiter ? resolve(w.Jupiter) : reject(new Error('Swap failed to load')))
    s.onerror = () => { scriptLoad = null; s.remove(); reject(new Error('Swap failed to load')) }
    document.head.appendChild(s)
  })
  return scriptLoad
}

/** The account the wallet extension is on right now (the one Jupiter swaps from), if connected. */
function extensionWallet(): string | null {
  type Key = { toString(): string } | null | undefined
  const w = window as unknown as { phantom?: { solana?: { publicKey?: Key } }; solflare?: { publicKey?: Key }; backpack?: { publicKey?: Key } }
  const keys = [w.phantom?.solana?.publicKey, w.solflare?.publicKey, w.backpack?.publicKey]
  return keys.find(Boolean)?.toString() ?? null
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 2 : 0 })
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`

/** Nav call to action. */
export function BuyVvcButton({ className = '' }: { className?: string }) {
  const [symbol, setSymbol] = useState('VVC')
  const [holder, setHolder] = useState(false)
  useEffect(() => {
    fetchTokenConfig().then(c => setSymbol(c.symbol)).catch(() => {})
    const onStatus = (e: Event) => setHolder(!!(e as CustomEvent<HolderStatus>).detail?.isHolder)
    window.addEventListener('vvc:holder-status', onStatus)
    return () => window.removeEventListener('vvc:holder-status', onStatus)
  }, [])
  return (
    <button className={`buyvvc-cta${holder ? ' buyvvc-cta--holder' : ''} ${className}`} onClick={openBuyVvc}
      title={holder ? `You hold $${symbol}: free credits every week` : `Buy $${symbol}: holders get free credits every week`}>
      {holder ? `$${symbol} holder ✓` : `Buy $${symbol}`}
    </button>
  )
}

export function BuyVvcHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const h = () => setOpen(true)
    window.addEventListener('vvc:buy-vvc', h)
    return () => window.removeEventListener('vvc:buy-vvc', h)
  }, [])
  return open ? <BuyVvcModal onClose={() => setOpen(false)} /> : null
}

type SwapState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'checking' | 'done'
/** What the last swap did for the signed-in wallet. */
type Outcome = { kind: 'credits' | 'holder' | 'more' | 'elsewhere' | 'pending'; bought?: number; from?: string }

function BuyVvcModal({ onClose }: { onClose: () => void }) {
  const { status, memberWallet, join } = useIdentity()
  const isMember = status === 'member' && !!memberWallet
  const [config, setConfig] = useState<TokenConfig | null>(null)
  const [holder, setHolder] = useState<HolderStatus | null>(null)
  const [swap, setSwap] = useState<SwapState>('idle')
  const [granted, setGranted] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [burst, setBurst] = useState(0)            // confetti: bump to fire
  const [swapWallet, setSwapWallet] = useState<string | null>(null)
  const alive = useRef(true)
  const timers = useRef<number[]>([])

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; timers.current.forEach(clearTimeout) }
  }, [])

  useEffect(() => {
    fetchTokenConfig().then(c => { if (alive.current) setConfig(c) }).catch(() => setError('Could not load the token details. Try again later.'))
  }, [])

  useEffect(() => {
    if (!isMember) return
    fetchHolderStatus().then(s => { if (alive.current) setHolder(s) }).catch(() => {})
  }, [isMember])

  // Which account the swap will use: Jupiter swaps from whatever the extension is on, which can
  // differ from the signed-in wallet (an account switched in Phantom after signing in)
  useEffect(() => {
    if (!config?.buyEnabled) return
    const read = () => setSwapWallet(extensionWallet())
    read()
    const id = window.setInterval(read, 1500)
    return () => clearInterval(id)
  }, [config?.buyEnabled])

  // A finished swap: celebrate, then re-read the balance until the new bag shows up (or we run out of tries)
  const afterSwap = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setBurst(b => b + 1)
    setOutcome(null)
    if (!isMember) { setSwap('done'); setOutcome({ kind: 'pending' }); return }
    setSwap('checking')
    const from = extensionWallet()
    const elsewhere = !!from && from !== memberWallet
    const before = holder?.tokenBalance ?? 0
    let finished = false
    let total = 0
    let latest: HolderStatus | null = null
    const conclude = () => {
      finished = true
      if (!alive.current) return
      setSwap('done')
      const bought = latest ? latest.tokenBalance - before : 0
      if (total > 0) setOutcome({ kind: 'credits', bought })
      else if (bought > 0) setOutcome({ kind: latest?.isHolder ? 'holder' : 'more', bought })
      else if (elsewhere) setOutcome({ kind: 'elsewhere', from: from! })
      else setOutcome({ kind: 'pending' })
    }
    RECHECK_DELAYS_MS.forEach((delay, i) => {
      const last = i === RECHECK_DELAYS_MS.length - 1
      timers.current.push(window.setTimeout(async () => {
        if (!alive.current || finished) return
        try {
          const s = await checkHolderNow()
          if (!alive.current) return
          latest = s
          setHolder(s)
          if (s.granted > 0) { total += s.granted; setGranted(total); setBurst(b => b + 1) }
          if (s.tokenBalance > before) return conclude()
        } catch { /* try again on the next round */ }
        // A swap from another wallet never shows up here: say so after the first check
        if (last || elsewhere) conclude()
      }, delay))
    })
  }, [isMember, holder, memberWallet])
  // onSuccess is bound once when the swap is set up: route it to the latest callback
  const afterSwapRef = useRef(afterSwap)
  afterSwapRef.current = afterSwap

  // The Jupiter swap, embedded, buying exactly our token
  useEffect(() => {
    if (!config?.buyEnabled || swap !== 'idle') return
    setSwap('loading')
    loadJupiter()
      .then(jup => {
        if (!alive.current) return
        jup.init({
          displayMode: 'integrated',
          integratedTargetId: TARGET_ID,
          formProps: { initialInputMint: SOL_MINT, initialOutputMint: config.mint, fixedMint: config.mint },
          containerStyles: { width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' },
          branding: { name: `Buy $${config.symbol}` },
          onSuccess: () => afterSwapRef.current(),
        })
        setSwap('ready')
      })
      .catch(() => { if (alive.current) setSwap('unavailable') })
  }, [config, swap])

  useEffect(() => () => { (window as WinJup).Jupiter?.close?.() }, [])

  const sym = config ? `$${config.symbol}` : '$VVC'
  const min = config?.holder.minBalance ?? 0
  const weekly = config?.holder.weeklyCredits ?? 0
  const missing = holder && !holder.isHolder ? Math.max(0, min - holder.tokenBalance) : 0
  const wrongWallet = isMember && !!swapWallet && swapWallet !== memberWallet

  return (
    <div className="buyvvc-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {burst > 0 && <Confetti key={burst} pieces={granted > 0 ? 110 : 70} />}
      <div className="buyvvc-modal" role="dialog" aria-label={`Buy ${sym}`}>
        <div className="buyvvc-header">
          <span className="buyvvc-title">Get {sym}</span>
          <button className="buyvvc-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="buyvvc-pitch">
          <p className="buyvvc-pitch-main">Hold {sym}, create for free.</p>
          {config && (
            <p className="buyvvc-pitch-sub">
              Hold at least <strong>{fmt(min)} {sym}</strong> and get <strong>{weekly} free credits every week</strong> for
              memes, reskins and art. Free credits are for holders only.
            </p>
          )}
        </div>

        {isMember ? (
          holder && (
            <div className={`buyvvc-status${holder.isHolder ? ' buyvvc-status--holder' : ''}`}>
              <div className="buyvvc-status-row">
                <span>Your {sym}</span>
                <strong>{fmt(holder.tokenBalance)}</strong>
              </div>
              {holder.isHolder ? (
                <>
                  <div className="buyvvc-status-row"><span>Free credits left this week</span><strong>{holder.freeCredits} / {holder.weeklyCredits}</strong></div>
                  {holder.nextRefillAt && (
                    <div className="buyvvc-status-row"><span>Next top-up</span><strong>{new Date(holder.nextRefillAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong></div>
                  )}
                </>
              ) : (
                <div className="buyvvc-status-row buyvvc-status-row--hint">
                  <span>{fmt(missing)} more {sym} to unlock {holder.weeklyCredits} free credits a week</span>
                </div>
              )}
              {holder.error && <div className="buyvvc-status-error">{holder.error}</div>}
            </div>
          )
        ) : (
          <div className="buyvvc-status">
            <div className="buyvvc-status-row buyvvc-status-row--hint">
              <span>Join with the wallet you hold {sym} in to get your weekly credits.</span>
            </div>
            <button className="buyvvc-join" onClick={() => { onClose(); join() }}>
              {status === 'pending' ? 'Finish joining' : 'Join'}
            </button>
          </div>
        )}

        {granted > 0 && <div className="buyvvc-granted">+{granted} free credits added ⚡</div>}
        {swap === 'checking' && <div className="buyvvc-checking">Swap done 🎉 Checking your {sym} balance…</div>}
        {swap === 'done' && outcome && outcome.kind !== 'credits' && (
          <div className={`buyvvc-outcome buyvvc-outcome--${outcome.kind}`}>
            {outcome.kind === 'holder' && <>You got <strong>{fmt(outcome.bought!)} {sym}</strong>. You're a holder: free credits every week.</>}
            {outcome.kind === 'more' && <>You got <strong>{fmt(outcome.bought!)} {sym}</strong>. {fmt(missing)} more to unlock {weekly} free credits a week.</>}
            {outcome.kind === 'elsewhere' && <>That swap went to <strong>{short(outcome.from!)}</strong>, not the wallet you're signed in with (<strong>{short(memberWallet!)}</strong>). Send the {sym} there, or sign in with {short(outcome.from!)}, for it to count.</>}
            {outcome.kind === 'pending' && <>Swap done. If your {sym} doesn't show yet, it will on your next visit.</>}
          </div>
        )}

        {config && !config.buyEnabled && <div className="buyvvc-soon">{sym} trading opens soon.</div>}
        {config?.buyEnabled && (
          <>
            {wrongWallet ? (
              <p className="buyvvc-wallet-warn">
                Your wallet is on <strong>{short(swapWallet!)}</strong>, but you're signed in as <strong>{short(memberWallet!)}</strong>.
                Switch to {short(memberWallet!)} in your wallet so the {sym} counts for your credits.
              </p>
            ) : (
              isMember && <p className="buyvvc-wallet-note">Swap with your signed-in wallet ({short(memberWallet!)}) so it counts.</p>
            )}
            <div id={TARGET_ID} className="buyvvc-swap">
              {swap === 'loading' && <div className="buyvvc-swap-loading">Loading swap…</div>}
            </div>
            {swap === 'unavailable' && <div className="buyvvc-soon">The swap could not load. Check your connection and reopen this window.</div>}
          </>
        )}

        {error && <div className="buyvvc-status-error">{error}</div>}

        <p className="buyvvc-fineprint">
          Free credits top back up to {weekly || 'the weekly amount'} once a week while you hold; unspent ones don't pile up.
          Purchased credits never expire.{config?.buyEnabled && ' Swaps run through Jupiter; prices move, so check the quote before you confirm.'}
        </p>
      </div>
    </div>
  )
}
