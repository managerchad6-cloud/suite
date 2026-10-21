import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtSol, fmtTokens, rankArt, type ArenaTrade } from '../api/bag'
import { getPublicProfiles, bestImage, type PublicProfile } from '../identity/api'
import { displayName } from '../identity/archetypes'
import './Arena.css'

// The arena: every trade on the main pool as it happens. Members show as themselves with their
// Chad rank; everyone else by size. New trades slide in at the top, gold for apes, grey for paper.

// Bots shuffle dust all day; the feed shows real trades (they still count in the tug-of-war)
const MIN_FEED_SOL = 0.01

const SIZE_ICON: Record<string, string> = { Shrimp: '🦐', Fish: '🐟', Dolphin: '🐬', Shark: '🦈', Whale: '🐋' }
const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`
}

export function Arena({ trades: all, fresh, me, wide = false }: { trades: ArenaTrade[]; fresh: Set<string>; me: string | null; wide?: boolean }) {
  const trades = all.filter(t => t.sol >= MIN_FEED_SOL || (!!me && t.wallet === me))
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({})
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(id) }, [])

  // Members' names and portraits (cached by identity/api)
  useEffect(() => {
    const wallets = [...new Set(trades.filter(t => t.member && t.wallet && !profiles[t.wallet]).map(t => t.wallet!))]
    if (wallets.length) getPublicProfiles(wallets).then(p => { if (Object.keys(p).length) setProfiles(prev => ({ ...prev, ...p })) })
  }, [trades])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`bag-box arena${wide ? ' arena--wide' : ''}`}>
      <div className="arena-head">
        <h3 className="bag-h"><small>Live</small>The arena</h3>
        <span className="arena-live"><i />LIVE</span>
      </div>
      {trades.length === 0 ? (
        <p className="bag-empty">Waiting for the first trade…</p>
      ) : (
        <ol className="arena-feed">
          {trades.slice(0, wide ? 40 : 14).map(t => {
            const p = t.wallet ? profiles[t.wallet] : undefined
            const mine = !!me && t.wallet === me
            const buy = t.kind === 'buy'
            return (
              <li key={t.signature} className={`arena-row arena-row--${t.kind}${fresh.has(t.signature) ? ' is-fresh' : ''}${mine ? ' is-mine' : ''}${t.sol >= 5 ? ' is-big' : ''}`}>
                {t.member && t.wallet ? (
                  <button className="arena-who" onClick={() => navigate(`/u/${encodeURIComponent(t.wallet!)}`)} title={t.wallet}>
                    {p ? <img src={bestImage(p)} alt="" /> : <span className="arena-av">?</span>}
                    <span className="arena-name">{mine ? 'You' : p ? displayName(p) : `${t.wallet.slice(0, 4)}…`}</span>
                    {t.rank && <span className="arena-rank" title={`Chad score ${t.rank.score}`}><img src={rankArt(t.rank.key)} alt="" />{t.rank.name}</span>}
                  </button>
                ) : (
                  <a className="arena-who arena-who--anon" href={`https://solscan.io/account/${t.wallet ?? ''}`} target="_blank" rel="noopener noreferrer">
                    <span className="arena-size" aria-hidden>{SIZE_ICON[t.label ?? 'Shrimp'] ?? '🦐'}</span>
                    <span className="arena-name">anon {t.label}</span>
                  </a>
                )}
                <span className="arena-what">
                  <b>{buy ? 'aped' : 'paper-handed'}</b> {fmtSol(t.sol)}
                  <em>{buy ? '+' : '−'}{fmtTokens(t.tokens)}</em>
                </span>
                <a className="arena-when" href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noopener noreferrer">{ago(t.at, now)}</a>
                {t.rankTo && <span className="arena-rankup">→ now a <img src={rankArt(t.rankTo.key)} alt="" /> <b>{t.rankTo.name}</b></span>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
