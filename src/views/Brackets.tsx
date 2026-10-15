import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadProfilesBatch } from '../lib/quizLog'
import './Brackets.css'

interface LeaderboardRow {
  wallet: string
  total_xp: number
  current_rank: string
  rank_direction: string
  badge_count: number
}

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

// ─── Prize pool & ongoing quests ───────────────────────────────────────────
// Static promo content from the team — cash milestones + open community quests.
// Not backend-driven: these are fixed terms, not live-tracked progress.

interface PrizeDef {
  id: string
  icon: string
  title: string
  reward: string
  desc: string
  tag: 'cash' | 'open'
}

const PRIZES: PrizeDef[] = [
  {
    id: 'tw-50k', icon: '🐦', title: '1st meme to hit 50K X impressions', reward: '$100',
    desc: 'First meme shared from the suite to cross 50,000 impressions on X wins the bounty.', tag: 'cash',
  },
  {
    id: 'tw-100k', icon: '🐦', title: '1st meme to hit 100K X impressions', reward: '$200',
    desc: 'First meme shared from the suite to cross 100,000 impressions on X wins the bounty.', tag: 'cash',
  },
  {
    id: 'yt-1m', icon: '▶️', title: '1,000,000 views on YouTube', reward: '$1,000',
    desc: 'Any VVC video that crosses 1M views on YouTube qualifies for the payout.', tag: 'cash',
  },
  {
    id: 'most-viewed-video', icon: '🎬', title: 'Most-viewed VVC video', reward: 'Bounty',
    desc: 'Across YouTube, TikTok, Reddit, and YouTube Shorts — whoever\'s VVC video racks up the most views wins. Video creation inside the suite is still in the works, but you can make one with your own tools right now and still qualify.', tag: 'cash',
  },
]

interface QuestDef {
  id: string
  icon: string
  title: string
  desc: string
}

const QUESTS: QuestDef[] = [
  {
    id: 'meme-most-voted', icon: '🗳', title: 'Meme of the Month — Most Voted',
    desc: 'The meme with the most upvotes across the Meme Feed this month gets the crown.',
  },
  {
    id: 'meme-most-viewed', icon: '👁', title: 'Meme of the Month — Most Viewed',
    desc: 'Combined X impressions across all your shared memes — biggest reach wins.',
  },
  {
    id: 'bracket-champion', icon: '👑', title: 'Weekly Bracket Champion',
    desc: 'Win your meme\'s way through the Weekly Bracket below and get inducted into the Pantheon.',
  },
  {
    id: 'top-creator', icon: '⚡', title: 'Top Creator',
    desc: 'Highest combined likes, retweets, replies and views across everything you\'ve shared to X.',
  },
]

function PrizeCard({ prize }: { prize: PrizeDef }) {
  return (
    <div className="prize-card">
      <div className="prize-card-icon">{prize.icon}</div>
      <div className="prize-card-body">
        <span className="prize-card-title">{prize.title}</span>
        <span className="prize-card-desc">{prize.desc}</span>
      </div>
      <div className="prize-card-reward">{prize.reward}</div>
    </div>
  )
}

function QuestCard({ quest }: { quest: QuestDef }) {
  return (
    <div className="quest-card">
      <div className="quest-card-icon">{quest.icon}</div>
      <div className="quest-card-body">
        <span className="quest-card-title">{quest.title}</span>
        <span className="quest-card-desc">{quest.desc}</span>
      </div>
      <span className="quest-card-tag">OPEN</span>
    </div>
  )
}

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' }

