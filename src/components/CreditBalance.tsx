import { useEffect, useState, useCallback } from 'react'
import { fetchCreditBalance } from '../api/credits'
import { BuyCreditsModal } from './BuyCreditsModal'
import { useIdentity } from '../identity/IdentityProvider'
import './CreditBalance.css'

interface Props {
  onReady?: (refresh: () => void) => void
}

function cacheKey(wallet: string) { return `vvc_credits_${wallet}` }

// Member-only (rendered in the member nav): the session decides whose balance this is
export function CreditBalance({ onReady }: Props) {
  const wallet = useIdentity().memberWallet ?? ''
  const [balance, setBalance] = useState<number>(() => {
    const cached = localStorage.getItem(cacheKey(wallet))
    return cached !== null ? parseInt(cached, 10) : 0
  })
  const [loaded, setLoaded] = useState(() => localStorage.getItem(cacheKey(wallet)) !== null)
  const [showModal, setShowModal] = useState(false)

  const refresh = useCallback(() => {
    fetchCreditBalance()
      .then(d => {
        setBalance(d.balance)
        setLoaded(true)
        localStorage.setItem(cacheKey(wallet), String(d.balance))
      })
      .catch(() => {})
  }, [wallet])

  useEffect(() => {
    refresh()
    onReady?.(refresh)
    const handler = () => refresh()
    window.addEventListener('vvc:credits-changed', handler)
    return () => window.removeEventListener('vvc:credits-changed', handler)
  }, [refresh, onReady])

  if (!loaded) return null

  return (
    <>
      <button
        className={`credit-balance-btn ${balance === 0 ? 'empty' : ''}`}
        onClick={() => setShowModal(true)}
        title="Buy Credits"
      >
        <span className="credit-balance-icon">⚡</span>
        <span className="credit-balance-num">{balance}</span>
        <span className="credit-balance-label">credits</span>
      </button>

      {showModal && (
        <BuyCreditsModal
          wallet={wallet}
          currentBalance={balance}
          onClose={() => setShowModal(false)}
          onPurchased={newBal => { setBalance(newBal); localStorage.setItem(cacheKey(wallet), String(newBal)) }}
        />
      )}
    </>
  )
}
