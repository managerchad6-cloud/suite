// The one page for a single meme, however it was made (Factory, Studio or the meme bank): laid out
// like a post. Who made it with a Follow, the matchup as the headline, the meme whole, then the
// things to do with it: Based or Cringe (double-tap the meme), where the vote takes it next tier,
// replies, share to X, remix. Up next keeps the loop going (→ / J, or the nudge after you vote).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchGalleryMemes, fetchStudioMemesByWallet, studioMemeImageUrl } from '../api/studio'
import { fetchMemes, fetchMemesByWallet, imageUrl as factoryImageUrl } from '../api/memes'
import { EMPTY, NEXT, SCOUT, TIERS, itemTitle as teaserTitle, pretty, splitSide, useMeme } from '../lib/memeInfo'
import { castVote, getVoteState, trackFeedAction, type VoteState } from '../api/votes'
import { checkIsFollowing, toggleFollow } from '../api/follow'
import { fetchComments } from '../api/comments'
import { dispatchXP } from '../api/player'
import { bestImage, getPublicProfile, type PublicProfile } from '../identity/api'
import { archetypeName, displayName } from '../identity/archetypes'
import { useMemberGate } from '../identity/gate'
import { CommentSection } from '../components/CommentSection'
import { MemeTweetGallery } from '../components/MemeTweetGallery'
import { ShareToX } from '../components/ShareToX'
import { shortWallet } from '../components/ProfileShowcase'
import type { MemeSourceType } from '../types/unified'
import { memeLink, useBack } from '../lib/links'
import './MemePage.css'

// ── Up next: memes you haven't seen this visit ───────────────────────────────

interface Teaser { source: MemeSourceType; id: string; title: string; image: string; wallet: string | null; date: string }

const SEEN_KEY = 'vvc-seen-memes'
function seenSet(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]')) } catch { return new Set() }
}
function markSeen(key: string) {
  try {
    const s = seenSet(); s.add(key)
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300)))
  } catch { /* private mode */ }
}


let poolCache: Promise<Teaser[]> | null = null
function teaserPool(): Promise<Teaser[]> {
  poolCache ??= Promise.allSettled([fetchMemes(1, 40), fetchGalleryMemes(1, 40)]).then(([f, s]) => {
    const out: Teaser[] = []
    if (f.status === 'fulfilled') for (const m of f.value.items) {
      if (m.status !== 'done') continue
      out.push({ source: 'factory', id: m.job_id, title: teaserTitle('factory', m), image: factoryImageUrl(m.job_id), wallet: m.wallet, date: m.created_at })
    }
    if (s.status === 'fulfilled') for (const m of s.value.items) {
      out.push({ source: 'studio', id: m.id, title: teaserTitle('studio', m), image: studioMemeImageUrl(m.id), wallet: m.wallet, date: m.created_at })
    }
    return out.sort((a, b) => b.date.localeCompare(a.date))
  })
  return poolCache
}

function useUpNext(key: string) {
  const [list, setList] = useState<Teaser[]>([])
  useEffect(() => {
    markSeen(key)
    teaserPool().then(pool => {
      const seen = seenSet()
      const fresh = pool.filter(t => !seen.has(`${t.source}:${t.id}`))
      // Seen everything? Start the loop over, still skipping this one
      setList((fresh.length ? fresh : pool.filter(t => `${t.source}:${t.id}` !== key)).slice(0, 8))
    })
  }, [key])
  return list
}

