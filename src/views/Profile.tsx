import { useState, useEffect } from 'react'
import { fetchMemesByWallet, imageUrl, parseMemeId, type Meme } from '../api/memes'
import type { UserProfile } from '../lib/quizLog'
import { fetchPlayer, type PlayerState } from '../api/player'
import { fetchFollowStats, fetchFollowers } from '../api/follow'
import { BadgeGrid } from '../components/BadgeGrid'
import { ShadowEconomy } from '../components/ShadowEconomy'
import { UserChip } from '../components/UserChip'
import { XTimeline } from '../components/XTimeline'

const CHAR_NAME: Record<string, string> = {
  gigachad: 'Gigachad', chad: 'Chad', thad: 'Thad', lad: 'Lad',
  boomer: 'Dad', brad: 'Brad', basic: 'Basic', neckbeard: 'Neckbeard',
  incel: 'Incel', wizard: 'Wizard', virgin: 'Virgin', stacy: 'Stacy',
  tracy: 'Tracy', lacy: 'Lacy', brandy: 'Brandy', veronica: 'Veronica',
  becky: 'Becky', femcel: 'Femcel', legbeard: 'Legbeard', witch: 'Witch',
  gad: 'Gad', zad: 'Zad', bad: 'Bad', gizzard: 'Gizzard',
}

interface Props {
  address: string
  profile: UserProfile | null
  onGoToOracle: () => void
  onOpenDetail?: (meme: Meme) => void
}

