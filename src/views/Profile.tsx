// Your own profile: the same collectible-card hero others see at /u/:wallet, plus "Your stuff"
// (credits and $VVC holder status, your character files and PFP, retake) and owner-only tabs
// (𝕏 timeline, shadow economy).
import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { fetchMemesByWallet, type Meme } from '../api/memes'
import { fetchStudioMemesByWallet, type StudioMeme } from '../api/studio'
import { fetchCreatorEngagement, type CreatorEngagement } from '../api/twitter'
import { fetchCreditBalance, fetchHolderStatus, type HolderStatus } from '../api/credits'
import { requestPortrait, retryAvatar } from '../identity/api'
import { useIdentity } from '../identity/IdentityProvider'
import { archetypeName, displayName } from '../identity/archetypes'
import { fetchPlayer, fetchPlayerBadges, type PlayerState } from '../api/player'
import { fetchFollowStats, fetchFollowers } from '../api/follow'
import { fetchFriends } from '../api/friends'
import { CHARACTERS } from '../data/characterLore'
import { BadgeGrid } from '../components/BadgeGrid'
import { BuyCreditsModal } from '../components/BuyCreditsModal'
import { BuyVvcButton } from '../components/BuyVvc'
import { ShadowEconomy } from '../components/ShadowEconomy'
import { UserChip } from '../components/UserChip'
import { XTimeline } from '../components/XTimeline'
import { CommentSection } from '../components/CommentSection'
import {
  ActivityList, CharacterCard, EmptyCard, HeroIdentity, MemeGrid, ProfileHero, ProfileTabs, SortToggle, SpectrumBar, Stat,
  alignment, shortWallet, useMemeCards, type MemeSource,
} from '../components/ProfileShowcase'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface Props {
  onGoToOracle: () => void
  /** Open a meme's page: source 'factory' (AI) or 'studio' (hand-made) */
  onOpenMeme?: (source: MemeSource, id: string) => void
  onOpenProfile?: (wallet: string) => void
}

type Tab = 'memes' | 'badges' | 'activity' | 'x' | 'economy' | 'wall'