function useMoreFrom(wallet: string | null, key: string) {
  const [list, setList] = useState<Teaser[]>([])
  useEffect(() => {
    if (!wallet) { setList([]); return }
    Promise.allSettled([fetchMemesByWallet(wallet, 12), fetchStudioMemesByWallet(wallet, 12)]).then(([f, s]) => {
      const out: Teaser[] = []
      if (f.status === 'fulfilled') for (const m of f.value) if (m.status === 'done' && m.type !== 'handmade') out.push({ source: 'factory', id: m.job_id, title: teaserTitle('factory', m), image: factoryImageUrl(m.job_id), wallet, date: m.created_at })
      if (s.status === 'fulfilled') for (const m of s.value) out.push({ source: 'studio', id: m.id, title: teaserTitle('studio', m), image: studioMemeImageUrl(m.id), wallet, date: m.created_at })
      setList(out.filter(t => `${t.source}:${t.id}` !== key).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6))
    })
  }, [wallet, key])
  return list
}

// ── Little helpers ───────────────────────────────────────────────────────────

function ago(iso: string | null) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n))

// ── The page ─────────────────────────────────────────────────────────────────

export function MemePage({ source, id }: { source: MemeSourceType; id: string }) {
  const navigate = useNavigate()
  const gate = useMemberGate()
  const key = `${source}:${id}`
  const image = source === 'studio' ? studioMemeImageUrl(id) : source === 'factory' ? factoryImageUrl(id) : `/memebank/${id}/image`
  const shareUrl = memeLink(source, id)
  const back = useBack('/memes')

  const { info, missing } = useMeme(source, id)
  const meme = info ?? EMPTY
  const upNext = useUpNext(key)
  const moreFrom = useMoreFrom(meme.wallet, key)

  // Creator
  const [creator, setCreator] = useState<PublicProfile | null | undefined>(undefined)
  const [following, setFollowing] = useState<boolean | null>(null)
  const own = !!meme.wallet && meme.wallet === gate.wallet
  useEffect(() => {
    setCreator(undefined)
    if (meme.wallet) getPublicProfile(meme.wallet).then(setCreator)
  }, [meme.wallet])
  useEffect(() => {
    if (!meme.wallet || !gate.wallet || own) { setFollowing(null); return }
    checkIsFollowing(meme.wallet).then(setFollowing).catch(() => setFollowing(false))
  }, [meme.wallet, gate.wallet, own])

  // Votes
  const [votes, setVotes] = useState<VoteState | null>(null)
  const [voting, setVoting] = useState(false)
  const [bump, setBump] = useState<{ dir: 1 | -1; n: number } | null>(null)
  const [xp, setXp] = useState<{ amount: number; n: number } | null>(null)
  const [nudge, setNudge] = useState(false)
  useEffect(() => {
    setVotes(null); setNudge(false)
    getVoteState(id, source).then(setVotes).catch(() => setVotes({ up_votes: 0, down_votes: 0, score: 0, tier: 'fresh', your_vote: null }))
  }, [id, source, gate.wallet])

  const [replies, setReplies] = useState<number | null>(null)
  useEffect(() => {
    setReplies(null)
    if (source !== 'reddit') fetchComments(source, id).then(c => setReplies(c.length)).catch(() => setReplies(0))
  }, [source, id])

  // Count this as a detail view, with the time spent
  useEffect(() => {
    const t0 = Date.now()
    trackFeedAction(id, source, 'detail')
    return () => { if (Date.now() - t0 > 1500) trackFeedAction(id, source, 'skip', Date.now() - t0) }
  }, [id, source])

  // Back to the top for each new meme
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.scrollTo({ top: 0 }) }, [key])

  const vote = useCallback(async (dir: 1 | -1) => {
    if (gate.locked) { gate.join(dir === 1 ? 'vote Based' : 'vote'); return }
    if (voting || !votes) return
    const prev = votes
    // Show it straight away; the server's numbers replace these
    const undo = prev.your_vote === dir
    const up = prev.up_votes + (dir === 1 ? (undo ? -1 : 1) : prev.your_vote === 1 ? -1 : 0)
    const down = prev.down_votes + (dir === -1 ? (undo ? -1 : 1) : prev.your_vote === -1 ? -1 : 0)
    setVotes({ ...prev, up_votes: up, down_votes: down, score: up - down, your_vote: undo ? null : dir })
    if (!undo) setBump(b => ({ dir, n: (b?.n ?? 0) + 1 }))
    setVoting(true)
    try {
      const r = await castVote(id, source, dir)
      setVotes(r)
      if (r.xp_awarded > 0) { dispatchXP(r.xp_awarded, dir === 1 ? 'chad' : 'virgin'); setXp(x => ({ amount: r.xp_awarded, n: (x?.n ?? 0) + 1 })) }
      if (r.your_vote) { trackFeedAction(id, source, r.your_vote === 1 ? 'up' : 'down'); setNudge(true) }
    } catch {
      setVotes(prev)
    } finally {
      setVoting(false)
    }
  }, [gate, voting, votes, id, source])

  // Double-tap the meme to call it Based
  const [heart, setHeart] = useState(0)
  const lastTap = useRef(0)
  const [zoom, setZoom] = useState(false)
  const tapMeme = () => {
    const now = Date.now()
    if (now - lastTap.current < 320) {
      lastTap.current = 0
      setHeart(h => h + 1)
      if (votes?.your_vote !== 1) vote(1)
      return
    }
    lastTap.current = now
    window.setTimeout(() => { if (lastTap.current === now) { lastTap.current = 0; setZoom(true) } }, 330)
  }

  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })
    trackFeedAction(id, source, 'share')
  }

  const next = upNext[0]
  const goNext = useCallback(() => { if (next) navigate(`/memes/${next.source}/${next.id}`) }, [next, navigate])
  const open = (t: Teaser) => navigate(`/memes/${t.source}/${t.id}`)

  // Keyboard: → / J next, ← / K back, B Based, C Cringe
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (sharing || zoom || el?.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight' || e.key === 'j') goNext()
      else if (e.key === 'ArrowLeft' || e.key === 'k') back()
      else if (e.key === 'b') vote(1)
      else if (e.key === 'c') vote(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, back, vote, sharing, zoom])

  useEffect(() => { if (meme.title) document.title = `${meme.title} · Virgin vs Chad` }, [meme.title])

  const tier = votes?.tier ?? 'fresh'
  const t = TIERS[tier]
  const total = votes ? votes.up_votes + votes.down_votes : 0
  const basedPct = total ? Math.round((votes!.up_votes / total) * 100) : 50
  const step = NEXT[tier]
  const toNext = step ? Math.max(0, step.votes - total) : 0
  const progress = step ? Math.min(100, ((total - step.from) / (step.votes - step.from)) * 100) : 100

  const name = creator ? displayName(creator) : meme.wallet ? shortWallet(meme.wallet) : source === 'reddit' ? 'Meme bank' : 'Anonymous'
  const pfp = creator ? bestImage(creator) : null
  const openCreator = () => meme.wallet && navigate(`/u/${encodeURIComponent(meme.wallet)}`)
  const matchup = meme.sides.length === 2 && meme.sides.every(s => splitSide(s.name).kicker)

  if (missing) {
    return (
      <div className="mp-root" ref={root}>
        <div className="mp-missing">
          <div className="mp-missing-emoji">🫥</div>
          <h2>This meme left the building</h2>
          <p>It was deleted, or the link is off.</p>
          <div className="mp-missing-actions">
            {next && <button className="mp-btn mp-btn--gold" onClick={goNext}>Show me another →</button>}
            <button className="mp-btn" onClick={() => navigate('/memes')}>Back to the feed</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mp-root" ref={root} style={{ '--tier': t.color } as CSSProperties}>
      <header className="mp-top">
        <button className="mp-top-back" onClick={back} aria-label="Back">←</button>
        <div className="mp-top-title">
          <b>Meme</b>
          {votes && <span>{compact(total)} votes · {replies ?? '…'} replies</span>}
        </div>
        {next && <button className="mp-top-next" onClick={goNext} title="Next meme (→)">Next <span>→</span></button>}
      </header>

      <div className="mp-layout">
        <main className="mp-main">
          <article className={`mp-post mp-post--${tier}`} key={key}>
            {/* Who made it */}
            <div className="mp-author">
              <button className="mp-avatar" onClick={openCreator} disabled={!meme.wallet} aria-label={`${name}'s profile`}>
                {pfp ? <img src={pfp} alt="" /> : <span>{creator === undefined && meme.wallet ? '' : (meme.wallet ?? 'VC').slice(0, 2).toUpperCase()}</span>}
              </button>
              <div className="mp-author-id">
                <button className="mp-author-name" onClick={openCreator} disabled={!meme.wallet}>{name}</button>
                <div className="mp-author-sub">
                  {meme.wallet && <span>@{shortWallet(meme.wallet)}</span>}
                  {creator && <span>{archetypeName(creator.archetype)}</span>}
                  {meme.createdAt && <span title={new Date(meme.createdAt).toLocaleString()}>{ago(meme.createdAt)}</span>}
                </div>
              </div>
              {own ? <span className="mp-own">Your meme</span>
                : meme.wallet && creator !== null && (
                  <button {...gate.lockProps('follow creators')} className={`mp-follow${following ? ' mp-follow--on' : ''}`}
                    onClick={gate.guard(() => toggleFollow(meme.wallet!).then(r => setFollowing(r.is_following)).catch(() => {}), 'follow creators')}>
                    <span className="mp-follow-label">{following ? 'Following' : 'Follow'}</span>
                    {following && <span className="mp-follow-hover">Unfollow</span>}
                  </button>
                )}
            </div>

            {/* The headline: the matchup */}
            {info === null ? <div className="mp-title mp-title--loading" />
              : matchup ? (
                <h1 className="mp-title mp-title--vs">
                  {meme.sides.map((s, i) => {
                    const { kicker, rest } = splitSide(s.name)
                    return (
                      <span key={i} className={`mp-vs-side mp-vs-side--${kicker!.toLowerCase()}`}>
                        <small>{kicker}</small>{rest}
                      </span>
                    )
                  }).reduce<ReactNode[]>((a, el, i) => (i ? [...a, <em key={`v${i}`} className="mp-vs">vs</em>, el] : [el]), [])}
                </h1>
              ) : <h1 className="mp-title">{meme.title}</h1>}

            {meme.remixedFrom && (
              <button className="mp-remixof" onClick={() => navigate(`/memes/studio/${meme.remixedFrom!.id}`)}>
                <img src={studioMemeImageUrl(meme.remixedFrom.id)} alt="" />
                <span>🎨 Remix of <b>{meme.remixedFrom.title ?? 'another meme'}</b></span>
                <i>→</i>
              </button>
            )}

            {/* The meme, whole. Tap to zoom, double-tap for Based */}
            <div className="mp-media" onClick={tapMeme} role="button" tabIndex={0} aria-label="Open full size (double-tap to vote Based)"
              onKeyDown={e => { if (e.key === 'Enter') setZoom(true) }}>
              <span className="mp-tier" title={`This meme is ${t.label}`}>{t.icon} {t.label}</span>
              <img src={image} alt={meme.title} draggable={false} />
              {heart > 0 && <span key={heart} className="mp-burst" aria-hidden>▲<b>BASED</b></span>}
            </div>

            {/* The things to do with it */}
            <div className="mp-actions">
              <div className="mp-vote">
                <button {...gate.lockProps('vote')} className={`mp-vote-btn mp-vote-btn--up${votes?.your_vote === 1 ? ' is-on' : ''}`}
                  onClick={() => vote(1)} disabled={!votes} title="Based (B)">
                  <span className="mp-vote-icon">▲</span>
                  <span className="mp-vote-word">Based</span>
                  <b key={`u${bump?.dir === 1 ? bump.n : 0}`} className={bump?.dir === 1 ? 'mp-pop' : ''}>{votes ? compact(votes.up_votes) : '…'}</b>
                </button>
                <button {...gate.lockProps('vote')} className={`mp-vote-btn mp-vote-btn--down${votes?.your_vote === -1 ? ' is-on' : ''}`}
                  onClick={() => vote(-1)} disabled={!votes} title="Cringe (C)">
                  <span className="mp-vote-icon">▼</span>
                  <span className="mp-vote-word">Cringe</span>
                  <b key={`d${bump?.dir === -1 ? bump.n : 0}`} className={bump?.dir === -1 ? 'mp-pop' : ''}>{votes ? compact(votes.down_votes) : '…'}</b>
                </button>
                {xp && <span key={xp.n} className="mp-xp">+{xp.amount} XP</span>}
              </div>
              <div className="mp-tools">
                {source !== 'reddit' && (
                  <button className="mp-tool" onClick={() => document.getElementById('mp-replies')?.scrollIntoView({ behavior: 'smooth' })} title="Replies">
                    💬 <span>{replies ?? ''}</span>
                  </button>
                )}
                {source !== 'reddit' && (
                  <button {...gate.lockProps('share to X')} className="mp-tool mp-tool--x" onClick={gate.guard(() => setSharing(true), 'share to X')} title="Share to X">
                    𝕏 <span>Share</span>
                  </button>
                )}
                {meme.hasDraft && (
                  <button className="mp-tool" onClick={() => navigate(`/studio/edit/${id}`)} title="Open a copy in the Studio">🎨 <span>Remix</span></button>
                )}
                <button className="mp-tool" onClick={copyLink} title="Copy link">{copied ? '✓' : '🔗'}</button>
                <a className="mp-tool" href={image} download={`vvc-${id}`} title="Download">⬇</a>
              </div>
            </div>

            {/* Based vs Cringe, and how far to the next tier */}
            <div className="mp-meter">
              <div className="mp-meter-bar" aria-label={`${basedPct}% Based`}>
                <span className="mp-meter-based" style={{ width: `${basedPct}%` }} />
              </div>
              <div className="mp-meter-legend">
                <span>{total ? `${basedPct}% Based` : 'No votes yet'}</span>
                <span>{total ? `${100 - basedPct}% Cringe` : 'Be the first'}</span>
              </div>
            </div>

            <div className="mp-climb">
              {step ? (
                <>
                  <div className="mp-climb-row">
                    <span className="mp-climb-from">{t.icon} {t.label}</span>
                    <div className="mp-climb-track"><span style={{ width: `${Math.max(progress, 3)}%` }} /></div>
                    <span className="mp-climb-to" style={{ color: TIERS[step.tier].color }}>{TIERS[step.tier].icon} {TIERS[step.tier].label}</span>
                  </div>
                  <p className="mp-climb-note">
                    {toNext > 0 ? <>About <b>{toNext}</b> more vote{toNext === 1 ? '' : 's'} to {TIERS[step.tier].label}, if they're mostly Based.</>
                      : <>Votes are in. It climbs to {TIERS[step.tier].label} once they keep coming.</>}
                  </p>
                </>
              ) : <p className="mp-climb-note mp-climb-note--top">{t.icon} {t.label}. It made it to the top.</p>}

              {tier === 'fresh' && (
                votes?.your_vote === 1
                  ? <div className="mp-scout mp-scout--on">🔭 <span>You're scouting this one. XP lands when it climbs: {SCOUT.map(([l, x]) => `${l} +${x}`).join(' · ')}</span></div>
                  : <div className="mp-scout">🔭 <span><b>Scout bonus.</b> Call it Based while it's Fresh and earn XP if it climbs: {SCOUT.map(([l, x]) => `${l} +${x}`).join(' · ')}</span></div>
              )}
            </div>

            {/* After a vote: keep going */}
            {nudge && next && (
              <button className="mp-nudge" onClick={goNext}>
                <img src={next.image} alt="" />
                <span><small>Up next</small>{next.title}</span>
                <i>→</i>
              </button>
            )}
          </article>

          {/* The breakdown: what each side is about */}
          {meme.sides.some(s => s.labels.length) && (
            <section className="mp-card mp-tape">
              <h2 className="mp-h">The breakdown</h2>
              <div className={`mp-tape-cols${meme.sides.length === 1 ? ' mp-tape-cols--one' : ''}`}>
                {meme.sides.map((s, i) => {
                  const { kicker, rest } = splitSide(s.name)
                  const side = kicker?.toLowerCase() ?? (s.char === 'chad' || s.char === 'virgin' ? s.char : i % 2 ? 'chad' : 'virgin')
                  return (
                    <div key={i} className={`mp-tape-col mp-tape-col--${side}`}>
                      <div className="mp-tape-head">
                        {s.char && !kicker && (
                          <img src={`/assets/chars/${s.char}.png`} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
                        )}
                        <span>{kicker && <small>{kicker}</small>}{rest}</span>
                      </div>
                      <ul>{s.labels.map((l, j) => <li key={j} style={{ animationDelay: `${j * 60}ms` }}>{l}</li>)}</ul>
                    </div>
                  )
                })}
              </div>
              {meme.characters.length > 0 && (
                <div className="mp-cast">
                  <span>Cast</span>
                  {meme.characters.map(c => (
                    <button key={c} onClick={() => navigate(`/cast/${pretty(c)}`)}>
                      <img src={`/assets/chars/${c}.png`} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
                      {pretty(c)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {source !== 'reddit' && (
            <section className="mp-card mp-replies" id="mp-replies">
              <CommentSection source={source} memeId={id} onOpenProfile={w => navigate(`/u/${encodeURIComponent(w)}`)} />
            </section>
          )}

          {source !== 'reddit' && (
            <section className="mp-card mp-onx">
              <MemeTweetGallery meme_id={id} meme_type={source} />
            </section>
          )}
        </main>

        <aside className="mp-rail">
          {upNext.length > 0 && (
            <section className="mp-card">
              <h2 className="mp-h">Up next <span className="mp-h-kbd">→</span></h2>
              <div className="mp-next-list">
                {upNext.slice(0, 5).map((n, i) => (
                  <button key={`${n.source}:${n.id}`} className={`mp-next${i === 0 ? ' mp-next--first' : ''}`} onClick={() => open(n)}>
                    <img src={n.image} alt="" loading="lazy" />
                    <span>{n.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {moreFrom.length > 0 && (
            <section className="mp-card">
              <h2 className="mp-h">More from {name}</h2>
              <div className="mp-more-grid">
                {moreFrom.map(m => (
                  <button key={`${m.source}:${m.id}`} onClick={() => open(m)} title={m.title}>
                    <img src={m.image} alt={m.title} loading="lazy" />
                  </button>
                ))}
              </div>
              <button className="mp-link" onClick={openCreator}>See their profile →</button>
            </section>
          )}

          <section className="mp-card mp-cta">
            <div className="mp-cta-art" aria-hidden>⚡</div>
            <h2>Think you can top this?</h2>
            <p>Make your own matchup in seconds, or build one by hand.</p>
            <div className="mp-cta-btns">
              <button className="mp-btn mp-btn--gold" onClick={() => navigate('/factory')}>Meme Factory</button>
              <button className="mp-btn" onClick={() => navigate('/studio')}>Studio</button>
            </div>
          </section>
        </aside>
      </div>

      {zoom && (
        <div className="mp-lightbox" onClick={() => setZoom(false)} role="dialog" aria-label="Meme, full size">
          <img src={image} alt={meme.title} />
          <span>Click anywhere to close</span>
        </div>
      )}

      {sharing && (
        <ShareToX meme={{ sourceId: id, type: source, title: meme.title, imageUrl: image, wallet: meme.wallet }}
          onClose={() => setSharing(false)} onShared={() => trackFeedAction(id, source, 'share')} />
      )}
    </div>
  )
}

