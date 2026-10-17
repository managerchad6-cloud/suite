// Someone else's profile: their character as a collectible card, where they sit on the Virgin–Chad
// spectrum, their memes (each opens the meme page), badges, activity and wall.
import { useState, useEffect, useMemo, useRef, type CSSProperties, type PointerEvent } from 'react'
import { fetchMemesByWallet, imageUrl, parseMemeId, type Meme } from '../api/memes'
import { fetchStudioMemesByWallet, studioMemeImageUrl, type StudioMeme } from '../api/studio'
import { fetchFollowStats, toggleFollow, checkIsFollowing } from '../api/follow'
import { fetchFriendStatus, sendFriendRequest, respondToFriendRequest, type FriendStatus } from '../api/friends'
import { fetchPlayer, fetchPlayerBadges, fetchPlayerTimeline, type ActivityEvent, type PlayerState } from '../api/player'
import { CHARACTERS } from '../data/characterLore'
import { bestImage, getPublicProfile, type PublicProfile as Profile } from '../identity/api'
import { archetypeName, displayName } from '../identity/archetypes'
import { useMemberGate } from '../identity/gate'
import { BadgeGrid } from '../components/BadgeGrid'
import { CommentSection } from '../components/CommentSection'
import './PublicProfile.css'

interface Props {
  wallet: string
  onBack: () => void
  /** Open a meme's page: source 'factory' (AI) or 'studio' (hand-made) */
  onOpenMeme?: (source: 'factory' | 'studio', id: string) => void
  onOpenProfile?: (wallet: string) => void
  onOpenMessages?: (wallet: string) => void
}

type Tab = 'memes' | 'badges' | 'activity' | 'wall'

interface Card { key: string; source: 'factory' | 'studio'; id: string; img: string; virgin: string; chad: string; label: string; votes: number; at: string }

