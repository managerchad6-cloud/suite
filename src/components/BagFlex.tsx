import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { daysSince, fetchPublicBag, fmtPct, fmtTokens, fmtUsd, type PublicBag } from '../api/bag'
import './BagFlex.css'

const TIER_ICON: Record<string, string> = { holder: '💵', bag: '💰', whale: '🐋', kraken: '🦑' }

/** A member's bag on their public profile: tier, size, hold time, PnL. Hidden if they chose so. */
export function BagFlex({ wallet }: { wallet: string }) {
  const navigate = useNavigate()
  const [bag, setBag] = useState<PublicBag | null>(null)
  useEffect(() => { setBag(null); fetchPublicBag(wallet).then(setBag).catch(() => {}) }, [wallet])

  if (!bag) return null
  if (!bag.public) {
    return bag.own ? (
      <button className="bag-flex bag-flex--hidden" onClick={() => navigate('/bag')}>🙈 Your bag is hidden from your profile. Show it from your Bag page</button>
    ) : null
  }
  if (!bag.balance) return null
  const held = bag.oldestBagSince ?? bag.holdingSince
  return (
    <div className="bag-flex">
      <span className="bag-flex-tier">{bag.tier ? `${TIER_ICON[bag.tier.key] ?? '💵'} ${bag.tier.name}` : '💵 Holding'}</span>
      {bag.tier && <span>{bag.tier.loyalty.name}</span>}
      <span><b>{fmtTokens(bag.balance)}</b> $VVC{bag.valueUsd != null ? ` · ${fmtUsd(bag.valueUsd)}` : ''}</span>
      {held && <span>holding <b>{daysSince(held)}d</b></span>}
      {bag.pnlPct != null && <span className={`bag-flex-pnl ${bag.pnlPct >= 0 ? 'bag-up' : 'bag-down'}`}>{fmtPct(bag.pnlPct)}</span>}
    </div>
  )
}
