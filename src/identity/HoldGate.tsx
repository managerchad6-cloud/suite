// Holders only: before the Oracle's interview, the wallet must hold the minimum $VVC. Shows the wall
// (how much you hold, how much it takes, Buy $VVC), re-checks after a buy, then lets the interview in.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { openBuyVvc } from '../api/credits'
import { getJoinEligibility, type JoinEligibility } from './api'
import { useIdentity } from './IdentityProvider'
import { truncateAddress } from '../wallet'

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

export function HoldGate({ children }: { children: ReactNode }) {
  const { wallet, signOut } = useIdentity()
  const [st, setSt] = useState<JoinEligibility | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nudge, setNudge] = useState(0)          // shake the bar when a re-check still comes up short
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const check = useCallback(async (force: boolean) => {
    setChecking(true)
    setError(null)
    try {
      const next = await getJoinEligibility(force)
      if (!alive.current) return
      setSt(prev => {
        if (force && prev && !next.canJoin) setNudge(n => n + 1)
        return next
      })
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setChecking(false)
    }
  }, [])

  useEffect(() => { check(false) }, [check])
  // After a swap in the Buy $VVC modal, or coming back to the tab: look again
  useEffect(() => {
    if (st?.canJoin !== false) return
    const again = () => check(true)
    const onVisible = () => { if (document.visibilityState === 'visible') again() }
    window.addEventListener('vvc:vvc-swapped', again)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('vvc:vvc-swapped', again); document.removeEventListener('visibilitychange', onVisible) }
  }, [st?.canJoin, check])

  if (st?.canJoin) return <>{children}</>

  if (!st) {
    return error ? (
      <div className="hold-gate">
        <p className="hold-gate-sub">{error}</p>
        <button className="hold-gate-btn" onClick={() => check(true)} disabled={checking}>{checking ? 'Checking…' : 'Try again'}</button>
      </div>
    ) : (
      <div className="hold-gate hold-gate--loading"><span className="hold-gate-spin" /> Checking your wallet…</div>
    )
  }

  const sym = `$${st.symbol ?? 'VVC'}`
  const min = st.joinMinBalance ?? 0
  const have = st.tokenBalance ?? 0
  const pct = min > 0 ? Math.min(100, (have / min) * 100) : 0
  return (
    <div className="hold-gate">
      <div className="hold-gate-seal" aria-hidden>🔒</div>
      <h2 className="hold-gate-title">Holders only</h2>
      <p className="hold-gate-sub">
        The Oracle only reads holders. Hold at least <strong>{fmt(min)} {sym}</strong> in the wallet you signed in with
        {wallet && <> (<code>{truncateAddress(wallet)}</code>)</>} to start your interview.
      </p>

      <div className="hold-gate-meter">
        <div className="hold-gate-meter-row"><span>You hold</span><b>{fmt(have)} {sym}</b></div>
        <div key={nudge} className={`hold-gate-bar${nudge ? ' hold-gate-bar--nudge' : ''}`}><span style={{ width: `${pct}%` }} /></div>
        <div className="hold-gate-meter-row hold-gate-meter-row--dim">
          <span>{have >= min ? 'Enough!' : `${fmt(Math.max(0, min - have))} ${sym} to go`}</span><span>{fmt(min)}</span>
        </div>
      </div>

      <div className="hold-gate-actions">
        <button className="hold-gate-btn hold-gate-btn--gold" onClick={openBuyVvc}>Buy {sym}</button>
        <button className="hold-gate-btn" onClick={() => check(true)} disabled={checking}>{checking ? 'Checking…' : "I've got it, check again"}</button>
      </div>
      {error && <p className="hold-gate-error">{error}</p>}
      <p className="hold-gate-fine">
        Holding also earns free credits every week. Wrong wallet? <button className="hold-gate-link" onClick={signOut}>Sign out</button> and sign in with the one that holds.
      </p>
    </div>
  )
}