function LeaderboardCard({ row, rank, profile, onOpen }: {
  row: LeaderboardRow
  rank: number
  profile?: { character?: string; title?: string; portraitDataUrl?: string }
  onOpen: () => void
}) {
  const avatar = profile?.portraitDataUrl ?? (profile?.character ? `/assets/chars/${profile.character}.png` : null)
  const name   = profile?.character
    ? `${profile.title ? `${profile.title} ` : ''}${profile.character}`
    : `${row.wallet.slice(0, 6)}…${row.wallet.slice(-4)}`

  return (
    <button className="lb-row" onClick={onOpen}>
      <span className="lb-rank">{MEDAL[rank] ?? `#${rank + 1}`}</span>
      {avatar
        ? <img src={avatar} alt="" className="lb-avatar" />
        : <span className="lb-avatar lb-avatar--placeholder">{row.wallet.slice(0, 2).toUpperCase()}</span>
      }
      <span className="lb-name">{name}</span>
      <span className={`lb-rank-tier lb-rank-tier--${row.rank_direction}`}>{row.current_rank}</span>
      <span className="lb-xp">⚡ {row.total_xp.toLocaleString()}</span>
      <span className="lb-badges">🏅 {row.badge_count}</span>
    </button>
  )
}

interface Props {
  address: string
}

export function Brackets({ address }: Props) {
  const navigate = useNavigate()
  const [bracket,  setBracket]  = useState<Bracket | null>(null)
  const [matchups, setMatchups] = useState<Matchup[]>([])
  const [loading,  setLoading]  = useState(true)
  const [activeRound, setActiveRound] = useState(1)
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [lbProfiles, setLbProfiles]   = useState<Record<string, { character?: string; title?: string; portraitDataUrl?: string }>>({})
  const [lbLoading, setLbLoading]     = useState(true)

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

  useEffect(() => {
    fetch('/api/leaderboard/players?limit=25')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(async d => {
        const items: LeaderboardRow[] = d.items ?? []
        setLeaderboard(items)
        if (items.length) setLbProfiles(await loadProfilesBatch(items.map(i => i.wallet)))
      })
      .catch(() => {})
      .finally(() => setLbLoading(false))
  }, [])

  function handleVoted(matchup_id: string, votes_a: number, votes_b: number) {
    setMatchups(prev => prev.map(m => m.id === matchup_id ? { ...m, votes_a, votes_b } : m))
  }

  const rounds   = [...new Set(matchups.map(m => m.round))].sort()
  const roundMatchups = matchups.filter(m => m.round === activeRound)

  return (
    <div className="brackets-root">

      {/* ── Cash prize pool ── */}
      <div className="prizes-section">
        <div className="prizes-section-header">
          <h1 className="prizes-section-title">Prizes</h1>
          <p className="prizes-section-sub">Real cash for real virality. Hit a milestone, get paid.</p>
        </div>
        <div className="prizes-grid">
          {PRIZES.map(p => <PrizeCard key={p.id} prize={p} />)}
        </div>
      </div>

      {/* ── Open quests / competitions ── */}
      <div className="prizes-section">
        <div className="prizes-section-header">
          <h2 className="prizes-section-title prizes-section-title--sm">Open Quests &amp; Competitions</h2>
          <p className="prizes-section-sub">No entry required — just play the suite and climb.</p>
        </div>
        <div className="quests-grid">
          {QUESTS.map(q => <QuestCard key={q.id} quest={q} />)}
        </div>
      </div>

      {/* ── VVC-wide leaderboard ── */}
      <div className="prizes-section">
        <div className="prizes-section-header">
          <h2 className="prizes-section-title prizes-section-title--sm">Leaderboard</h2>
          <p className="prizes-section-sub">Ranked by total XP across the whole suite.</p>
        </div>
        {lbLoading ? (
          <p className="brackets-empty">Loading…</p>
        ) : leaderboard.length === 0 ? (
          <p className="brackets-empty">No ranked players yet.</p>
        ) : (
          <div className="lb-list">
            {leaderboard.map((row, i) => (
              <LeaderboardCard
                key={row.wallet}
                row={row}
                rank={i}
                profile={lbProfiles[row.wallet]}
                onOpen={() => navigate(row.wallet === address ? '/profile' : `/u/${row.wallet}`)}
              />
            ))}
          </div>
        )}
      </div>

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
