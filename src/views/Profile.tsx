// Your own profile is a control room, not a showcase: one place to manage your character, credits,
// memes, social life and progress. "See how others see you" opens the public page (/u/:you?as=public).
// Sections are deep-linkable: /profile?s=credits.
import { useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchMemesByWallet, type Meme } from '../api/memes'
import { fetchStudioMemesByWallet, type StudioMeme } from '../api/studio'
import { fetchCreatorEngagement, type CreatorEngagement } from '../api/twitter'
import {
  fetchCreditBalance, fetchCreditHistory, fetchCreditPacks, fetchHolderStatus, regenerateCharacter, openBuyVvc,
  type CreditHistoryItem, type HolderStatus,
} from '../api/credits'
import { ApiError } from '../api/client'
import { keepRegenerated, requestPortrait, retryAvatar, revertRegenerated, type Profile as ProfileData } from '../identity/api'
import { useIdentity } from '../identity/IdentityProvider'
import { archetypeName, displayName } from '../identity/archetypes'
import { fetchPlayer, fetchPlayerBadges, type PlayerState } from '../api/player'
import { fetchFollowStats, fetchFollowers } from '../api/follow'
import { fetchFriends } from '../api/friends'
import { CHARACTERS } from '../data/characterLore'
import { BadgeGrid } from '../components/BadgeGrid'
import { BuyCreditsModal } from '../components/BuyCreditsModal'
import { Confetti } from '../components/Confetti'
import { ShadowEconomy } from '../components/ShadowEconomy'
import { UserChip } from '../components/UserChip'
import { XTimeline } from '../components/XTimeline'
import { CommentSection } from '../components/CommentSection'
import {
  ActivityList, MemeGrid, SortToggle, SpectrumBar, alignment, shortWallet, useMemeCards, type MemeSource,
} from '../components/ProfileShowcase'
import './ProfileControl.css'

interface Props {
  onGoToOracle: () => void
  onOpenMeme?: (source: MemeSource, id: string) => void
  onOpenProfile?: (wallet: string) => void
  /** Your public page as others see it */
  onViewPublic: (wallet: string) => void
  onOpenStudio?: () => void
  onOpenFactory?: () => void
}

type Section = 'character' | 'credits' | 'memes' | 'social' | 'progress'
const SECTIONS: { id: Section; icon: string; label: string }[] = [
  { id: 'character', icon: '🎭', label: 'Character' },
  { id: 'credits',   icon: '⚡', label: 'Credits & $VVC' },
  { id: 'memes',     icon: '🖼', label: 'My memes' },
  { id: 'social',    icon: '👥', label: 'Social & 𝕏' },
  { id: 'progress',  icon: '🏆', label: 'Progress' },
]

const DEFAULT_REGEN_COST = 50

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const HISTORY_LABEL: Record<string, string> = {
  meme_generate: 'Factory meme', studio_reskin: 'Studio reskin / edit', studio_art: 'Studio art',
  studio_inaction1: 'In-action image', studio_inaction2: 'In-action images (2)', studio_inaction3: 'In-action images (3)',
  portrait: 'Profile picture', holder_weekly: '$VVC holder top-up', signup_bonus: 'Signup bonus',
  character_regen: 'Regenerated character', character_regen_refund: 'Refund: character regenerate',
}
const historyLabel = (kind: string) =>
  kind.startsWith('purchase_') ? `Bought the ${kind.slice(9)} pack` : HISTORY_LABEL[kind] ?? kind.replace(/_/g, ' ')

