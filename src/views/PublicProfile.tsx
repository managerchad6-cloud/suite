// Someone else's profile: their character as a collectible card, where they sit on the Virgin–Chad
// spectrum, their memes (each opens the meme page), badges, activity and wall.
import { useState, useEffect, type CSSProperties } from 'react'
import { fetchMemesByWallet, type Meme } from '../api/memes'
import { fetchStudioMemesByWallet, type StudioMeme } from '../api/studio'
import { fetchFollowStats, toggleFollow, checkIsFollowing } from '../api/follow'
import { fetchFriendStatus, sendFriendRequest, respondToFriendRequest, type FriendStatus } from '../api/friends'
import { fetchPlayer, fetchPlayerBadges, type PlayerState } from '../api/player'
import { CHARACTERS } from '../data/characterLore'
import { bestImage, getPublicProfile, type PublicProfile as Profile } from '../identity/api'
import { archetypeName, displayName } from '../identity/archetypes'
import { useMemberGate } from '../identity/gate'
import { BadgeGrid } from '../components/BadgeGrid'
import { CommentSection } from '../components/CommentSection'
import { ProfileXCard } from '../components/ProfileXCard'
import {
  ActivityList, CharacterCard, EmptyCard, HeroIdentity, MemeGrid, ProfileHero, ProfileTabs, SortToggle, SpectrumBar, Stat,
  alignment, shortWallet, useMemeCards, type MemeSource,
} from '../components/ProfileShowcase'
import { BagFlex } from '../components/BagFlex'

interface Props {
  wallet: string
  onBack: () => void
  /** Open a meme's page: source 'factory' (AI) or 'studio' (hand-made) */
  onOpenMeme?: (source: MemeSource, id: string) => void
  onOpenProfile?: (wallet: string) => void
  onOpenMessages?: (wallet: string) => void
  /** You, looking at your own page as others see it (from your control room) */
  previewOwn?: boolean
}

type Tab = 'memes' | 'badges' | 'activity' | 'wall'
import { useUrlState } from '../lib/urlState'