const ALIGN_ACCENT = { chad: '#F0A020', virgin: '#8fb3c9', neutral: '#c9c2b3' } as const

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`
const since = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
const RANK_NAME: Record<string, string> = { virgin_rank: 'Virgin', basic: 'Basic' }
const rankName = (r: string) => RANK_NAME[r] ?? archetypeName(r)

/** Numbers that count up when they arrive */
function useCountUp(target: number | null, ms = 700) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target === null) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return target === null ? null : n
}

function Stat({ value, label, onClick }: { value: number | null; label: string; onClick?: () => void }) {
  const n = useCountUp(value)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`pp-stat${onClick ? ' pp-stat--link' : ''}`} onClick={onClick}>
      <span className="pp-stat-num">{n === null ? '…' : n.toLocaleString()}</span>
      <span className="pp-stat-label">{label}</span>
    </Tag>
  )
}

/** The character as a collectible card that tilts toward the pointer, with a moving shine */
function CharacterCard({ image, name, tier, rarity, accent }: { image: string | null; name: string; tier?: string; rarity: string; accent: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 18}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }
  const leave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg')
  }
  return (
    <div className="pp-card-stage">
      <div ref={ref} className={`pp-card pp-card--${rarity}`} style={{ '--pp-accent': accent } as CSSProperties}
        onPointerMove={move} onPointerLeave={leave}>
        <div className="pp-card-inner">
          <div className="pp-card-top">
            <span className="pp-card-rarity">{rarity}</span>
            {tier && <span className="pp-card-tier">{tier}</span>}
          </div>
          <div className="pp-card-art">
            {image ? <img src={image} alt={name} draggable={false} /> : <div className="pp-card-art-empty" />}
          </div>
          <div className="pp-card-name">{name}</div>
        </div>
        <div className="pp-card-shine" aria-hidden />
      </div>
    </div>
  )
}

export function PublicProfile({ wallet, onBack, onOpenMeme, onOpenProfile, onOpenMessages }: Props) {
  const gate = useMemberGate()
  const address = gate.wallet
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [player, setPlayer] = useState<PlayerState | null>(null)
  const [memes, setMemes] = useState<Meme[]>([])
  const [studioMemes, setStudioMemes] = useState<StudioMeme[]>([])
  const [memesLoading, setMemesLoading] = useState(true)
  const [badgeCount, setBadgeCount] = useState<number | null>(null)
  const [timeline, setTimeline] = useState<ActivityEvent[] | null>(null)
  const [followers, setFollowers] = useState<number | null>(null)
  const [following, setFollowing] = useState<number | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followPending, setFollowPending] = useState(false)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [friendRequestId, setFriendRequestId] = useState<number | undefined>(undefined)
  const [friendPending, setFriendPending] = useState(false)
  const [tab, setTab] = useState<Tab>('memes')
  const [sort, setSort] = useState<'top' | 'new'>('top')
  const [bioOpen, setBioOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setProfile(undefined); setTab('memes'); setTimeline(null)
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
    if (tab === 'activity' && timeline === null) fetchPlayerTimeline(wallet, 40).then(setTimeline).catch(() => setTimeline([]))
  }, [tab, timeline, wallet])

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

  const cards = useMemo<Card[]>(() => {
    const all: Card[] = [
      ...memes.map(m => {
        const { virgin, chad } = parseMemeId(m.meme_id)
        return { key: `f:${m.job_id}`, source: 'factory' as const, id: m.job_id, img: imageUrl(m.job_id), virgin, chad, label: `${virgin} vs ${chad}`, votes: m.vote_count ?? 0, at: m.completed_at ?? m.created_at }
      }),
      ...studioMemes.map(m => {
        const label = (m.titles?.filter(Boolean).length ? m.titles : (m.characters ?? []).map(c => c.replace(/_/g, ' '))).join(' vs ')
        return { key: `s:${m.id}`, source: 'studio' as const, id: m.id, img: studioMemeImageUrl(m.id), virgin: '', chad: '', label, votes: 0, at: m.created_at }
      }),
    ]
    return sort === 'top'
      ? all.sort((a, b) => b.votes - a.votes || +new Date(b.at) - +new Date(a.at))
      : all.sort((a, b) => +new Date(b.at) - +new Date(a.at))
  }, [memes, studioMemes, sort])
  const topKey = useMemo(() => {
    const best = [...cards].sort((a, b) => b.votes - a.votes)[0]
    return best && best.votes > 0 ? best.key : null
  }, [cards])
  const votesReceived = memesLoading ? null : memes.reduce((s, m) => s + (m.vote_count ?? 0), 0)

  const charData = profile ? CHARACTERS.find(c => c.key === profile.archetype) ?? null : null
  const direction = (player?.rank_direction ?? 'neutral') as keyof typeof ALIGN_ACCENT
  const accent = ALIGN_ACCENT[direction]
  const spectrum = Math.min(1, Math.max(0, player?.spectrum_position ?? 0.5))
  const name = profile ? displayName(profile) : ''
  const art = profile ? profile.avatarUrl ?? profile.fallbackImageUrl : null      // the full character
  const pfp = profile ? bestImage(profile) : null                                   // the square portrait

  return (
    <div className="pp-page" style={{ '--pp-accent': accent } as CSSProperties}>
      <div className="pp-topbar">
        <button className="char-detail-back" onClick={onBack}>← Back</button>
        <button className="pp-wallet" onClick={copyWallet} title={`${wallet} (click to copy)`}>
          {copied ? 'Copied ✓' : short(wallet)}
        </button>
      </div>

      {/* ── Hero ── */}
      <section className="pp-hero">
        {art && <div className="pp-hero-bg" style={{ backgroundImage: `url("${art}")` }} aria-hidden />}

        {profile === undefined ? <div className="pp-card-stage"><div className="pp-card pp-card--skeleton" /></div>
          : profile ? <CharacterCard image={art} name={archetypeName(profile.archetype)} tier={charData?.tier} rarity={charData?.rarity ?? 'common'} accent={accent} />
          : <div className="pp-card-stage"><div className="pp-card pp-card--none"><span>{wallet.slice(0, 2).toUpperCase()}</span></div></div>}

        <div className="pp-info">
          <div className="pp-id-row">
            {pfp ? <img className="pp-pfp" src={pfp} alt="" /> : <div className="pp-pfp pp-pfp--empty" />}
            <div className="pp-id-meta">
              <span className="pp-kicker">{profile ? `${archetypeName(profile.archetype)}${charData ? ` · ${charData.tier}` : ''}` : 'Member'}</span>
              {profile?.memberSince && <span className="pp-since">Member since {since(profile.memberSince)}</span>}
            </div>
          </div>

          {profile === undefined ? <div className="pp-name-skeleton" />
            : profile ? <h1 className="pp-name">{name}</h1>
            : <h1 className="pp-name pp-name--none">No archetype yet</h1>}
          {charData && <p className="pp-tagline">“{charData.tagline}”</p>}

          {profile?.description && (
            <blockquote className={`pp-oracle${bioOpen ? ' pp-oracle--open' : ''}`} onClick={() => setBioOpen(o => !o)}
              title={bioOpen ? 'Show less' : 'Read all'}>
              <span className="pp-oracle-label">The Oracle says</span>
              <span className="pp-oracle-text">{profile.description}</span>
            </blockquote>
          )}

          {player && (
            <div className="pp-spectrum" title={`${Math.round(spectrum * 100)}% Chad`}>
              <div className="pp-spectrum-head">
                <span className="pp-rank" style={{ color: accent }}>
                  {rankName(player.current_rank)}
                  <small>{direction === 'neutral' ? 'Perfectly balanced' : `${direction === 'chad' ? 'Chad' : 'Virgin'} side`}</small>
                </span>
                <span className="pp-xp">⚡ {player.total_xp.toLocaleString()} XP{player.login_streak > 1 && <em> · 🔥 {player.login_streak}-day streak</em>}</span>
              </div>
              <div className="pp-spectrum-bar">
                <span className="pp-spectrum-end">Virgin</span>
                <div className="pp-spectrum-track"><span className="pp-spectrum-marker" style={{ left: `${spectrum * 100}%` }} /></div>
                <span className="pp-spectrum-end">Chad</span>
              </div>
            </div>
          )}

          <div className="pp-stats">
            <Stat value={followers} label="Followers" />
            <Stat value={following} label="Following" />
            <Stat value={memesLoading ? null : cards.length} label="Memes" onClick={() => setTab('memes')} />
            <Stat value={votesReceived} label="Votes" onClick={() => { setSort('top'); setTab('memes') }} />
            <Stat value={badgeCount} label="Badges" onClick={() => setTab('badges')} />
          </div>

          <div className="pp-actions">
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
          </div>
        </div>
      </section>

      {/* ── Tabs ── */}
      <nav className="pp-tabs" role="tablist">
        {([['memes', 'Memes', cards.length], ['badges', 'Badges', badgeCount], ['activity', 'Activity', null], ['wall', 'Wall', null]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`pp-tab${tab === id ? ' pp-tab--on' : ''}`} onClick={() => setTab(id)}>
            {label}{n !== null && n > 0 && <span className="pp-tab-count">{n}</span>}
          </button>
        ))}
        {tab === 'memes' && cards.length > 1 && (
          <div className="pp-sort">
            <button className={sort === 'top' ? 'pp-sort--on' : ''} onClick={() => setSort('top')}>Top</button>
            <button className={sort === 'new' ? 'pp-sort--on' : ''} onClick={() => setSort('new')}>New</button>
          </div>
        )}
      </nav>

      <div className="pp-panel">
        {tab === 'memes' && (
          memesLoading ? (
            <div className="pp-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="pp-meme pp-meme--skeleton" />)}</div>
          ) : cards.length === 0 ? (
            <p className="pp-empty">No memes yet. Stay tuned.</p>
          ) : (
            <div className="pp-grid">
              {cards.map((c, i) => (
                <button key={c.key} className="pp-meme" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  onClick={() => onOpenMeme?.(c.source, c.id)} title="Open meme">
                  <div className="pp-meme-img"><img src={c.img} alt={c.label} loading="lazy" /></div>
                  {c.key === topKey && <span className="pp-meme-crown">👑 Top meme</span>}
                  <div className="pp-meme-foot">
                    <span className="pp-meme-label">
                      {c.virgin || c.chad
                        ? <><span className="pp-v">{c.virgin}</span> <i>vs</i> <span className="pp-c">{c.chad}</span></>
                        : <span className="pp-meme-studio">{c.label || 'Studio meme'}</span>}
                    </span>
                    {c.votes > 0 && <span className="pp-meme-votes">▲ {c.votes}</span>}
                  </div>
                  <span className="pp-meme-open" aria-hidden>View ↗</span>
                </button>
              ))}
            </div>
          )
        )}

        {tab === 'badges' && <BadgeGrid wallet={wallet} />}

        {tab === 'activity' && (
          timeline === null ? <p className="pp-empty">Loading…</p>
            : timeline.length === 0 ? <p className="pp-empty">No activity yet.</p>
            : (
              <ul className="pp-activity">
                {timeline.map(ev => (
                  <li key={ev.id} className={`pp-ev pp-ev--${ev.xp_alignment}`}>
                    <span className="pp-ev-dot" />
                    <span className="pp-ev-text">
                      {ev.event_type.replace(/_/g, ' ')}
                      {ev.meme_id && ev.meme_source && (ev.meme_source === 'factory' || ev.meme_source === 'studio') && (
                        <button className="pp-ev-link" onClick={() => onOpenMeme?.(ev.meme_source as 'factory' | 'studio', ev.meme_id!)}>view meme</button>
                      )}
                    </span>
                    {ev.xp_awarded > 0 && <span className="pp-ev-xp">+{ev.xp_awarded} XP</span>}
                    <span className="pp-ev-time">{ago(ev.created_at)}</span>
                  </li>
                ))}
              </ul>
            )
        )}

        {tab === 'wall' && <CommentSection source="profile" memeId={wallet} onOpenProfile={onOpenProfile} />}
      </div>
    </div>
  )
}
