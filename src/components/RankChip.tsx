import { useEffect, useState } from 'react'
import { fetchRank, rankArt } from '../api/bag'
import './RankChip.css'

/** A member's Chad rank as a small chip (art + name), for flair next to their name. Nothing if unranked or hidden. */
export function RankChip({ wallet, rank: given }: { wallet?: string; rank?: { key: string; name: string; score?: number } | null }) {
  const [rank, setRank] = useState(given ?? null)
  useEffect(() => {
    if (given !== undefined) { setRank(given); return }
    if (!wallet) return
    let stop = false
    fetchRank(wallet).then(r => { if (!stop) setRank(r) })
    return () => { stop = true }
  }, [wallet, given])
  if (!rank) return null
  const chad = ['thad', 'chad', 'gigachad'].includes(rank.key)
  return (
    <span className={`rank-chip${chad ? ' rank-chip--chad' : ''}`} title={rank.score !== undefined ? `Chad score ${rank.score}` : rank.name}>
      <img src={rankArt(rank.key)} alt="" />{rank.name}
    </span>
  )
}
