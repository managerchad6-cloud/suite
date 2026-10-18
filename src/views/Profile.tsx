// Your own profile is a control room, not a showcase: one place to manage your character, credits,
// memes, social life and progress. "See how others see you" opens the public page (/u/:you?as=public).
// Sections are deep-linkable: /profile?s=credits.
import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchMemesByWallet, type Meme } from '../api/memes'
import { fetchStudioMemesByWallet, type StudioMeme } from '../api/studio'
import { fetchCreatorEngagement, type CreatorEngagement } from '../api/twitter'
import {
  fetchCreditBalance, fetchCreditHistory, fetchCreditPacks, fetchHolderStatus, generateBanner, refundBanner, regenerateCharacter, openBuyVvc,
  fetchTokenConfig, type CreditHistoryItem, type HolderStatus, type TokenConfig,
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
import { HolderLadder } from '../components/HolderLadder'
import { ProfileXCard } from '../components/ProfileXCard'
import { ShadowEconomy } from '../components/ShadowEconomy'
import { UserChip } from '../components/UserChip'
import { XTimeline } from '../components/XTimeline'
import { CommentSection } from '../components/CommentSection'
import {
  ActivityList, MemeGrid, SortToggle, SpectrumBar, alignment, shortWallet, useMemeCards, type MemeSource,
} from '../components/ProfileShowcase'
import { profileLink } from '../lib/links'
import { useUrlState } from '../lib/urlState'
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
const DEFAULT_BANNER_COST = 25

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

interface CardStats { followers: number | null; following: number | null; memes: number | null }

function CharacterSection({ profile, wallet, memberSince, player, balance, regenCost, bannerCost, stats, onGo, onViewPublic, onGoToOracle, onBuyCredits, accent }: {
  profile: ProfileData | null; wallet: string; memberSince: string | null; player: PlayerState | null
  balance: number | null; regenCost: number; bannerCost: number; stats: CardStats
  onGo: (s: Section) => void; onViewPublic: () => void
  onGoToOracle: () => void; onBuyCredits: () => void; accent: string
}) {
  const { setMe, refresh } = useIdentity()
  const [showTraits, setShowTraits] = useState(false)
  const [confirm, setConfirm] = useState<null | 'regen' | 'banner'>(null)
  const [regen, setRegen] = useState<'idle' | 'working'>('idle')
  const [bannerBusy, setBannerBusy] = useState<null | 'start' | 'refund'>(null)
  const [refunded, setRefunded] = useState<string | null>(null)       // job id refunded this visit
  const [decideBusy, setDecideBusy] = useState<'keep' | 'revert' | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState<'wallet' | 'link' | null>(null)
  const [burst, setBurst] = useState(0)
  const prevBanner = useRef(profile?.banner?.status)

  // Celebrate a banner the moment it lands
  useEffect(() => {
    const now = profile?.banner?.status
    if (prevBanner.current === 'generating' && now === 'ready') { setBurst(b => b + 1); setMsg({ ok: true, text: 'Your new banner is up.' }) }
    prevBanner.current = now
  }, [profile?.banner?.status])

  if (!profile) {
    return (
      <Panel title="Your character" hint="Take the Oracle interview to get your archetype, character art and PFP.">
        <button className="pc-btn pc-btn--primary" onClick={onGoToOracle}>Start the interview</button>
      </Panel>
    )
  }

  const char = CHARACTERS.find(c => c.key === profile.archetype)
  const art = profile.avatar.url ?? profile.fallbackImageUrl
  const enough = (cost: number) => balance !== null && balance >= cost
  const banner = profile.banner ?? { status: 'none' as const, url: null }

  const copy = (what: 'wallet' | 'link') => {
    const text = what === 'wallet' ? wallet : profileLink(wallet)
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1400) }).catch(() => {})
  }

  const paidError = (e: unknown, cost: number) => {
    const err = e as ApiError
    return err?.status === 402 ? `You need ${cost} credits for that.`
      : err?.data?.refunded ? `${err.message} Your ${cost} credits were refunded.` : err?.message || 'Something went wrong.'
  }

  const runRegen = async () => {
    setConfirm(null)
    setRegen('working')
    setMsg(null)
    try {
      await regenerateCharacter()
      await refresh()
      setBurst(b => b + 1)
    } catch (e) { setMsg({ ok: false, text: paidError(e, regenCost) }) } finally { setRegen('idle') }
  }

  const runBanner = async () => {
    setConfirm(null)
    setBannerBusy('start')
    setMsg(null)
    try {
      await generateBanner()
      await refresh()
      setMsg({ ok: true, text: 'Painting your banner. It takes a minute or two; you can leave this page.' })
    } catch (e) { setMsg({ ok: false, text: paidError(e, bannerCost) }) } finally { setBannerBusy(null) }
  }

  const claimBannerRefund = async (jobId: string) => {
    setBannerBusy('refund')
    try {
      const r = await refundBanner(jobId)
      setRefunded(jobId)
      setMsg({ ok: true, text: `${r.refunded} credits are back on your balance.` })
    } catch (e) {
      const err = e as ApiError
      if (err?.code === 'already_refunded') { setRefunded(jobId); setMsg({ ok: true, text: 'That one was already refunded.' }) }
      else setMsg({ ok: false, text: err?.message || 'Could not refund right now.' })
    } finally { setBannerBusy(null) }
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
  const sidePct = Math.round(alignment(profile.archetype).spectrum * 100)
  const side = sidePct >= 45 && sidePct <= 55 ? 'Right in the middle' : sidePct > 50 ? `${sidePct}% Chad` : `${100 - sidePct}% Virgin`
  const bannerFailedJob = banner.status === 'failed' && banner.jobId && refunded !== banner.jobId ? banner.jobId : null

  return (
    <>
      {burst > 0 && <Confetti key={burst} />}

      {/* ── You: the shared profile header card, with your own buttons ── */}
      <ProfileXCard
        accent={accent}
        art={art}
        pfp={pfp}
        name={displayName(profile)}
        bannerUrl={banner.url}
        bannerPainting={banner.status === 'generating'}
        bannerTools={banner.status === 'generating' ? (
          <span className="pc-x-status"><span className="pc-spin" /> Painting your banner…</span>
        ) : bannerFailedJob ? (
          <>
            <span className="pc-x-status pc-x-status--fail">The banner didn't work</span>
            <button className="pc-x-banner-btn" onClick={() => claimBannerRefund(bannerFailedJob)} disabled={!!bannerBusy}>
              {bannerBusy === 'refund' ? '…' : `Get your ⚡ ${bannerCost} back`}
            </button>
          </>
        ) : (
          <button className="pc-x-banner-btn" onClick={() => (enough(bannerCost) ? setConfirm('banner') : onBuyCredits())}
            disabled={!!bannerBusy || profile.avatar.status !== 'ready'}
            title={profile.avatar.status !== 'ready' ? 'Your character art needs to be ready first' : undefined}>
            {bannerBusy === 'start' ? '…' : `✨ ${banner.url ? 'New banner' : 'Generate your banner'} · ⚡ ${bannerCost}`}
          </button>
        )}
        pfpBusy={framing}
        actions={<>
          <button className="pc-btn pc-btn--primary" onClick={onViewPublic}>👁 See how others see you</button>
          <button className="pc-btn" onClick={() => copy('link')} title="Copy your profile link">{copied === 'link' ? 'Copied ✓' : '🔗 Share'}</button>
          {profile.avatar.status === 'ready' && (
            <button className="pc-btn" onClick={() => image('portrait')} disabled={imageBusy || framing}>
              {framing ? 'Framing PFP…' : imageBusy ? '…' : profile.portrait.url ? 'Redo PFP' : 'Make PFP'}
            </button>
          )}
          {(profile.portrait.url || profile.avatar.url || banner.url) && (
            <details className="pc-x-dl">
              <summary className="pc-btn">Download ▾</summary>
              <div className="pc-x-dl-menu">
                {profile.portrait.url && <a href={profile.portrait.url} download={`${profile.archetype}_pfp`}>Profile picture</a>}
                {profile.avatar.url && <a href={profile.avatar.url} download={`${profile.archetype}_full`}>Full character</a>}
                {banner.url && <a href={banner.url} download={`${profile.archetype}_banner`}>Banner</a>}
              </div>
            </details>
          )}
        </>}
        handle={<>
          <button onClick={() => copy('wallet')} title={wallet}>{copied === 'wallet' ? 'Copied ✓' : `@${shortWallet(wallet)}`}</button>
          <span>{archetypeName(profile.archetype)}</span>
          {char && <span className="pc-x-rarity">{char.rarity} · {char.tier}</span>}
        </>}
        stats={<>
          <button onClick={() => onGo('credits')}><b>⚡ {balance === null ? '…' : balance.toLocaleString()}</b> credits</button>
          <button onClick={() => onGo('progress')}><b>{player ? compact(player.total_xp) : '…'}</b> XP</button>
          <button onClick={() => onGo('social')}><b>{stats.followers ?? '…'}</b> followers</button>
          <button onClick={() => onGo('social')}><b>{stats.following ?? '…'}</b> following</button>
          <button onClick={() => onGo('memes')}><b>{stats.memes ?? '…'}</b> memes</button>
        </>}
        bio={profile.description}
        tagline={char?.tagline}
        meta={<>
          {memberSince && <span>📅 Joined {new Date(memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
          <span>⚖ {side}</span>
          {traits.length > 0 && (
            <button className="pc-x-link" onClick={() => setShowTraits(t => !t)}>{showTraits ? 'Hide' : 'What went into your picture'}</button>
          )}
        </>}
        artPainting={painting}
        artOverlay={<>
          {painting && <span className="pc-x-status"><span className="pc-spin" /> Painting your character…</span>}
          {profile.avatar.status === 'failed' && (
            <span className="pc-x-status pc-x-status--fail" role="button" tabIndex={0}
              onClick={e => { e.stopPropagation(); image('retry') }}>{imageBusy ? '…' : 'The art failed. Try again'}</span>
          )}
        </>}
      >
        {showTraits && <div className="pc-x-traits">{traits.map(([k, v]) => <span key={k}><b>{k}</b> {v}</span>)}</div>}
      </ProfileXCard>

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
              ) : enough(regenCost) ? (
                <button className="pc-btn pc-btn--primary" onClick={() => setConfirm('regen')}>Regenerate for {regenCost} ⚡</button>
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

      {confirm === 'banner' && (
        <div className="pc-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setConfirm(null) }}>
          <div className="pc-modal" role="dialog" aria-modal="true" aria-label="Generate your banner">
            <h3>{banner.url ? 'A new banner?' : 'Generate your banner?'}</h3>
            <p>The Oracle paints a wide banner from your character and everything it knows about you: your world, your props, your vices. It shows on your profile and your public page.</p>
            <p>It takes a minute or two and runs in the background. If it fails, you get your credits back.</p>
            <div className="pc-modal-cost">⚡ {bannerCost} credits <small>· you have {balance?.toLocaleString()}</small></div>
            <div className="pc-actions">
              <button className="pc-btn pc-btn--primary" onClick={runBanner}>Generate</button>
              <button className="pc-btn" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirm === 'regen' && (
        <div className="pc-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setConfirm(null) }}>
          <div className="pc-modal" role="dialog" aria-modal="true" aria-label="Regenerate your character">
            <h3>Regenerate {archetypeName(profile.archetype)}?</h3>
            <p>The Oracle picks a new archetype from your interview and paints a new character and PFP. It may land on something very different.</p>
            <p>You'll see the new one and can <b>keep it</b> or <b>go back</b> to {displayName(profile)}.</p>
            <div className="pc-modal-cost">⚡ {regenCost} credits <small>· you have {balance?.toLocaleString()}</small></div>
            <div className="pc-actions">
              <button className="pc-btn pc-btn--primary" onClick={runRegen}>Regenerate</button>
              <button className="pc-btn" onClick={() => setConfirm(null)}>Cancel</button>
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
  const [token, setToken] = useState<TokenConfig | null>(null)
  useEffect(() => { fetchTokenConfig().then(setToken).catch(() => {}) }, [])
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
                <div className="pc-big pc-big--gold">{holder.tier?.name ?? 'Holder'} ✓</div>
                <p className="pc-fine">⚡ {holder.weeklyCredits} free credits a week · you hold {holder.tokenBalance.toLocaleString()} ${holder.symbol}
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

      {token?.tiers?.length ? (
        <Panel title="Holder tiers" hint="A bigger bag earns more each week, and holding longer adds a bonus.">
          <HolderLadder config={token} holder={holder} />
        </Panel>
      ) : null}

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
  const [bannerCost, setBannerCost] = useState(DEFAULT_BANNER_COST)
  const [buyOpen, setBuyOpen] = useState(false)
  const [sort, setSort] = useUrlState<'top' | 'new'>('sort', 'top', ['top', 'new'])

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
    fetchCreditPacks().then(p => {
      if (p.costs.character_regen) setRegenCost(p.costs.character_regen)
      if (p.costs.banner) setBannerCost(p.costs.banner)
    }).catch(() => {})
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

  const { cards, topKey, votes } = useMemeCards(memes, studioMemes, sort)
  const { accent } = alignment(profile?.archetype)
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

      <div className="pc-body">
        <nav className="pc-nav" aria-label="Profile sections">
          {/* Outside the Character card, a small reminder of whose control room this is */}
          {section !== 'character' && profile && (
            <button className="pc-nav-me" onClick={() => go('character')} title="Back to your character">
              <img src={pfp ?? ''} alt="" />
              <span>{displayName(profile)}</span>
            </button>
          )}
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
              balance={balance} regenCost={regenCost} bannerCost={bannerCost} accent={accent}
              stats={{ followers, following, memes: memesLoading ? null : cards.length }}
              onGo={go} onViewPublic={() => onViewPublic(address)}
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
              <Panel title="Where you stand" hint="Where your archetype sits between Virgin and Chad, and your XP rank.">
                {player ? (
                  <>
                    {profile && <SpectrumBar archetype={profile.archetype} player={player} />}
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