/** A list of wallets (followers, friends) in a modal */
function WalletListModal({ title, wallets, empty, onClose }: { title: string; wallets: string[] | null; empty: string; onClose: () => void }) {
  return (
    <div className="follow-modal-backdrop" onClick={onClose}>
      <div className="follow-modal" onClick={e => e.stopPropagation()}>
        <div className="follow-modal-header">
          <h3 className="follow-modal-title">{title}</h3>
          <button className="follow-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="follow-modal-list">
          {wallets === null ? <p className="follow-modal-empty">Loading…</p>
            : wallets.length === 0 ? <p className="follow-modal-empty">{empty}</p>
            : wallets.map(w => (
              <div key={w} className="follow-modal-row" onClick={onClose}>
                <UserChip wallet={w} size="md" />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

export function Profile({ onGoToOracle, onOpenMeme, onOpenProfile }: Props) {
  // Member-only view (the route sends everyone else away): the wallet is always set here
  const { memberWallet, me, profile, setMe } = useIdentity()
  const address = memberWallet ?? ''
  const memberSince = me && me.state !== 'guest' ? me.account.memberSince : null
  const [imageBusy, setImageBusy] = useState(false)
  const [memes,        setMemes]        = useState<Meme[]>([])
  const [studioMemes,  setStudioMemes]  = useState<StudioMeme[]>([])
  const [memesLoading, setMemesLoading] = useState(true)
  const [engagement,   setEngagement]   = useState<CreatorEngagement | null>(null)
  const [player,       setPlayer]       = useState<PlayerState | null>(null)
  const [badgeCount,   setBadgeCount]   = useState<number | null>(null)
  const [followers,    setFollowers]    = useState<number | null>(null)
  const [following,    setFollowing]    = useState<number | null>(null)
  const [friends,      setFriends]      = useState<string[] | null>(null)
  const [followerList, setFollowerList] = useState<string[] | null>(null)
  const [modal,        setModal]        = useState<'followers' | 'friends' | null>(null)
  const [balance,      setBalance]      = useState<number | null>(null)
  const [holder,       setHolder]       = useState<HolderStatus | null>(null)
  const [buyOpen,      setBuyOpen]      = useState(false)
  const [tab,  setTab]  = useState<Tab>('memes')
  const [sort, setSort] = useState<'top' | 'new'>('top')
  const [copied, setCopied] = useState<'wallet' | 'link' | null>(null)

  useEffect(() => {
    setMemesLoading(true)
    Promise.allSettled([fetchMemesByWallet(address), fetchStudioMemesByWallet(address)]).then(([fr, sr]) => {
      setMemes(fr.status === 'fulfilled' ? fr.value : [])
      setStudioMemes(sr.status === 'fulfilled' ? sr.value : [])
    }).finally(() => setMemesLoading(false))
    fetchPlayer(address).then(setPlayer).catch(() => {})
    fetchPlayerBadges(address).then(b => setBadgeCount(b.badges.length)).catch(() => {})
    fetchFollowStats(address).then(s => { setFollowers(s.followers); setFollowing(s.following) })
    fetchFriends(address).then(setFriends).catch(() => setFriends([]))
    fetchCreatorEngagement(address).then(setEngagement).catch(() => {})
    fetchHolderStatus().then(setHolder).catch(() => {})
  }, [address])

  // Credits: the same balance as the nav, kept in step through the app-wide events
  const refreshBalance = useCallback(() => { fetchCreditBalance().then(d => setBalance(d.balance)) }, [])
  useEffect(() => {
    refreshBalance()
    const onHolder = (e: Event) => setHolder((e as CustomEvent<HolderStatus>).detail)
    window.addEventListener('vvc:credits-changed', refreshBalance)
    window.addEventListener('vvc:holder-status', onHolder)
    return () => {
      window.removeEventListener('vvc:credits-changed', refreshBalance)
      window.removeEventListener('vvc:holder-status', onHolder)
    }
  }, [refreshBalance])

  const openFollowers = () => {
    setModal('followers')
    if (followerList === null) fetchFollowers(address).then(setFollowerList).catch(() => setFollowerList([]))
  }

  const copy = (what: 'wallet' | 'link') => {
    const text = what === 'wallet' ? address : `${window.location.origin}/u/${address}`
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1400) }).catch(() => {})
  }

  // Character art is drawn after joining and can fail without costing membership: offer a retry
  const runImageJob = async (kind: 'retry' | 'portrait') => {
    if (imageBusy) return
    setImageBusy(true)
    try { setMe((kind === 'retry' ? await retryAvatar() : await requestPortrait()).me) } catch { /* shown by status */ }
    finally { setImageBusy(false) }
  }

  const { cards, topKey, votes } = useMemeCards(memes, studioMemes, sort)
  const charData = profile ? CHARACTERS.find(c => c.key === profile.archetype) ?? null : null
  const { accent } = alignment(player)
  const art = profile ? profile.avatar.url ?? profile.fallbackImageUrl : null        // the full character
  const pfp = profile ? profile.portrait.url ?? profile.fallbackImageUrl : null      // the square portrait
  const avatarStatus = profile?.avatar.status
  const portraitBusy = imageBusy || profile?.portrait.status === 'generating'
  const updated = profile?.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : null
  const hasEngagement = !!engagement && (
    engagement.total_likes > 0 || engagement.total_rts > 0 ||
    engagement.total_replies > 0 || engagement.total_views > 0
  )

  const cardOverlay = avatarStatus === 'generating' ? <span className="pp-card-status">Drawing your character…</span>
    : avatarStatus === 'failed' ? (
      <button className="pp-btn pp-btn--primary" onClick={() => runImageJob('retry')} disabled={imageBusy}>
        {imageBusy ? '…' : 'Art failed — try again'}
      </button>
    ) : null

  return (
    <div className="pp-page" style={{ '--pp-accent': accent } as CSSProperties}>
      {modal === 'followers' && (
        <WalletListModal title={`Followers (${followers ?? 0})`} wallets={followerList} empty="No followers yet." onClose={() => setModal(null)} />
      )}
      {modal === 'friends' && (
        <WalletListModal title={`Friends (${friends?.length ?? 0})`} wallets={friends} empty="No friends yet." onClose={() => setModal(null)} />
      )}
      {buyOpen && (
        <BuyCreditsModal wallet={address} currentBalance={balance ?? 0} onClose={() => setBuyOpen(false)}
          onPurchased={b => { setBalance(b); window.dispatchEvent(new CustomEvent('vvc:credits-changed')) }} />
      )}

      <div className="pp-topbar">
        <span className="pp-topbar-title">Your profile</span>
        <div className="pp-topbar-right">
          <button className="pp-wallet" onClick={() => copy('link')} title="Copy the link others use to see your profile">
            {copied === 'link' ? 'Link copied ✓' : '🔗 Share'}
          </button>
          <button className="pp-wallet" onClick={() => copy('wallet')} title={`${address} (click to copy)`}>
            {copied === 'wallet' ? 'Copied ✓' : shortWallet(address)}
          </button>
        </div>
      </div>

      <ProfileHero art={art} card={profile
        ? <CharacterCard image={art} name={archetypeName(profile.archetype)} tier={charData?.tier} rarity={charData?.rarity ?? 'common'} accent={accent} overlay={cardOverlay} />
        : <EmptyCard loading={false} initials={address.slice(0, 2).toUpperCase()} />}>
        <HeroIdentity
          pfp={pfp}
          kicker={profile ? `Your archetype · ${archetypeName(profile.archetype)}${charData ? ` · ${charData.tier}` : ''}` : 'Member'}
          sinceIso={memberSince}
          name={profile ? displayName(profile) : null}
          tagline={charData?.tagline}
          description={profile?.description}
        />

        {!profile && (
          <div className="pp-actions">
            <button className="pp-btn pp-btn--primary" onClick={onGoToOracle}>Go to Onboarding</button>
          </div>
        )}

        {player && <SpectrumBar player={player} />}

        <div className="pp-stats">
          <Stat value={followers} label="Followers" onClick={openFollowers} title="See your followers" />
          <Stat value={following} label="Following" />
          <Stat value={friends?.length ?? null} label="Friends" onClick={() => setModal('friends')} title="See your friends" />
          <Stat value={memesLoading ? null : cards.length} label="Memes" onClick={() => setTab('memes')} />
          <Stat value={memesLoading ? null : votes} label="Votes" onClick={() => { setSort('top'); setTab('memes') }} />
          <Stat value={badgeCount} label="Badges" onClick={() => setTab('badges')} />
        </div>
      </ProfileHero>

      {/* ── Your stuff: only you see this ── */}
      <section className="pp-owner" aria-label="Your stuff">
        <div className="pp-owner-card">
          <h3 className="pp-owner-title">Credits</h3>
          <div className="pp-owner-balance">
            <span className="pp-owner-big">⚡ {balance === null ? '…' : balance.toLocaleString()}</span>
            <span className="pp-owner-sub">credits</span>
          </div>
          {holder && (
            <p className={`pp-owner-holder${holder.isHolder ? ' pp-owner-holder--on' : ''}`}>
              {holder.isHolder
                ? <>${holder.symbol} holder ✓ · {holder.weeklyCredits} free credits a week
                    {holder.nextRefillAt && <> · next {new Date(holder.nextRefillAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>}</>
                : <>Hold {holder.minBalance.toLocaleString()} ${holder.symbol} for {holder.weeklyCredits} free credits every week</>}
            </p>
          )}
          <div className="pp-owner-actions">
            <button className="pp-btn pp-btn--primary" onClick={() => setBuyOpen(true)}>Buy credits</button>
            <BuyVvcButton />
          </div>
        </div>

        {profile && (
          <div className="pp-owner-card">
            <h3 className="pp-owner-title">Your character</h3>
            <div className="pp-owner-files">
              <figure className="pp-owner-file">
                <div className="pp-owner-thumb pp-owner-thumb--art">{art && <img src={art} alt="Full character" />}</div>
                <figcaption>
                  {profile.avatar.url
                    ? <a href={profile.avatar.url} download={`${profile.archetype}_full`}>⬇ Character</a>
                    : <span>{avatarStatus === 'generating' ? 'Drawing…' : avatarStatus === 'failed' ? 'Failed' : 'Stock art'}</span>}
                </figcaption>
              </figure>
              <figure className="pp-owner-file">
                <div className="pp-owner-thumb">{profile.portrait.url ? <img src={profile.portrait.url} alt="PFP" /> : <span>{portraitBusy ? '…' : 'No PFP'}</span>}</div>
                <figcaption>
                  {profile.portrait.url
                    ? <a href={profile.portrait.url} download={`${profile.archetype}_pfp`}>⬇ PFP</a>
                    : <span>{profile.portrait.status === 'generating' ? 'Generating…' : 'Square portrait'}</span>}
                </figcaption>
              </figure>
            </div>
            {Object.keys(profile.attributes).length > 0 && (
              <div className="pp-owner-traits">
                {Object.entries(profile.attributes).map(([k, v]) => (
                  <span key={k} className="pp-owner-trait"><b>{k}</b> {v}</span>
                ))}
              </div>
            )}
            <div className="pp-owner-actions">
              {avatarStatus === 'failed' && (
                <button className="pp-btn" onClick={() => runImageJob('retry')} disabled={imageBusy}>{imageBusy ? '…' : 'Retry character art'}</button>
              )}
              {!profile.portrait.url && avatarStatus === 'ready' && (
                <button className="pp-btn pp-btn--primary" onClick={() => runImageJob('portrait')} disabled={portraitBusy}>
                  {portraitBusy ? 'Generating PFP…' : 'Generate PFP'}
                </button>
              )}
              <button className="pp-btn" onClick={onGoToOracle} title="New interview, or reroll your result">Retake Oracle Interview</button>
            </div>
            {updated && <p className="pp-owner-note">Last updated {updated}</p>}
          </div>
        )}
      </section>

      <ProfileTabs tab={tab} onTab={setTab}
        tabs={[['memes', 'Memes', cards.length], ['badges', 'Badges', badgeCount], ['activity', 'Activity', null],
          ['x', '𝕏', null], ['economy', 'Earnings', null], ['wall', 'Wall', null]]}
        extra={tab === 'memes' && cards.length > 1 && <SortToggle sort={sort} onSort={setSort} />} />

      <div className="pp-panel">
        {tab === 'memes' && (
          <MemeGrid cards={cards} topKey={topKey} loading={memesLoading} onOpenMeme={onOpenMeme}
            empty="No memes yet — create one in the Memes tab." />
        )}
        {tab === 'badges' && <BadgeGrid wallet={address} />}
        {tab === 'activity' && <ActivityList wallet={address} onOpenMeme={onOpenMeme} />}
        {tab === 'x' && (
          <>
            {hasEngagement && (
              <div className="pp-reach">
                <span className="pp-reach-label">𝕏 reach across all your memes</span>
                {engagement!.total_shares > 0 && <span>🔗 {fmt(engagement!.total_shares)} shares</span>}
                {engagement!.total_likes > 0 && <span>❤ {fmt(engagement!.total_likes)}</span>}
                {engagement!.total_rts > 0 && <span>🔁 {fmt(engagement!.total_rts)}</span>}
                {engagement!.total_replies > 0 && <span>💬 {fmt(engagement!.total_replies)}</span>}
                {engagement!.total_views > 0 && <span>👁 {fmt(engagement!.total_views)}</span>}
              </div>
            )}
            <XTimeline wallet={address} />
          </>
        )}
        {tab === 'economy' && <ShadowEconomy wallet={address} />}
        {tab === 'wall' && <CommentSection source="profile" memeId={address} onOpenProfile={onOpenProfile} />}
      </div>
    </div>
  )
}
