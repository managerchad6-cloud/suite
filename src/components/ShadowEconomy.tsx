import { useEffect, useState } from 'react'
import './ShadowEconomy.css'

interface ShadowData {
  season: number
  creator_royalties: number
  scout_bonuses: number
  bracket_winnings: number
  total: number
  config: {
    vvc_per_vote: number
    vvc_per_scout: number
    vvc_per_bracket: number
  }
}

interface Props { wallet: string }

export function ShadowEconomy({ wallet }: Props) {
  const [data,    setData]    = useState<ShadowData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/shadow/${encodeURIComponent(wallet)}/season`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [wallet])

  if (loading) return <div className="shadow-loading">Loading…</div>
  if (!data)   return null

  return (
    <div className="shadow-panel">
      <div className="shadow-header">
        <span className="shadow-title">◊ SHADOW ECONOMY</span>
        <span className="shadow-season">Season {data.season}</span>
        <span className="shadow-coming-soon">Coming Soon™</span>
      </div>

      <div className="shadow-rows">
        <div className="shadow-row">
          <span className="shadow-row-label">Creator royalties</span>
          <span className="shadow-row-value">◊ {data.creator_royalties.toFixed(2)} VVC</span>
        </div>
        <div className="shadow-row">
          <span className="shadow-row-label">Scout bonuses</span>
          <span className="shadow-row-value">◊ {data.scout_bonuses.toFixed(2)} VVC</span>
        </div>
        <div className="shadow-row">
          <span className="shadow-row-label">Bracket winnings</span>
          <span className="shadow-row-value">◊ {data.bracket_winnings.toFixed(2)} VVC</span>
        </div>
      </div>

      <div className="shadow-total">
        <span className="shadow-total-label">Total potential</span>
        <span className="shadow-total-value">◊ {data.total.toFixed(2)} VVC</span>
      </div>

      <div className="shadow-config">
        <span>{data.config.vvc_per_vote} VVC/vote</span>
        <span>{data.config.vvc_per_scout} VVC/scout</span>
        <span>{data.config.vvc_per_bracket} VVC/bracket win</span>
      </div>
    </div>
  )
}
