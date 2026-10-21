import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLeaders, fmtPct, fmtSol, fmtTokens, rankArt, type LeaderRow, type Leaders as LeadersData } from '../api/bag'
import { bestImage, getPublicProfiles, type PublicProfile } from '../identity/api'
import { displayName } from '../identity/archetypes'
import { RankChip } from './RankChip'
import './Leaders.css'

// The winners, in public: who's printing, who's the Chaddest, the longest hands, the biggest bags,
// and today's biggest climber. Public bags only (members can hide theirs on the Bag page).

const BOARDS: { key: keyof Omit<LeadersData, 'chadOfTheDay'>; title: string; kicker: string; value: (r: LeaderRow) => string }[] = [
  { key: 'printers', title: 'Money Printers', kicker: 'Best PnL', value: r => `${fmtPct(r.pnlPct)}${r.pnlSol ? ` · ${r.pnlSol >= 0 ? '+' : ''}${fmtSol(r.pnlSol)}` : ''}` },
  { key: 'chads', title: 'Top Chads', kicker: 'Chad score', value: r => `${r.rank.score}/100` },
  { key: 'diamond', title: 'Diamond Hands', kicker: 'Held longest', value: r => `${Math.floor(r.heldDays ?? 0)} days` },
  { key: 'bags', title: 'Biggest Bags', kicker: 'Most $VVC', value: r => fmtTokens(r.balance) },
]
const MEDAL = ['🥇', '🥈', '🥉']

export function Leaders({ me }: { me: string | null }) {
  const navigate = useNavigate()
  const [data, setData] = useState<LeadersData | null>(null)
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({})

  useEffect(() => {
    let stop = false
    const load = () => fetchLeaders().then(d => { if (!stop) setData(d) }).catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => { stop = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    if (!data) return
    const wallets = new Set<string>()
    for (const b of BOARDS) data[b.key].forEach(r => wallets.add(r.wallet))
    if (data.chadOfTheDay) wallets.add(data.chadOfTheDay.wallet)
    if (wallets.size) getPublicProfiles([...wallets]).then(setProfiles)
  }, [data])

  const name = (w: string) => (w === me ? 'You' : profiles[w] ? displayName(profiles[w]) : `${w.slice(0, 4)}…${w.slice(-4)}`)
  const avatar = (w: string) => (profiles[w] ? <img src={bestImage(profiles[w])} alt="" /> : <span className="leaders-av">?</span>)
  const cotd = data?.chadOfTheDay ?? null

  return (
    <section className="leaders">
      <div className="leaders-cotd">
        <h3 className="bag-h"><small>Today's biggest climber</small>Chad of the Day</h3>
        {cotd ? (
          <button className="leaders-cotd-who" onClick={() => navigate(`/u/${encodeURIComponent(cotd.wallet)}`)}>
            <img className="leaders-cotd-art" src={rankArt(cotd.rank.key)} alt="" />
            <span className="leaders-cotd-pfp">{avatar(cotd.wallet)}</span>
            <span className="leaders-cotd-text">
              <b>{name(cotd.wallet)}</b>
              <em>+{cotd.climb} points today, now a <strong>{cotd.rank.name}</strong></em>
            </span>
          </button>
        ) : (
          <p className="bag-empty">Nobody has climbed today yet. Ape in and take the crown.</p>
        )}
        <p className="leaders-note">Crowned at midnight UTC in the trollbox. Comes with a badge.</p>
      </div>

      {BOARDS.map(b => (
        <div key={b.key} className="leaders-board">
          <h3 className="bag-h"><small>{b.kicker}</small>{b.title}</h3>
          {!data ? (
            <p className="bag-empty">Loading…</p>
          ) : data[b.key].length === 0 ? (
            <p className="bag-empty">Nobody on the board yet.</p>
          ) : (
            <ol>
              {data[b.key].slice(0, 5).map((r, i) => (
                <li key={r.wallet} className={r.wallet === me ? 'is-me' : ''}>
                  <span className="leaders-pos">{MEDAL[i] ?? i + 1}</span>
                  <button className="leaders-who" onClick={() => navigate(`/u/${encodeURIComponent(r.wallet)}`)} title={r.wallet}>
                    {avatar(r.wallet)}
                    <span className="leaders-name">{name(r.wallet)}</span>
                  </button>
                  <RankChip rank={r.rank} />
                  <span className="leaders-value">{b.value(r)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  )
}
