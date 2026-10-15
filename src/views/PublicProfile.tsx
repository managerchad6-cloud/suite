import { useState, useEffect } from 'react'
import { fetchMemesByWallet, imageUrl, parseMemeId, type Meme } from '../api/memes'
import { fetchStudioMemesByWallet, studioMemeImageUrl, type StudioMeme } from '../api/studio'
import { fetchFollowStats, toggleFollow, checkIsFollowing } from '../api/follow'
import { fetchFriendStatus, sendFriendRequest, respondToFriendRequest, type FriendStatus } from '../api/friends'
import { CHARACTERS } from '../data/characterLore'
import { CommentSection } from '../components/CommentSection'

type RemoteProfile = { character: string; title?: string; portraitDataUrl?: string } | null

async function fetchRemoteProfile(wallet: string): Promise<RemoteProfile> {
  try {
    const r = await fetch(`/profiles/${encodeURIComponent(wallet)}`)
    return r.ok ? r.json() : null
  } catch { return null }
}

interface Props {
  wallet: string
  address: string | null
  onBack: () => void
  onOpenDetail?: (meme: Meme) => void
  onOpenProfile?: (wallet: string) => void
  onOpenMessages?: (wallet: string) => void
}

export function PublicProfile({ wallet, address, onBack, onOpenDetail, onOpenProfile, onOpenMessages }: Props) {
  const [profile,      setProfile]      = useState<RemoteProfile | undefined>(undefined)
  const [memes,        setMemes]        = useState<Meme[]>([])
  const [studioMemes,  setStudioMemes]  = useState<StudioMeme[]>([])
  const [memesLoading, setMemesLoading] = useState(true)
  const [followers,    setFollowers]    = useState<number>(0)
  const [following,    setFollowing]    = useState<number>(0)
  const [isFollowing,  setIsFollowing]  = useState(false)
  const [followPending, setFollowPending] = useState(false)
  const [friendStatus, setFriendStatus]   = useState<FriendStatus>('none')
  const [friendRequestId, setFriendRequestId] = useState<number | undefined>(undefined)
  const [friendPending, setFriendPending] = useState(false)

  useEffect(() => {
    fetchRemoteProfile(wallet).then(setProfile)
    Promise.allSettled([
      fetchMemesByWallet(wallet),
      fetchStudioMemesByWallet(wallet),
    ]).then(([fr, sr]) => {
      if (fr.status === 'fulfilled') setMemes(fr.value)
      if (sr.status === 'fulfilled') setStudioMemes(sr.value)
    }).finally(() => setMemesLoading(false))
    fetchFollowStats(wallet).then(s => { setFollowers(s.followers); setFollowing(s.following) })
    if (address) {
      checkIsFollowing(address, wallet).then(setIsFollowing)
      fetchFriendStatus(address, wallet).then(r => { setFriendStatus(r.status); setFriendRequestId(r.request_id) })
    }
  }, [wallet, address])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const handleFollow = async () => {
    if (!address || followPending) return
    setFollowPending(true)
    try {
      const result = await toggleFollow(address, wallet)
      setIsFollowing(result.is_following)
      setFollowers(result.follower_count)
    } catch { /* ignore */ } finally { setFollowPending(false) }
  }

  const handleFriendAction = async () => {
    if (!address || friendPending) return
    setFriendPending(true)
    try {
      if (friendStatus === 'none' || friendStatus === undefined) {
        const r = await sendFriendRequest(address, wallet)
        setFriendStatus(r.status)
        setFriendRequestId(r.request_id)
      } else if (friendStatus === 'pending_received' && friendRequestId) {
        await respondToFriendRequest(friendRequestId, 'accept')
        setFriendStatus('friends')
      }
    } catch { /* ignore */ } finally { setFriendPending(false) }
  }

  const charData     = profile ? CHARACTERS.find(c => c.key === profile.character) ?? null : null
  const stockSrc     = charData
    ? `/assets/chars/${charData.file}.${charData.ext}`
    : profile ? `/assets/chars/${profile.character}.png` : null
  const baseCharName = charData?.name ?? profile?.character ?? null
  const charName = baseCharName && profile?.title ? `${profile.title} ${baseCharName}` : baseCharName

  return (
    <div className="pub-profile-page">

      {/* ── Top bar ── */}
      <div className="pub-profile-topbar">
        <button className="char-detail-back" onClick={onBack}>← Back</button>
        <span className="pub-profile-topbar-addr" title={wallet}>{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
      </div>

      {/* ── Hero banner ── */}
      <div className="pub-profile-hero">
        <div className="pub-profile-avatar-wrap">
          {profile === undefined ? (
            <div className="pub-profile-avatar-pulse" />
          ) : profile ? (
            <img
              src={`/profiles/${encodeURIComponent(wallet)}/portrait/full`}
              alt={charName ?? ''}
              className="pub-profile-avatar-img"
              onError={e => {
                const img = e.currentTarget
                if (!img.dataset.triedPfp) {
                  img.dataset.triedPfp = '1'
                  img.onerror = () => { img.onerror = null; if (stockSrc) img.src = stockSrc }
                  img.src = `/profiles/${encodeURIComponent(wallet)}/portrait`
                } else {
                  img.onerror = null
                  if (stockSrc) img.src = stockSrc
                }
              }}
            />
          ) : (
            <div className="pub-profile-avatar-fallback">{wallet.slice(0, 2).toUpperCase()}</div>
          )}
        </div>

        <div className="pub-profile-hero-info">
          <span className="pub-profile-archetype-label">ARCHETYPE</span>

          {profile === undefined ? (
            <div className="pub-profile-name-skeleton" />
          ) : charName ? (
            <>
              <h1 className="pub-profile-name">{charName}</h1>
              {charData && (
                <p className="pub-profile-tagline">"{charData.tagline}"</p>
              )}
            </>
          ) : (
            <h1 className="pub-profile-name pub-profile-name--none">No archetype yet</h1>
          )}

          {/* ── Follow stats row ── */}
          <div className="pub-profile-stats-row">
            <div className="pub-profile-stat">
              <span className="pub-profile-stat-num">{followers.toLocaleString()}</span>
              <span className="pub-profile-stat-label">Followers</span>
            </div>
            <div className="pub-profile-stat-divider" />
            <div className="pub-profile-stat">
              <span className="pub-profile-stat-num">{following.toLocaleString()}</span>
              <span className="pub-profile-stat-label">Following</span>
            </div>
            <div className="pub-profile-stat-divider" />
            <div className="pub-profile-stat">
              <span className="pub-profile-stat-num">{memesLoading ? '…' : memes.length + studioMemes.length}</span>
              <span className="pub-profile-stat-label">Memes</span>
            </div>
          </div>

          {/* ── Follow / Friend / Message actions ── */}
          {address ? (
            <div className="pub-profile-actions">
              <button
                className={`pub-profile-follow-btn ${isFollowing ? 'pub-profile-follow-btn--following' : ''}`}
                onClick={handleFollow}
                disabled={followPending}
              >
                {followPending ? '…' : isFollowing ? '✓ Following' : '+ Follow'}
              </button>
              <button
                className={`pub-profile-friend-btn ${friendStatus === 'friends' ? 'pub-profile-friend-btn--active' : ''}`}
                onClick={handleFriendAction}
                disabled={friendPending || friendStatus === 'pending_sent' || friendStatus === 'friends'}
              >
                {friendPending ? '…'
                  : friendStatus === 'friends' ? '✓ Friends'
                  : friendStatus === 'pending_sent' ? 'Request Sent'
                  : friendStatus === 'pending_received' ? 'Accept Request'
                  : '🤝 Add Friend'}
              </button>
              {onOpenMessages && (
                <button className="pub-profile-message-btn" onClick={() => onOpenMessages(wallet)}>
                  ✉️ Message
                </button>
              )}
            </div>
          ) : (
            <span className="pub-profile-follow-hint">Connect wallet to follow</span>
          )}
        </div>
      </div>

      {/* ── Memes grid ── */}
      <div className="profile-section">
        <h3 className="profile-section-title">Memes</h3>
        {memesLoading ? (
          <p className="profile-section-empty">Loading…</p>
        ) : memes.length === 0 && studioMemes.length === 0 ? (
          <p className="profile-section-empty">No memes created yet.</p>
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
            {studioMemes.map(m => {
              const label = m.characters.map(c => c.replace(/_/g, ' ')).join(' vs ')
              return (
                <div key={m.id} className="profile-meme-card">
                  <img src={studioMemeImageUrl(m.id)} alt={label} className="profile-meme-img" />
                  <div className="profile-meme-footer">
                    <span className="profile-meme-label" style={{ textTransform: 'capitalize' }}>{label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Wall ── */}
      <div className="profile-section">
        <h3 className="profile-section-title">Wall</h3>
        <CommentSection jobId={wallet} source="profile" address={address} onOpenProfile={onOpenProfile} />
      </div>

    </div>
  )
}
