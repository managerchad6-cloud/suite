// Join = the suite's login: pick a wallet → sign one message → (new wallets) the interview → member.
// Returning members only sign. Closing the overlay keeps everything: the interview resumes later.
import { useEffect, useState } from 'react'
import { connectWalletByType } from '../wallet'
import { useIdentity } from './IdentityProvider'
import { Interview } from './Interview'
import { ArchetypeReveal } from './ArchetypeReveal'
import { isUserRejection, signInWithWallet, walletOptions, type SolanaWalletType } from './walletSignIn'

const LETTER: Record<SolanaWalletType, string> = { phantom: 'P', solflare: 'S', backpack: 'B' }

function WalletStep() {
  const { setMe, closeJoin } = useIdentity()
  const [busy, setBusy] = useState<SolanaWalletType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const options = walletOptions()

  async function pick(type: SolanaWalletType, detected: boolean, installUrl: string) {
    if (busy) return
    if (!detected) { window.open(installUrl, '_blank', 'noopener'); return }
    setBusy(type)
    setError(null)
    try {
      const me = await signInWithWallet(type)
      // Payments still go through the legacy wallet module: give it the same provider
      connectWalletByType(type).catch(() => {})
      setMe(me)
      if (me.state === 'member') closeJoin()          // returning member: just signed in
    } catch (e) {
      setError(isUserRejection(e) ? 'Sign-in cancelled. Signing is free and sends no transaction.' : (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="join-step">
      <h2 className="join-title">Join Virgin vs Chad</h2>
      <p className="join-sub">Sign in with your Solana wallet. New here? A short interview with the Oracle assigns your archetype.</p>
      <div className="wg-grid">
        {options.map(o => (
          <button
            key={o.type}
            className={['wg-btn', !o.detected ? 'wg-btn-uninstalled' : '', busy === o.type ? 'wg-btn-busy' : ''].filter(Boolean).join(' ')}
            onClick={() => pick(o.type, o.detected, o.installUrl)}
            disabled={!!busy}
          >
            <span className={`wg-icon wg-icon-${o.type}`}>{LETTER[o.type]}</span>
            <span className="wg-name">{o.name}</span>
            <span className="wg-action">{busy === o.type ? 'Check your wallet…' : o.detected ? 'Sign in' : 'Install →'}</span>
          </button>
        ))}
      </div>
      {error
        ? <p className="wg-note wg-note--error">{error}</p>
        : <p className="wg-note">You sign a message, not a transaction. No fee.</p>}
    </div>
  )
}

export function JoinFlow() {
  const { joinOpen, closeJoin, joinReason, status, profile, setMe } = useIdentity()
  // The reveal stays up after the interview, even though the visitor is a member by then
  const [revealed, setRevealed] = useState<{ rerollsLeft: number | null } | null>(null)

  // Opened while already a member (e.g. a stale button): nothing to do
  useEffect(() => {
    if (joinOpen && status === 'member' && !revealed) closeJoin()
  }, [joinOpen, status, revealed, closeJoin])

  useEffect(() => { if (!joinOpen) setRevealed(null) }, [joinOpen])

  if (!joinOpen || status === 'loading') return null

  return (
    <div className="join-overlay" role="dialog" aria-modal="true" aria-label="Join">
      <div className="join-panel">
        <div className="join-header">
          <img src="/assets/logo.png" alt="Virgin VS Chad" className="join-logo" />
          {joinReason && status === 'guest' && <span className="join-reason">Join to {joinReason}</span>}
          <button className="join-close" onClick={closeJoin} aria-label="Close">×</button>
        </div>

        <div className="join-body">
          {status === 'guest' && <WalletStep />}

          {status === 'pending' && !revealed && (
            <>
              <p className="quiz-oracle-label join-oracle-label">VVC ARCHETYPE ORACLE · answer honestly</p>
              <Interview
                kind="onboarding"
                onCompleted={(me, interview) => { setMe(me); setRevealed({ rerollsLeft: interview.rerollsLeft }) }}
              />
            </>
          )}

          {revealed && profile && (
            <ArchetypeReveal
              profile={profile}
              rerollsLeft={revealed.rerollsLeft}
              onRerolled={left => setRevealed({ rerollsLeft: left })}
              doneLabel="Enter the suite"
              onDone={closeJoin}
            />
          )}
        </div>
      </div>
    </div>
  )
}
