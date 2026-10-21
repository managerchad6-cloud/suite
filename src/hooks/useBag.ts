import { useEffect, useState } from 'react'
import { announceTrade, fetchBag, fetchMarket, lastAnnouncedAt, subscribeMarket, TRADE_EVENT, type Bag, type Market } from '../api/bag'
import { useIdentity } from '../identity/IdentityProvider'

// One copy of the market and your bag for the whole page (ticker, Bag page, celebrations).
// The price streams live; the bag reloads after a trade or a holder re-check, and while the
// server is still reading your history.

let market: Market | null = null
let bag: Bag | null = null
let bagWallet: string | null = null
let loading: Promise<void> | null = null
let pollTimer: number | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

/**
 * A buy or sell made outside the suite (another app, a bot) is celebrated when the chain shows it:
 * the newest trade is compared with the last one this browser saw. Swaps made here already fired.
 */
function celebrateNewTrade(b: Bag) {
  const newest = b.trades.find(t => t.kind === 'buy' || t.kind === 'sell')
  if (!newest) return
  const key = `vvc:bag-seen:${b.wallet}`
  let seen: string | null = null
  try { seen = localStorage.getItem(key); localStorage.setItem(key, newest.signature) } catch { return }
  if (!seen || seen === newest.signature) return
  if (Date.now() - lastAnnouncedAt() < 5 * 60_000) return
  if (Date.now() - Date.parse(newest.at) > 7 * 86_400_000) return
  announceTrade({ side: newest.kind === 'sell' ? 'sell' : 'buy', tokens: Math.abs(newest.tokens) })
}

function loadBag(wallet: string) {
  loading ??= fetchBag()
    .then(b => {
      if (bagWallet !== wallet) return
      bag = b
      if (b.market && !market) market = b.market
      if (b.synced && !b.syncing) celebrateNewTrade(b)
      notify()
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = b.syncing || !b.synced ? window.setTimeout(() => loadBag(wallet), 4000) : null
    })
    .catch(() => {})
    .finally(() => { loading = null })
  return loading
}

export function refreshBag() {
  if (bagWallet) void loadBag(bagWallet)
}

export function useBag(): { market: Market | null; bag: Bag | null } {
  const { memberWallet } = useIdentity()
  const [, setTick] = useState(0)

  useEffect(() => {
    const l = () => setTick(t => t + 1)
    listeners.add(l)
    const off = subscribeMarket(m => { market = { ...m, history: market?.history }; notify() })
    if (!market?.history) fetchMarket().then(m => { market = m; notify() }).catch(() => {})
    return () => { listeners.delete(l); off() }
  }, [])

  useEffect(() => {
    if (bagWallet !== memberWallet) { bagWallet = memberWallet; bag = null; notify() }
    if (!memberWallet) return
    if (!bag) void loadBag(memberWallet)
    // After a swap the balance changes over the next minute: reload a few times
    const onTrade = () => [3000, 20000, 45000].forEach(ms => setTimeout(refreshBag, ms))
    window.addEventListener(TRADE_EVENT, onTrade)
    window.addEventListener('vvc:holder-status', refreshBag)
    return () => {
      window.removeEventListener(TRADE_EVENT, onTrade)
      window.removeEventListener('vvc:holder-status', refreshBag)
    }
  }, [memberWallet])

  return { market, bag: memberWallet && bagWallet === memberWallet ? bag : null }
}
