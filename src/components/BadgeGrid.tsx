import { useState, useEffect } from 'react'
import { fetchPlayerBadges, type PlayerBadge } from '../api/player'
import './BadgeGrid.css'

const CATEGORIES = [
  { id: 'all',        label: 'All'        },
  { id: 'creation',   label: 'Creation'   },
  { id: 'performance',label: 'Performance'},
  { id: 'voting',     label: 'Voting'     },
  { id: 'brackets',   label: 'Brackets'   },
  { id: 'comments',   label: 'Comments'   },
  { id: 'characters', label: 'Characters' },
  { id: 'studio',     label: 'Studio'     },
  { id: 'streaks',    label: 'Streaks'    },
  { id: 'economy',    label: 'Economy'    },
  { id: 'pfp',        label: 'PFP'        },
  { id: 'milestone',  label: 'Milestones' },
  { id: 'social',     label: 'Social'     },
  { id: 'special',    label: 'Special'    },
]

function rarityGlow(rarity: string) {
  switch (rarity) {
    case 'common':    return '0 0 12px rgba(68,136,255,0.4)'
    case 'uncommon':  return '0 0 12px rgba(68,204,136,0.4)'
    case 'rare':      return '0 0 14px rgba(255,204,0,0.5)'
    case 'epic':      return '0 0 16px rgba(204,68,255,0.5)'
    case 'legendary': return '0 0 20px rgba(255,170,68,0.6), 0 0 40px rgba(204,68,255,0.3)'
    default:          return 'none'
  }
}

function rarityColor(rarity: string) {
  switch (rarity) {
    case 'common':    return '#4488ff'
    case 'uncommon':  return '#44cc88'
    case 'rare':      return '#ffcc00'
    case 'epic':      return '#cc44ff'
    case 'legendary': return '#ffaa44'
    default:          return '#666'
  }
}

function BadgeCard({ badge }: { badge: PlayerBadge }) {
  const color = rarityColor(badge.rarity)
  const glow  = rarityGlow(badge.rarity)
  const date  = new Date(badge.unlocked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className={`bg-card bg-card--${badge.rarity}`} style={{ boxShadow: glow }}>
      <div className="bg-card-icon">{badge.icon}</div>
      <div className="bg-card-body">
        <span className="bg-card-name">{badge.name}</span>
        <span className="bg-card-desc">{badge.description}</span>
        <div className="bg-card-footer">
          <span className="bg-card-xp" style={{ color }}>+{badge.xp_reward} XP</span>
          <span className="bg-card-date">{date}</span>
        </div>
      </div>
      <div className="bg-card-rarity" style={{ color }}>{badge.rarity.toUpperCase()}</div>
    </div>
  )
}

interface Props {
  wallet: string
}

export function BadgeGrid({ wallet }: Props) {
  const [badges, setBadges]   = useState<PlayerBadge[]>([])
  const [totalXp, setTotalXp] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    setLoading(true)
    setBadges([])
    fetchPlayerBadges(wallet)
      .then(({ badges: b, total_xp }) => { setBadges(b); setTotalXp(total_xp) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [wallet])

  const filtered = filter === 'all' ? badges : badges.filter(b => b.category === filter)

  const availableCategories = CATEGORIES.filter(c => {
    if (c.id === 'all') return true
    return badges.some(b => b.category === c.id)
  })

  return (
    <div className="bg-root">
      {!loading && (
      <div className="bg-header">
        <div className="bg-stats">
          <span className="bg-count">{badges.length} badge{badges.length !== 1 ? 's' : ''} unlocked</span>
          <span className="bg-xp">⚡ {totalXp.toLocaleString()} XP</span>
        </div>
        {badges.length > 0 && (
          <div className="bg-filters">
            {availableCategories.map(c => (
              <button
                key={c.id}
                className={`bg-filter ${filter === c.id ? 'bg-filter--active' : ''}`}
                onClick={() => setFilter(c.id)}
              >
                {c.label}
                {c.id !== 'all' && (
                  <span className="bg-filter-count">{badges.filter(b => b.category === c.id).length}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {loading ? (
        <div className="bg-empty">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-empty">
          {badges.length === 0
            ? 'No badges yet — keep playing'
            : 'No badges in this category yet'}
        </div>
      ) : (
        <div className="bg-grid">
          {filtered.map(b => <BadgeCard key={b.badge_id} badge={b} />)}
        </div>
      )}
    </div>
  )
}