export function Profile({ address, profile, onGoToOracle, onOpenDetail }: Props) {
  const [memes,          setMemes]          = useState<Meme[]>([])
  const [memesLoading,   setMemesLoading]   = useState(true)
  const [player,         setPlayer]         = useState<PlayerState | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followersList,  setFollowersList]  = useState<string[]>([])
  const [showFollowers,  setShowFollowers]  = useState(false)
  const [followersLoading, setFollowersLoading] = useState(false)

  useEffect(() => {
    setMemesLoading(true)
    fetchMemesByWallet(address)
      .then(setMemes)
      .catch(() => {})
      .finally(() => setMemesLoading(false))
    fetchPlayer(address).then(setPlayer).catch(() => {})
    fetchFollowStats(address).then(s => {
      setFollowersCount(s.followers)
      setFollowingCount(s.following)
    })
  }, [address])

  const openFollowers = async () => {
    setShowFollowers(true)
    if (followersList.length === 0) {
      setFollowersLoading(true)
      fetchFollowers(address)
        .then(setFollowersList)
        .finally(() => setFollowersLoading(false))
    }
  }

  const name      = profile ? (CHAR_NAME[profile.character] ?? profile.character) : '???'
  const heroImage = profile?.characterImageDataUrl ?? profile?.portraitDataUrl ?? (profile ? `/assets/chars/${profile.character}.png` : null)
  const updated   = profile?.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : null

  return (
    <div className="profile-page">

      {/* ── Followers modal ── */}
      {showFollowers && (
        <div className="follow-modal-backdrop" onClick={() => setShowFollowers(false)}>
          <div className="follow-modal" onClick={e => e.stopPropagation()}>
            <div className="follow-modal-header">
              <h3 className="follow-modal-title">Followers ({followersCount})</h3>
              <button className="follow-modal-close" onClick={() => setShowFollowers(false)}>✕</button>
            </div>
            <div className="follow-modal-list">
              {followersLoading ? (
                <p className="follow-modal-empty">Loading…</p>
              ) : followersList.length === 0 ? (
                <p className="follow-modal-empty">No followers yet.</p>
              ) : (
                followersList.map(w => (
                  <div key={w} className="follow-modal-row" onClick={() => setShowFollowers(false)}>
                    <UserChip wallet={w} size="md" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="profile-hero">
        {heroImage
          ? <img src={heroImage} alt={name} className="profile-hero-avatar" />
          : <div className="profile-hero-avatar profile-hero-avatar--placeholder">?</div>
        }
        <div className="profile-hero-info">
          <p className="quiz-oracle-label">YOUR ARCHETYPE</p>
          <h1 className="profile-hero-name">{name}</h1>
          {profile
            ? <p className="profile-hero-desc">{profile.description}</p>
            : (
              <div className="profile-no-archetype">
                <p className="profile-no-archetype-text">No archetype assigned yet.</p>
                <button className="quiz-start-btn profile-oracle-cta" onClick={onGoToOracle}>Go to Onboarding</button>
              </div>
            )
          }
          {updated && <p className="profile-hero-date">Last updated {updated}</p>}

          {/* ── Follow stats ── */}
          <div className="profile-follow-stats">
            <button className="profile-follow-stat-btn" onClick={openFollowers} title="Click to see your followers">
              <span className="profile-follow-stat-num">{followersCount.toLocaleString()}</span>
              <span className="profile-follow-stat-label">Followers</span>
            </button>
            <div className="profile-follow-stat-divider" />
            <div className="profile-follow-stat-btn profile-follow-stat-btn--plain">
              <span className="profile-follow-stat-num">{followingCount.toLocaleString()}</span>
              <span className="profile-follow-stat-label">Following</span>
            </div>
          </div>

          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              {profile.characterImageDataUrl && (
                <a href={profile.characterImageDataUrl} download={`${profile.character}_full.jpg`} className="pfp-modal-download">
                  Download Character
                </a>
              )}
              {profile.portraitDataUrl && (
                <a href={profile.portraitDataUrl} download={`${profile.character}_pfp.jpg`} className="pfp-modal-download">
                  Download PFP
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {player && (
        <div className="profile-section">
          <h3 className="profile-section-title">Stats</h3>
          <div className="profile-progression">
            <div className="profile-xp-row">
              <span className="profile-xp-label">Total XP</span>
              <span className="profile-xp-val">⚡ {player.total_xp.toLocaleString()}</span>
            </div>
            <div className="profile-streaks">
              {[
                { label: 'Login',  count: player.login_streak    },
                { label: 'Create', count: player.creation_streak },
                { label: 'Vote',   count: player.voting_streak   },
              ].map(({ label, count }) => (
                <div key={label} className="profile-streak">
                  <span className="profile-streak-icon">{count >= 3 ? '🔥' : '○'}</span>
                  <span className="profile-streak-label">{label}</span>
                  <span className="profile-streak-count">{count}d</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="profile-section">
        <h3 className="profile-section-title">Badges</h3>
        <BadgeGrid wallet={address} />
      </div>

      {profile && Object.keys(profile.attributes).length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">Traits</h3>
          <div className="quiz-reveal-attrs">
            {Object.entries(profile.attributes).map(([k, v]) => (
              <span key={k} className="pfp-attr-tag">
                <span className="pfp-attr-key">{k}</span> {v}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="profile-section">
        <h3 className="profile-section-title">Memes ({memesLoading ? '…' : memes.length})</h3>
        {memesLoading ? (
          <p className="profile-section-empty">Loading…</p>
        ) : memes.length === 0 ? (
          <p className="profile-section-empty">No memes yet — create one in the Memes tab.</p>
        ) : (
          <div className="profile-memes-grid">
            {memes.map(m => {
              const { virgin, chad } = parseMemeId(m.meme_id)
              return (
                <div
                  key={m.job_id}
                  className="profile-meme-card"
                  onClick={() => onOpenDetail?.(m)}
                  style={onOpenDetail ? { cursor: 'pointer' } : undefined}
                >
                  <img src={imageUrl(m.job_id)} alt={`${virgin} vs ${chad}`} className="profile-meme-img" />
                  <div className="profile-meme-footer">
                    <span className="profile-meme-label">
                      <span className="profile-meme-virgin">{virgin}</span>
                      <span className="profile-meme-vs"> vs </span>
                      <span className="profile-meme-chad">{chad}</span>
                    </span>
                    {m.vote_count > 0 && <span className="profile-meme-votes">↑ {m.vote_count}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="profile-section">
        <h3 className="profile-section-title">Shadow Economy</h3>
        <ShadowEconomy wallet={address} />
      </div>

      <div className="profile-section">
        <h3 className="profile-section-title">X / Twitter</h3>
        <XTimeline wallet={address} />
      </div>

      {profile && (
        <div className="profile-section">
          <button className="quiz-retake-btn" onClick={onGoToOracle}>Retake Oracle Interview</button>
        </div>
      )}

    </div>
  )
}
