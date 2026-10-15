import { useState, useEffect } from 'react'
import { fetchMemesByWallet, imageUrl, parseMemeId, type Meme } from '../api/memes'
import { fetchStudioMemesByWallet, studioMemeImageUrl, type StudioMeme } from '../api/studio'
import { fetchCreatorEngagement, type CreatorEngagement } from '../api/twitter'
import { profileImage, requestPortrait, retryAvatar } from '../identity/api'
import { useIdentity } from '../identity/IdentityProvider'
import { archetypeName } from '../identity/archetypes'
import { fetchPlayer, type PlayerState } from '../api/player'
import { fetchFollowStats, fetchFollowers } from '../api/follow'
import { fetchFriends } from '../api/friends'
import { CHARACTERS } from '../data/characterLore'
import { BadgeGrid } from '../components/BadgeGrid'
import { ShadowEconomy } from '../components/ShadowEconomy'
import { UserChip } from '../components/UserChip'
import { XTimeline } from '../components/XTimeline'
import { CommentSection } from '../components/CommentSection'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface Props {
  onGoToOracle: () => void
  onOpenDetail?: (meme: Meme) => void
  onOpenStudioMeme?: (id: string) => void
  onOpenProfile?: (wallet: string) => void
}

export function Profile({ onGoToOracle, onOpenDetail, onOpenStudioMeme, onOpenProfile }: Props) {
  // Member-only view (the route sends everyone else away): the wallet is always set here
  const { memberWallet, profile, setMe } = useIdentity()
  const address = memberWallet ?? ''
  const [imageBusy, setImageBusy] = useState(false)
  const [memes,            setMemes]            = useState<Meme[]>([])
  const [studioMemes,      setStudioMemes]      = useState<StudioMeme[]>([])
  const [memesLoading,     setMemesLoading]     = useState(true)
  const [engagement,       setEngagement]       = useState<CreatorEngagement | null>(null)
  const [player,           setPlayer]           = useState<PlayerState | null>(null)
  const [followersCount,   setFollowersCount]   = useState(0)
  const [followingCount,   setFollowingCount]   = useState(0)
  const [followersList,    setFollowersList]    = useState<string[]>([])
  const [showFollowers,    setShowFollowers]    = useState(false)
  const [followersLoading, setFollowersLoading] = useState(false)
  const [friendsCount,     setFriendsCount]     = useState(0)
  const [friendsList,      setFriendsList]      = useState<string[]>([])
  const [showFriends,      setShowFriends]      = useState(false)
  const [friendsLoading,   setFriendsLoading]   = useState(false)

  useEffect(() => {
    setMemesLoading(true)
    Promise.all([
      fetchMemesByWallet(address).catch(() => [] as Meme[]),
      fetchStudioMemesByWallet(address).catch(() => [] as StudioMeme[]),
    ]).then(([factory, studio]) => {
      setMemes(factory)
      setStudioMemes(studio)
      setMemesLoading(false)
    })
    fetchPlayer(address).then(setPlayer).catch(() => {})
    fetchFollowStats(address).then(s => {
      setFollowersCount(s.followers)
      setFollowingCount(s.following)
    })
    fetchFriends(address).then(f => setFriendsCount(f.length))
    fetchCreatorEngagement(address).then(setEngagement).catch(() => {})
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

  const openFriends = async () => {
    setShowFriends(true)
    if (friendsList.length === 0) {
      setFriendsLoading(true)
      fetchFriends(address)
        .then(setFriendsList)
        .finally(() => setFriendsLoading(false))
    }
  }

  const charData  = profile ? (CHARACTERS.find(c => c.key === profile.archetype) ?? null) : null
  const charName  = charData?.name ?? (profile ? archetypeName(profile.archetype) : '???')
  const name      = profile?.title ? `${profile.title} ${charName}` : charName
  const updated   = profile?.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : null

  // Character art is drawn after joining and can fail without costing membership: offer a retry
  const runImageJob = async (kind: 'retry' | 'portrait') => {
    if (imageBusy) return
    setImageBusy(true)
    try { setMe((kind === 'retry' ? await retryAvatar() : await requestPortrait()).me) } catch { /* shown by status */ }
    finally { setImageBusy(false) }
  }

  const totalMemes = memes.length + studioMemes.length
  const hasEngagement = engagement && (
    engagement.total_likes > 0 || engagement.total_rts > 0 ||
    engagement.total_replies > 0 || engagement.total_views > 0
  )

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

      {/* ── Friends modal ── */}
      {showFriends && (
        <div className="follow-modal-backdrop" onClick={() => setShowFriends(false)}>
          <div className="follow-modal" onClick={e => e.stopPropagation()}>
            <div className="follow-modal-header">
              <h3 className="follow-modal-title">Friends ({friendsCount})</h3>
              <button className="follow-modal-close" onClick={() => setShowFriends(false)}>✕</button>
            </div>
            <div className="follow-modal-list">
              {friendsLoading ? (
                <p className="follow-modal-empty">Loading…</p>
              ) : friendsList.length === 0 ? (
                <p className="follow-modal-empty">No friends yet.</p>
              ) : (
                friendsList.map(w => (
                  <div key={w} className="follow-modal-row" onClick={() => setShowFriends(false)}>
                    <UserChip wallet={w} size="md" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="profile-hero">
        {profile
          ? (
            <img src={profile.avatar.url ?? profileImage(profile)} alt={name} className="profile-hero-avatar" />
          )
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
            <div className="profile-follow-stat-divider" />
            <button className="profile-follow-stat-btn" onClick={openFriends} title="Click to see your friends">
              <span className="profile-follow-stat-num">{friendsCount.toLocaleString()}</span>
              <span className="profile-follow-stat-label">Friends</span>
            </button>
          </div>

          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              {profile.avatar.status === 'generating' && <span className="profile-hero-date">Drawing your character…</span>}
              {profile.avatar.status === 'failed' && (
                <button className="pfp-modal-download" onClick={() => runImageJob('retry')} disabled={imageBusy}>
                  {imageBusy ? '…' : 'Character art failed — try again'}
                </button>
              )}
              {profile.avatar.url && (
                <a href={profile.avatar.url} download={`${profile.archetype}_full`} className="pfp-modal-download">
                  Download Character
                </a>
              )}
              {profile.portrait.url ? (
                <a href={profile.portrait.url} download={`${profile.archetype}_pfp`} className="pfp-modal-download">
                  Download PFP
                </a>
              ) : profile.avatar.status === 'ready' && (
                <button className="pfp-modal-download" onClick={() => runImageJob('portrait')}
                  disabled={imageBusy || profile.portrait.status === 'generating'}>
                  {profile.portrait.status === 'generating' || imageBusy ? 'Generating PFP…' : 'Generate PFP'}
                </button>
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

      {/* ── Memes: factory + studio ── */}
      <div className="profile-section">
        <h3 className="profile-section-title">Memes ({memesLoading ? '…' : totalMemes})</h3>

        {memesLoading ? (
          <p className="profile-section-empty">Loading…</p>
        ) : totalMemes === 0 ? (
          <p className="profile-section-empty">No memes yet — create one in the Memes tab.</p>
        ) : (
          <>
            <div className="profile-memes-grid">

              {/* Factory memes */}
              {memes.map(m => {
                const { virgin, chad } = parseMemeId(m.meme_id)
                return (
                  <div
                    key={`factory-${m.job_id}`}
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

              {/* Studio memes */}
              {studioMemes.map(m => {
                const title = m.titles?.[0] ?? m.characters?.map(c => c.replace(/_/g, ' ')).join(' vs ') ?? 'Studio meme'
                return (
                  <div
                    key={`studio-${m.id}`}
                    className="profile-meme-card"
                    onClick={() => onOpenStudioMeme?.(m.id)}
                    style={onOpenStudioMeme ? { cursor: 'pointer' } : undefined}
                  >
                    <img src={studioMemeImageUrl(m.id)} alt={title} className="profile-meme-img" />
                    <div className="profile-meme-footer">
                      <span className="profile-meme-label profile-meme-label--studio" title={title}>
                        {title}
                      </span>
                      <span className="profile-meme-badge--studio">Studio</span>
                    </div>
                  </div>
                )
              })}

            </div>

            {/* ── Social metrics aggregated across all memes ── */}
            {hasEngagement && (
              <div className="profile-meme-social">
                <span className="profile-meme-social-label">𝕏 reach across all memes</span>
                <div className="profile-meme-social-stats">
                  {engagement!.total_shares > 0 && (
                    <span className="profile-meme-social-stat">
                      <span className="profile-meme-social-icon">🔗</span>
                      <span>{fmt(engagement!.total_shares)} shares</span>
                    </span>
                  )}
                  {engagement!.total_likes > 0 && (
                    <span className="profile-meme-social-stat">
                      <span className="profile-meme-social-icon">❤</span>
                      <span>{fmt(engagement!.total_likes)}</span>
                    </span>
                  )}
                  {engagement!.total_rts > 0 && (
                    <span className="profile-meme-social-stat">
                      <span className="profile-meme-social-icon">🔁</span>
                      <span>{fmt(engagement!.total_rts)}</span>
                    </span>
                  )}
                  {engagement!.total_replies > 0 && (
                    <span className="profile-meme-social-stat">
                      <span className="profile-meme-social-icon">💬</span>
                      <span>{fmt(engagement!.total_replies)}</span>
                    </span>
                  )}
                  {engagement!.total_views > 0 && (
                    <span className="profile-meme-social-stat">
                      <span className="profile-meme-social-icon">👁</span>
                      <span>{fmt(engagement!.total_views)}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
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

      <div className="profile-section">
        <h3 className="profile-section-title">Wall</h3>
        <CommentSection source="profile" memeId={address} onOpenProfile={onOpenProfile} />
      </div>

      {profile && (
        <div className="profile-section">
          <button className="quiz-retake-btn" onClick={onGoToOracle}>Retake Oracle Interview</button>
        </div>
      )}

    </div>
  )
}
