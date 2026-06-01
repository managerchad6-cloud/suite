import { useEffect, useState } from 'react'
import './Brackets.css'

interface Matchup {
  id: string
  bracket_id: string
  round: number
  position: number
  meme_a_id: string
  meme_a_source: string
  meme_b_id: string
  meme_b_source: string
  votes_a: number
  votes_b: number
  winner: string | null
  starts_at: string
  ends_at: string
}

interface Bracket {
  id: string
  starts_at: string
  ends_at: string
  status: string
  champion_meme_id: string | null
  champion_meme_source: string | null
}

function memeImageUrl(id: string, source: string): string {
  return source === 'studio' ? `/handmade/${id}/image` : `/jobs/${id}/image`
}

function timeLeft(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Ended'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function MatchupCard({
  matchup, address, onVoted,
}: {
  matchup: Matchup
  address: string
  onVoted: (matchup_id: string, votes_a: number, votes_b: number) => void
}) {
  const [votesA, setVotesA] = useState(matchup.votes_a)
  const [votesB, setVotesB] = useState(matchup.votes_b)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const ended   = new Date(matchup.ends_at) < new Date()
  const total   = votesA + votesB
  const pctA    = total > 0 ? Math.round((votesA / total) * 100) : 50
  const pctB    = 100 - pctA

  async function vote(meme_id: string) {
    if (voting || ended || myVote === meme_id) return
    setVoting(true)
    try {
      const res = await fetch('/api/brackets/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup_id: matchup.id, vote: meme_id, wallet: address }),
      })
      if (!res.ok) return
      const data = await res.json()
      setVotesA(data.votes_a)
      setVotesB(data.votes_b)
      setMyVote(meme_id)
      onVoted(matchup.id, data.votes_a, data.votes_b)
    } finally { setVoting(false) }
  }

  return (
    <div className={`matchup-card ${ended ? 'matchup-card--ended' : ''}`}>
      <div className="matchup-timer">{ended ? 'ENDED' : `⏱ ${timeLeft(matchup.ends_at)}`}</div>

      <div className="matchup-sides">
        {/* Side A */}
        <button
          className={`matchup-side ${myVote === matchup.meme_a_id ? 'matchup-side--voted' : ''} ${matchup.winner === matchup.meme_a_id ? 'matchup-side--winner' : ''} ${matchup.winner && matchup.winner !== matchup.meme_a_id ? 'matchup-side--loser' : ''}`}
          onClick={() => vote(matchup.meme_a_id)}
          disabled={voting || ended || !!matchup.winner}
        >
          <img src={memeImageUrl(matchup.meme_a_id, matchup.meme_a_source)} alt="A" className="matchup-img" />
          <div className="matchup-vote-count">{votesA}</div>
        </button>

        <div className="matchup-vs">
          <span className="matchup-vs-label">VS</span>
          {total > 0 && (
            <div className="matchup-bar">
              <div className="matchup-bar-a" style={{ width: `${pctA}%` }} />
              <div className="matchup-bar-b" style={{ width: `${pctB}%` }} />
            </div>
          )}
          <span className="matchup-pct">{pctA}% / {pctB}%</span>
        </div>

        {/* Side B */}
        <button
          className={`matchup-side ${myVote === matchup.meme_b_id ? 'matchup-side--voted' : ''} ${matchup.winner === matchup.meme_b_id ? 'matchup-side--winner' : ''} ${matchup.winner && matchup.winner !== matchup.meme_b_id ? 'matchup-side--loser' : ''}`}
          onClick={() => vote(matchup.meme_b_id)}
          disabled={voting || ended || !!matchup.winner}
        >
          <img src={memeImageUrl(matchup.meme_b_id, matchup.meme_b_source)} alt="B" className="matchup-img" />
          <div className="matchup-vote-count">{votesB}</div>
        </button>
      </div>
    </div>
  )
}

interface Props {
  address: string
}

export function Brackets({ address }: Props) {
  const [bracket,  setBracket]  = useState<Bracket | null>(null)
  const [matchups, setMatchups] = useState<Matchup[]>([])
  const [loading,  setLoading]  = useState(true)
  const [activeRound, setActiveRound] = useState(1)

  useEffect(() => {
    fetch('/api/brackets/current')
      .then(r => r.ok ? r.json() : { bracket: null, matchups: [] })
      .then(d => {
        setBracket(d.bracket)
        setMatchups(d.matchups ?? [])
        // Default to latest round with active matchups
        if (d.matchups?.length) {
          const maxRound = Math.max(...d.matchups.map((m: Matchup) => m.round))
          setActiveRound(maxRound)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleVoted(matchup_id: string, votes_a: number, votes_b: number) {
    setMatchups(prev => prev.map(m => m.id === matchup_id ? { ...m, votes_a, votes_b } : m))
  }

  const rounds   = [...new Set(matchups.map(m => m.round))].sort()
  const roundMatchups = matchups.filter(m => m.round === activeRound)

  return (
    <div className="brackets-root">
      <div className="brackets-header">
        <h1 className="brackets-title">Weekly Bracket</h1>
        {bracket && (
          <div className="brackets-meta">
            <span className={`brackets-status brackets-status--${bracket.status}`}>
              {bracket.status.toUpperCase()}
            </span>
            <span className="brackets-dates">
              {new Date(bracket.starts_at).toLocaleDateString()} – {new Date(bracket.ends_at).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="brackets-empty">Loading…</div>
      ) : !bracket ? (
        <div className="brackets-empty">
          <p>No active bracket.</p>
          <p className="brackets-sub">A new bracket seeds every Monday from the top-scoring memes of the week.</p>
        </div>
      ) : (
        <div className="brackets-body">

          {/* ── Champion banner ── */}
          {bracket.champion_meme_id && (
            <div className="brackets-champion">
              <span className="brackets-champion-crown">👑</span>
              <span className="brackets-champion-label">This Week&apos;s Champion</span>
              <img
                src={memeImageUrl(bracket.champion_meme_id, bracket.champion_meme_source ?? 'studio')}
                alt="Champion"
                className="brackets-champion-img"
              />
              <span className="brackets-champion-sub">Inducted into the Pantheon</span>
            </div>
          )}

          {/* ── Round tabs ── */}
          {rounds.length > 1 && (
            <div className="brackets-round-tabs">
              {rounds.map(r => (
                <button
                  key={r}
                  className={`brackets-round-tab ${r === activeRound ? 'active' : ''}`}
                  onClick={() => setActiveRound(r)}
                >
                  {r === Math.max(...rounds) && matchups.filter(m => m.round === r).length === 1
                    ? 'Final'
                    : `Round ${r}`}
                </button>
              ))}
            </div>
          )}

          {/* ── Matchups ── */}
          <div className="brackets-matchups">
            {roundMatchups.map(m => (
              <MatchupCard
                key={m.id}
                matchup={m}
                address={address}
                onVoted={handleVoted}
              />
            ))}
          </div>

        </div>
      )}
    </div>
  )
}