function Panel({ title, hint, children, aside }: { title: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="pc-panel">
      <header className="pc-panel-head">
        <div>
          <h2 className="pc-panel-title">{title}</h2>
          {hint && <p className="pc-panel-hint">{hint}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  )
}

// ── Character ───────────────────────────────────────────────────────────────────────────────

/** After a regenerate: the old character next to the new one, keep or go back */
function RegenDecision({ profile, busy, onKeep, onRevert }: {
  profile: ProfileData; busy: 'keep' | 'revert' | null; onKeep: () => void; onRevert: () => void
}) {
  const prev = profile.previous!
  const oldName = `${prev.title ? `${prev.title} ` : ''}${archetypeName(prev.archetype)}`
  const newName = displayName(profile)
  const newImg = profile.portrait.url ?? profile.avatar.url
  const painting = profile.avatar.status === 'generating' || profile.portrait.status === 'generating'
  return (
    <div className="pc-decide" role="region" aria-label="Keep the new character or go back">
      <p className="pc-decide-title">The Oracle has a new read on you. Keep it?</p>
      <div className="pc-decide-row">
        <figure className="pc-decide-side">
          <div className="pc-decide-img"><img src={prev.portraitUrl ?? prev.avatarUrl ?? prev.fallbackImageUrl} alt="" /></div>
          <figcaption><small>Before</small>{oldName}</figcaption>
        </figure>
        <span className="pc-decide-arrow" aria-hidden>→</span>
        <figure className="pc-decide-side pc-decide-side--new">
          <div className={`pc-decide-img${newImg ? '' : ' pc-decide-img--wait'}`}>
            {newImg ? <img src={newImg} alt="" /> : <img src={profile.fallbackImageUrl} alt="" />}
            {painting && <span className="pc-decide-painting">Painting…</span>}
          </div>
          <figcaption><small>Now</small>{newName}</figcaption>
        </figure>
      </div>
      <div className="pc-actions">
        <button className="pc-btn pc-btn--primary" onClick={onKeep} disabled={!!busy}>{busy === 'keep' ? '…' : `Keep ${archetypeName(profile.archetype)}`}</button>
        <button className="pc-btn" onClick={onRevert} disabled={!!busy}>{busy === 'revert' ? '…' : `Go back to ${archetypeName(prev.archetype)}`}</button>
      </div>
      <p className="pc-fine">Going back is free and restores your old art and PFP. The credits pay for the new read, so they aren't returned.</p>
    </div>
  )
}

function CharacterSection({ profile, wallet, memberSince, player, balance, regenCost, onGoToOracle, onBuyCredits, accent }: {
  profile: ProfileData | null; wallet: string; memberSince: string | null; player: PlayerState | null
  balance: number | null; regenCost: number; onGoToOracle: () => void; onBuyCredits: () => void; accent: string
}) {
  const { setMe, refresh } = useIdentity()
  const [lightbox, setLightbox] = useState(false)
  const [showTraits, setShowTraits] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [regen, setRegen] = useState<'idle' | 'working'>('idle')
  const [decideBusy, setDecideBusy] = useState<'keep' | 'revert' | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [burst, setBurst] = useState(0)

  if (!profile) {
    return (
      <Panel title="Your character" hint="Take the Oracle interview to get your archetype, character art and PFP.">
        <button className="pc-btn pc-btn--primary" onClick={onGoToOracle}>Start the interview</button>
      </Panel>
    )
  }

  const char = CHARACTERS.find(c => c.key === profile.archetype)
  const art = profile.avatar.url ?? profile.fallbackImageUrl
  const enough = balance !== null && balance >= regenCost

  const runRegen = async () => {
    setConfirm(false)
    setRegen('working')
    setMsg(null)
    try {
      await regenerateCharacter()
      await refresh()
      setBurst(b => b + 1)
    } catch (e) {
      const err = e as ApiError
      setMsg({ ok: false, text: err?.status === 402
        ? `You need ${regenCost} credits for that.`
        : err?.data?.refunded ? `${err.message} Your ${regenCost} credits were refunded.` : err?.message || 'Something went wrong.' })
    } finally { setRegen('idle') }
  }

  const decide = async (kind: 'keep' | 'revert') => {
    setDecideBusy(kind)
    try {
      setMe((kind === 'keep' ? await keepRegenerated() : await revertRegenerated()).me)
      setMsg({ ok: true, text: kind === 'keep' ? 'New character kept. Looking good.' : 'Back to your old character.' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setDecideBusy(null) }
  }

  const image = async (kind: 'retry' | 'portrait') => {
    setImageBusy(true)
    try { setMe((kind === 'retry' ? await retryAvatar() : await requestPortrait()).me) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setImageBusy(false) }
  }

  const painting = profile.avatar.status === 'generating'
  const framing = profile.portrait.status === 'generating'
  const pfp = profile.portrait.url ?? profile.fallbackImageUrl
  const traits = Object.entries(profile.attributes)
  const side = player?.rank_direction === 'chad' ? 'Chad side' : player?.rank_direction === 'virgin' ? 'Virgin side' : 'Balanced'

  return (
    <>
      {burst > 0 && <Confetti key={burst} />}

      {/* ── Your profile, as a social profile header: banner, round PFP over it, bio ── */}
      <section className="pc-x" style={{ '--pp-accent': accent } as CSSProperties}>
        <div className={`pc-x-banner${painting ? ' pc-x-banner--sketch' : ''}`}>
          <div className="pc-x-banner-bg" style={{ backgroundImage: `url("${art}")` }} aria-hidden />
          <span className="pc-x-chip">{char?.rarity ?? 'common'}{char ? ` · ${char.tier}` : ''}</span>
          <button className="pc-x-art" onClick={() => setLightbox(true)} title="View your full character">
            <img src={art} alt={`${archetypeName(profile.archetype)}, full character`} />
          </button>
          {painting && <span className="pc-x-status"><span className="pc-spin" /> Painting your character…</span>}
          {profile.avatar.status === 'failed' && (
            <button className="pc-x-status pc-x-status--fail" onClick={() => image('retry')} disabled={imageBusy}>
              {imageBusy ? '…' : 'The art failed. Try again'}
            </button>
          )}
        </div>

        <div className="pc-x-bar">
          <div className={`pc-x-avatar${framing ? ' pc-x-avatar--busy' : ''}`}>
            <img src={pfp} alt="Your profile picture" />
          </div>
          <div className="pc-x-actions">
            {profile.avatar.status === 'ready' && (
              <button className="pc-btn" onClick={() => image('portrait')} disabled={imageBusy || framing}>
                {framing ? 'Framing PFP…' : imageBusy ? '…' : profile.portrait.url ? 'Redo PFP' : 'Make PFP'}
              </button>
            )}
            {(profile.portrait.url || profile.avatar.url) && (
              <details className="pc-x-dl">
                <summary className="pc-btn">Download ▾</summary>
                <div className="pc-x-dl-menu">
                  {profile.portrait.url && <a href={profile.portrait.url} download={`${profile.archetype}_pfp`}>Profile picture</a>}
                  {profile.avatar.url && <a href={profile.avatar.url} download={`${profile.archetype}_full`}>Full character</a>}
                </div>
              </details>
            )}
          </div>
        </div>

        <div className="pc-x-id">
          <h3 className="pc-x-name">{displayName(profile)}</h3>
          <p className="pc-x-handle">@{shortWallet(wallet)} · {archetypeName(profile.archetype)}</p>
          <p className="pc-x-bio">{profile.description}</p>
          {char && <p className="pc-x-tagline">“{char.tagline}”</p>}
          <div className="pc-x-meta">
            {memberSince && <span>📅 Joined {new Date(memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
            {player && <span>⚡ {player.total_xp.toLocaleString()} XP</span>}
            {player && <span>⚖ {side}</span>}
            {traits.length > 0 && (
              <button className="pc-x-link" onClick={() => setShowTraits(t => !t)}>{showTraits ? 'Hide' : 'What went into your picture'}</button>
            )}
          </div>
          {showTraits && <div className="pc-x-traits">{traits.map(([k, v]) => <span key={k}><b>{k}</b> {v}</span>)}</div>}
        </div>
      </section>

      {msg && <div className={`pc-flash${msg.ok ? ' pc-flash--ok' : ' pc-flash--err'}`} role="status">{msg.text}</div>}

      {profile.previous && <RegenDecision profile={profile} busy={decideBusy} onKeep={() => decide('keep')} onRevert={() => decide('revert')} />}

      {/* ── Changing who you are: two ways ── */}
      <Panel title="Change your character">
        <div className="pc-change">
          {!profile.previous && (
            <div className="pc-change-opt pc-change-opt--regen">
              <div className="pc-change-top"><b>Regenerate</b><span className="pc-price">⚡ {regenCost}</span></div>
              <p>The Oracle re-reads your interview and picks again: new archetype, new art, new PFP. Keep it or go back. Refunded if it fails.</p>
              {regen === 'working' ? (
                <div className="pc-regen-working"><span className="pc-spin" /> The Oracle is re-reading your interview…</div>
              ) : enough ? (
                <button className="pc-btn pc-btn--primary" onClick={() => setConfirm(true)}>Regenerate for {regenCost} ⚡</button>
              ) : (
                <div className="pc-actions">
                  <button className="pc-btn pc-btn--primary" onClick={onBuyCredits}>Get credits</button>
                  <button className="pc-btn" onClick={openBuyVvc}>Hold $VVC</button>
                  <span className="pc-fine">You have {balance ?? '…'}</span>
                </div>
              )}
            </div>
          )}
          <div className="pc-change-opt">
            <div className="pc-change-top"><b>Retake the interview</b><span className="pc-price pc-price--free">Free</span></div>
            <p>A whole new conversation with the Oracle. Your current character stays until you finish.</p>
            <button className="pc-btn" onClick={onGoToOracle}>Start over</button>
          </div>
        </div>
      </Panel>

      {lightbox && (
        <div className="pc-lightbox" onClick={() => setLightbox(false)} role="dialog" aria-label="Your full character">
          <img src={art} alt="" />
          <span>Click anywhere to close</span>
        </div>
      )}

      {confirm && (
        <div className="pc-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setConfirm(false) }}>
          <div className="pc-modal" role="dialog" aria-modal="true" aria-label="Regenerate your character">
            <h3>Regenerate {archetypeName(profile.archetype)}?</h3>
            <p>The Oracle picks a new archetype from your interview and paints a new character and PFP. It may land on something very different.</p>
            <p>You'll see the new one and can <b>keep it</b> or <b>go back</b> to {displayName(profile)}.</p>
            <div className="pc-modal-cost">⚡ {regenCost} credits <small>· you have {balance?.toLocaleString()}</small></div>
            <div className="pc-actions">
              <button className="pc-btn pc-btn--primary" onClick={runRegen}>Regenerate</button>
              <button className="pc-btn" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Credits ─────────────────────────────────────────────────────────────────────────────────

function CreditsSection({ balance, holder, onBuyCredits }: { balance: number | null; holder: HolderStatus | null; onBuyCredits: () => void }) {
  const [history, setHistory] = useState<CreditHistoryItem[] | null>(null)
  useEffect(() => { fetchCreditHistory().then(setHistory) }, [balance])
  const progress = holder && !holder.isHolder && holder.minBalance > 0 ? Math.min(1, holder.tokenBalance / holder.minBalance) : 1

  return (
    <>
      <div className="pc-credit-grid">
        <Panel title="Credits" hint="Spent on memes, Studio AI and your character.">
          <div className="pc-big">⚡ {balance === null ? '…' : balance.toLocaleString()}</div>
          {holder && holder.freeCredits > 0 && <p className="pc-fine">{holder.freeCredits} of them are this week's free holder credits (used first).</p>}
          <div className="pc-actions"><button className="pc-btn pc-btn--primary" onClick={onBuyCredits}>Buy credits</button></div>
        </Panel>

        <Panel title={`$${holder?.symbol ?? 'VVC'} holder`} hint="Holders get free credits every week.">
          {holder ? (
            holder.isHolder ? (
              <>
                <div className="pc-big pc-big--gold">Holder ✓</div>
                <p className="pc-fine">{holder.weeklyCredits} free credits a week · you hold {holder.tokenBalance.toLocaleString()} ${holder.symbol}
                  {holder.nextRefillAt && <> · next top-up {new Date(holder.nextRefillAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</>}</p>
              </>
            ) : (
              <>
                <div className="pc-meter" aria-label="Progress to holder"><span style={{ width: `${progress * 100}%` }} /></div>
                <p className="pc-fine">{holder.tokenBalance.toLocaleString()} / {holder.minBalance.toLocaleString()} ${holder.symbol} · reach it for {holder.weeklyCredits} free credits every week</p>
              </>
            )
          ) : <p className="pc-fine">Checking your wallet…</p>}
          <div className="pc-actions"><button className="pc-btn" onClick={openBuyVvc}>{holder?.isHolder ? `Get more $${holder.symbol}` : `Buy $${holder?.symbol ?? 'VVC'}`}</button></div>
        </Panel>
      </div>

      <Panel title="Recent activity" hint="What came in and what you spent.">
        {history === null ? <p className="pc-fine">Loading…</p> : history.length === 0 ? <p className="pc-fine">Nothing yet.</p> : (
          <ul className="pc-ledger">
            {history.map((h, i) => (
              <li key={i}>
                <span>{historyLabel(h.kind)}</span>
                <time>{new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
                <b className={h.amount >= 0 ? 'pc-in' : 'pc-out'}>{h.amount >= 0 ? '+' : '−'}{Math.abs(h.amount)}</b>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

// ── Social ──────────────────────────────────────────────────────────────────────────────────

function PeopleList({ title, wallets, empty }: { title: string; wallets: string[] | null; empty: string }) {
  return (
    <div className="pc-people">
      <h3>{title}{wallets && <small>{wallets.length}</small>}</h3>
      {wallets === null ? <p className="pc-fine">Loading…</p> : wallets.length === 0 ? <p className="pc-fine">{empty}</p> : (
        <div className="pc-people-list">{wallets.slice(0, 40).map(w => <UserChip key={w} wallet={w} size="md" />)}</div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────────────────

export function Profile({ onGoToOracle, onOpenMeme, onOpenProfile, onViewPublic, onOpenStudio, onOpenFactory }: Props) {
  // Member-only view (the route sends everyone else away): the wallet is always set here
  const { memberWallet, profile, me } = useIdentity()
  const memberSince = me && me.state !== 'guest' ? me.account.memberSince : null
  const address = memberWallet ?? ''
  const [params, setParams] = useSearchParams()
  const section = (SECTIONS.find(s => s.id === params.get('s'))?.id ?? 'character') as Section
  const go = (s: Section) => setParams(s === 'character' ? {} : { s }, { replace: true })

  const [memes, setMemes] = useState<Meme[]>([])
  const [studioMemes, setStudioMemes] = useState<StudioMeme[]>([])
  const [memesLoading, setMemesLoading] = useState(true)
  const [engagement, setEngagement] = useState<CreatorEngagement | null>(null)
  const [player, setPlayer] = useState<PlayerState | null>(null)
  const [badgeCount, setBadgeCount] = useState<number | null>(null)
  const [followers, setFollowers] = useState<number | null>(null)
  const [following, setFollowing] = useState<number | null>(null)
  const [friends, setFriends] = useState<string[] | null>(null)
  const [followerList, setFollowerList] = useState<string[] | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [holder, setHolder] = useState<HolderStatus | null>(null)
  const [regenCost, setRegenCost] = useState(DEFAULT_REGEN_COST)
  const [buyOpen, setBuyOpen] = useState(false)
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
    fetchFollowers(address).then(setFollowerList).catch(() => setFollowerList([]))
    fetchCreatorEngagement(address).then(setEngagement).catch(() => {})
    fetchHolderStatus().then(setHolder).catch(() => {})
    fetchCreditPacks().then(p => { if (p.costs.character_regen) setRegenCost(p.costs.character_regen) }).catch(() => {})
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

  const copy = (what: 'wallet' | 'link') => {
    const text = what === 'wallet' ? address : `${window.location.origin}/#/u/${address}`
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1400) }).catch(() => {})
  }

  const { cards, topKey, votes } = useMemeCards(memes, studioMemes, sort)
  const { accent } = alignment(player)
  const pfp = profile ? profile.portrait.url ?? profile.fallbackImageUrl : null
  const hasEngagement = !!engagement && (engagement.total_likes > 0 || engagement.total_rts > 0 || engagement.total_replies > 0 || engagement.total_views > 0)
  const navHint: Record<Section, string | null> = useMemo(() => ({
    character: profile?.previous ? 'Decide' : null,
    credits: balance === null ? null : `⚡ ${balance.toLocaleString()}`,
    memes: memesLoading ? null : String(cards.length),
    social: followers === null ? null : `${followers}`,
    progress: player ? `${compact(player.total_xp)} XP` : null,
  }), [profile?.previous, balance, memesLoading, cards.length, followers, player])

  return (
    <div className="pc-page" style={{ '--pp-accent': accent } as CSSProperties}>
      {buyOpen && (
        <BuyCreditsModal wallet={address} currentBalance={balance ?? 0} onClose={() => setBuyOpen(false)}
          onPurchased={b => { setBalance(b); window.dispatchEvent(new CustomEvent('vvc:credits-changed')) }} />
      )}

      {/* ── You, at a glance ── */}
      <header className="pc-head">
        {pfp ? <img className="pc-head-pfp" src={pfp} alt="" /> : <div className="pc-head-pfp" />}
        <div className="pc-head-id">
          <span className="pc-head-kicker">Your control room</span>
          <h1 className="pc-head-name">{profile ? displayName(profile) : 'New member'}</h1>
          <div className="pc-head-meta">
            <button onClick={() => copy('wallet')} title={address}>{copied === 'wallet' ? 'Copied ✓' : shortWallet(address)}</button>
            <span>·</span>
            <span>⚡ {balance === null ? '…' : balance.toLocaleString()} credits</span>
            {player && <><span>·</span><span>{compact(player.total_xp)} XP</span></>}
            {followers !== null && <><span>·</span><span>{followers} followers</span></>}
          </div>
        </div>
        <div className="pc-head-actions">
          <button className="pc-btn pc-btn--primary" onClick={() => onViewPublic(address)}>👁 See how others see you</button>
          <button className="pc-btn" onClick={() => copy('link')}>{copied === 'link' ? 'Link copied ✓' : '🔗 Share profile'}</button>
        </div>
      </header>

      <div className="pc-body">
        <nav className="pc-nav" aria-label="Profile sections">
          {SECTIONS.map(s => (
            <button key={s.id} className={`pc-nav-item${section === s.id ? ' pc-nav-item--on' : ''}`} onClick={() => go(s.id)}
              aria-current={section === s.id ? 'page' : undefined}>
              <span className="pc-nav-icon" aria-hidden>{s.icon}</span>
              <span className="pc-nav-label">{s.label}</span>
              {navHint[s.id] && <span className={`pc-nav-hint${s.id === 'character' && profile?.previous ? ' pc-nav-hint--alert' : ''}`}>{navHint[s.id]}</span>}
            </button>
          ))}
        </nav>

        <main className="pc-main" key={section}>
          {section === 'character' && (
            <CharacterSection profile={profile} wallet={address} memberSince={memberSince} player={player}
              balance={balance} regenCost={regenCost} accent={accent}
              onGoToOracle={onGoToOracle} onBuyCredits={() => setBuyOpen(true)} />
          )}

          {section === 'credits' && <CreditsSection balance={balance} holder={holder} onBuyCredits={() => setBuyOpen(true)} />}

          {section === 'memes' && (
            <>
              <Panel title="My memes" hint={memesLoading ? undefined : `${cards.length} made · ${votes} votes received`}
                aside={<div className="pc-actions">
                  {cards.length > 1 && <SortToggle sort={sort} onSort={setSort} />}
                  {onOpenStudio && <button className="pc-btn" onClick={onOpenStudio}>＋ Studio</button>}
                  {onOpenFactory && <button className="pc-btn pc-btn--primary" onClick={onOpenFactory}>＋ Factory meme</button>}
                </div>}>
                <MemeGrid cards={cards} topKey={topKey} loading={memesLoading} onOpenMeme={onOpenMeme}
                  empty="No memes yet. Make your first one in the Studio or the Factory." />
              </Panel>
              <Panel title="What your memes earned" hint="XP and rewards from votes and reach.">
                <ShadowEconomy wallet={address} />
              </Panel>
            </>
          )}

          {section === 'social' && (
            <>
              <Panel title="Your people" hint={`${followers ?? '…'} followers · following ${following ?? '…'} · ${friends?.length ?? '…'} friends`}>
                <div className="pc-people-grid">
                  <PeopleList title="Followers" wallets={followerList} empty="No followers yet. Post memes and they'll come." />
                  <PeopleList title="Friends" wallets={friends} empty="No friends yet. Add people from their profiles." />
                </div>
              </Panel>
              <Panel title="𝕏" hint="Your memes shared on X and how far they went.">
                {hasEngagement && (
                  <div className="pc-reach">
                    {engagement!.total_shares > 0 && <span>🔗 {compact(engagement!.total_shares)} shares</span>}
                    {engagement!.total_likes > 0 && <span>❤ {compact(engagement!.total_likes)}</span>}
                    {engagement!.total_rts > 0 && <span>🔁 {compact(engagement!.total_rts)}</span>}
                    {engagement!.total_replies > 0 && <span>💬 {compact(engagement!.total_replies)}</span>}
                    {engagement!.total_views > 0 && <span>👁 {compact(engagement!.total_views)}</span>}
                  </div>
                )}
                <XTimeline wallet={address} />
              </Panel>
              <Panel title="Your wall" hint="What people wrote on your profile.">
                <CommentSection source="profile" memeId={address} onOpenProfile={onOpenProfile} />
              </Panel>
            </>
          )}

          {section === 'progress' && (
            <>
              <Panel title="Where you stand" hint="Your XP pulls you toward Chad or Virgin.">
                {player ? (
                  <>
                    <SpectrumBar player={player} />
                    <div className="pc-streaks">
                      <span>🔥 {player.login_streak}-day login streak</span>
                      <span>🎨 {player.creation_streak}-day creation streak</span>
                      <span>🗳 {player.voting_streak}-day voting streak</span>
                    </div>
                  </>
                ) : <p className="pc-fine">Loading…</p>}
              </Panel>
              <Panel title="Badges" hint={badgeCount === null ? undefined : `${badgeCount} unlocked`}>
                <BadgeGrid wallet={address} />
              </Panel>
              <Panel title="Activity" hint="Everything that earned you XP.">
                <ActivityList wallet={address} onOpenMeme={onOpenMeme} />
              </Panel>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