export function PublicProfile({ wallet, onBack, onOpenMeme, onOpenProfile, onOpenMessages, previewOwn }: Props) {
  const gate = useMemberGate()
  const address = gate.wallet
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  useEffect(() => {
    document.title = `${profile ? displayName(profile) : 'Member'} · Virgin vs Chad`
  }, [profile])
  const [player, setPlayer] = useState<PlayerState | null>(null)
  const [memes, setMemes] = useState<Meme[]>([])
  const [studioMemes, setStudioMemes] = useState<StudioMeme[]>([])
  const [memesLoading, setMemesLoading] = useState(true)
  const [badgeCount, setBadgeCount] = useState<number | null>(null)
  const [followers, setFollowers] = useState<number | null>(null)
  const [following, setFollowing] = useState<number | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followPending, setFollowPending] = useState(false)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [friendRequestId, setFriendRequestId] = useState<number | undefined>(undefined)
  const [friendPending, setFriendPending] = useState(false)
  // In the URL, so a reload or a shared link opens the same tab
  const [tab, setTab] = useUrlState<Tab>('tab', 'memes', ['memes', 'badges', 'activity', 'wall'])
  const [sort, setSort] = useUrlState<'top' | 'new'>('sort', 'top', ['top', 'new'])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setProfile(undefined)
    getPublicProfile(wallet).then(setProfile)
    fetchPlayer(wallet).then(setPlayer).catch(() => setPlayer(null))
    fetchPlayerBadges(wallet).then(b => setBadgeCount(b.badges.length))
    Promise.allSettled([fetchMemesByWallet(wallet), fetchStudioMemesByWallet(wallet)]).then(([fr, sr]) => {
      setMemes(fr.status === 'fulfilled' ? fr.value : [])
      setStudioMemes(sr.status === 'fulfilled' ? sr.value : [])
    }).finally(() => setMemesLoading(false))
    fetchFollowStats(wallet).then(s => { setFollowers(s.followers); setFollowing(s.following) })
  }, [wallet])

  useEffect(() => {
    if (!address) return
    checkIsFollowing(wallet).then(setIsFollowing)
    fetchFriendStatus(wallet).then(r => { setFriendStatus(r.status); setFriendRequestId(r.request_id) })
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
      const result = await toggleFollow(wallet)
      setIsFollowing(result.is_following)
      setFollowers(result.follower_count)
    } catch { /* ignore */ } finally { setFollowPending(false) }
  }

  const handleFriendAction = async () => {
    if (!address || friendPending) return
    setFriendPending(true)
    try {
      if (friendStatus === 'none' || friendStatus === undefined) {
        const r = await sendFriendRequest(wallet)
        setFriendStatus(r.status)
        setFriendRequestId(r.request_id)
      } else if (friendStatus === 'pending_received' && friendRequestId) {
        await respondToFriendRequest(friendRequestId, 'accept')
        setFriendStatus('friends')
      }
    } catch { /* ignore */ } finally { setFriendPending(false) }
  }

  const copyWallet = () => {
    navigator.clipboard?.writeText(wallet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }).catch(() => {})
  }

  const { cards, topKey, votes } = useMemeCards(memes, studioMemes, sort)
  const votesReceived = memesLoading ? null : votes

  const charData = profile ? CHARACTERS.find(c => c.key === profile.archetype) ?? null : null
  const { accent } = alignment(profile?.archetype)
  const art = profile ? profile.avatarUrl ?? profile.fallbackImageUrl : null      // the full character
  const pfp = profile ? bestImage(profile) : null                                   // the square portrait

  // Follow / friend / message (not when you're looking at your own page)
  const actions = previewOwn ? null : (
    <>
      <button className={`pp-btn pp-btn--primary${isFollowing ? ' pp-btn--on' : ''}`} {...gate.lockProps('follow')}
        onClick={gate.guard(handleFollow, 'follow')} disabled={!gate.locked && followPending}>
        {followPending ? '…' : isFollowing ? '✓ Following' : '+ Follow'}
      </button>
      <button className={`pp-btn${friendStatus === 'friends' ? ' pp-btn--on' : ''}`} {...gate.lockProps('add friends')}
        onClick={gate.guard(handleFriendAction, 'add friends')}
        disabled={!gate.locked && (friendPending || friendStatus === 'pending_sent' || friendStatus === 'friends')}>
        {friendPending ? '…'
          : friendStatus === 'friends' ? '✓ Friends'
          : friendStatus === 'pending_sent' ? 'Request sent'
          : friendStatus === 'pending_received' ? 'Accept request'
          : '🤝 Add friend'}
      </button>
      {onOpenMessages && (
        <button className="pp-btn" {...gate.lockProps('message')} onClick={gate.guard(() => onOpenMessages(wallet), 'message')}>✉️ Message</button>
      )}
    </>
  )

  return (
    <div className="pp-page" style={{ '--pp-accent': accent } as CSSProperties}>
      <div className="pp-topbar">
        <button className="char-detail-back" onClick={onBack}>{previewOwn ? '← Your control room' : '← Back'}</button>
        <button className="pp-wallet" onClick={copyWallet} title={`${wallet} (click to copy)`}>
          {copied ? 'Copied ✓' : shortWallet(wallet)}
        </button>
      </div>
      {previewOwn && <div className="pp-preview-banner">👁 This is how others see your profile</div>}

      {profile ? (
        /* Like a social profile: their banner, their PFP over it, who they are, their character rising into it */
        <div className="pp-x-hero">
          <ProfileXCard
            accent={accent}
            art={art ?? profile.fallbackImageUrl}
            pfp={pfp ?? profile.fallbackImageUrl}
            name={displayName(profile)}
            bannerUrl={profile.bannerUrl}
            actions={actions}
            handle={<>
              <button onClick={copyWallet} title={wallet}>{copied ? 'Copied ✓' : `@${shortWallet(wallet)}`}</button>
              <span>{archetypeName(profile.archetype)}</span>
              {charData && <span className="pc-x-rarity">{charData.rarity} · {charData.tier}</span>}
            </>}
            stats={<>
              <span><b>{followers ?? '…'}</b> followers</span>
              <span><b>{following ?? '…'}</b> following</span>
              <button onClick={() => setTab('memes')}><b>{memesLoading ? '…' : cards.length}</b> memes</button>
              <button onClick={() => { setSort('top'); setTab('memes') }}><b>{votesReceived ?? '…'}</b> votes</button>
              <button onClick={() => setTab('badges')}><b>{badgeCount ?? '…'}</b> badges</button>
            </>}
            bio={profile.description}
            tagline={charData?.tagline}
            meta={<>
              {profile.memberSince && <span>📅 Joined {new Date(profile.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
              {player && <span>⚡ {player.total_xp.toLocaleString()} XP</span>}
            </>}
          >
            <SpectrumBar archetype={profile.archetype} player={player} />
          </ProfileXCard>
        </div>
      ) : (
        <ProfileHero art={null} card={<EmptyCard loading={profile === undefined} initials={wallet.slice(0, 2).toUpperCase()} />}>
          <HeroIdentity pfp={null} kicker="Member" loading={profile === undefined} name={null} />
          {profile === null && actions}
        </ProfileHero>
      )}

      <BagFlex wallet={wallet} />

      <ProfileTabs tab={tab} onTab={setTab}
        tabs={[['memes', 'Memes', cards.length], ['badges', 'Badges', badgeCount], ['activity', 'Activity', null], ['wall', 'Wall', null]]}
        extra={tab === 'memes' && cards.length > 1 && <SortToggle sort={sort} onSort={setSort} />} />

      <div className="pp-panel">
        {tab === 'memes' && <MemeGrid cards={cards} topKey={topKey} loading={memesLoading} empty="No memes yet. Stay tuned." onOpenMeme={onOpenMeme} />}
        {tab === 'badges' && <BadgeGrid wallet={wallet} />}
        {tab === 'activity' && <ActivityList wallet={wallet} onOpenMeme={onOpenMeme} />}
        {tab === 'wall' && <CommentSection source="profile" memeId={wallet} onOpenProfile={onOpenProfile} />}
      </div>
    </div>
  )
}
