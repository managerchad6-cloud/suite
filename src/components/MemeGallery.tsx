import { useState, useEffect, useCallback, forwardRef } from 'react'
import {
  fetchMemes,
  fetchLeaderboard,
  submitVote,
  imageUrl,
  parseMemeId,
  type Meme,
  type LeaderboardEntry,
} from '../api/memes'
import { signAction, connectWallet, isPhantomInstalled, truncateAddress } from '../wallet'

// ── Creator avatar ─────────────────────────────────────────────────
type CachedProfile = { character: string; portraitDataUrl?: string } | null
const _profileCache = new Map<string, Promise<CachedProfile>>()

function fetchCreatorProfile(wallet: string): Promise<CachedProfile> {
  if (!_profileCache.has(wallet)) {
    _profileCache.set(wallet,
      fetch(`/profiles/${encodeURIComponent(wallet)}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  }
  return _profileCache.get(wallet)!
}

function CreatorAvatar({ wallet }: { wallet: string }) {
  const [profile, setProfile] = useState<CachedProfile | undefined>(undefined)
  useEffect(() => { fetchCreatorProfile(wallet).then(setProfile) }, [wallet])

  if (profile === undefined) return <div className="creator-avatar creator-avatar--pulse" />
  if (!profile) return (
    <div className="creator-avatar creator-avatar--placeholder">
      {wallet.slice(0, 2).toUpperCase()}
    </div>
  )
  const src = profile.portraitDataUrl ?? `/assets/chars/${profile.character}.png`
  return <img className="creator-avatar" src={src} alt="" />
}

type Tab = 'daily' | 'weekly' | 'monthly' | 'all' | 'winners'

const CUTOFFS: Partial<Record<Tab, number>> = {
  daily:   1 * 24 * 60 * 60 * 1000,
  weekly:  7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'daily',   label: 'Daily' },
  { id: 'weekly',  label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all',     label: 'All' },
  { id: 'winners', label: '🏆 Winners & Rewards' },
]

function filterMemes(memes: Meme[], tab: Tab): Meme[] {
  const cutoff = CUTOFFS[tab]
  if (!cutoff) return memes
  const since = Date.now() - cutoff
  return memes.filter((m) => new Date(m.created_at).getTime() >= since)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getVotedKey(address: string, jobId: string) {
  return `vvc_voted_v2_${address}_${jobId}`
}

// ── Lightbox ──────────────────────────────────────────────────────

interface LightboxEntry { jobId: string; virgin: string; chad: string }

function Lightbox({ jobId, virgin, chad, onClose }: LightboxEntry & { onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img className="lightbox-img" src={imageUrl(jobId)} alt={`Virgin ${virgin} vs Chad ${chad}`} />
        <div className="lightbox-caption">
          <span className="lightbox-virgin">Virgin {virgin}</span>
          <span className="lightbox-vs">vs</span>
          <span className="lightbox-chad">Chad {chad}</span>
        </div>
      </div>
    </div>
  )
}

// ── Meme card ─────────────────────────────────────────────────────

interface MemeCardProps {
  item: Meme
  address: string | null
  onSelect: (item: Meme) => void
  onOpenDetail?: (item: Meme) => void
  onOpenProfile?: (wallet: string) => void
}

function MemeCard({ item, address, onSelect, onOpenDetail, onOpenProfile }: MemeCardProps) {
  const { virgin, chad } = parseMemeId(item.meme_id)
  const [imgFailed, setImgFailed] = useState(false)
  const [voting, setVoting] = useState(false)
  const [voted, setVoted] = useState(() =>
    address ? !!localStorage.getItem(getVotedKey(address, item.job_id)) : false
  )
  const [voteCount, setVoteCount] = useState(item.vote_count ?? 0)

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!address || voted || voting) return
    setVoting(true)
    try {
      const sig = await signAction(`vote:${item.job_id}`, address)
      const result = await submitVote(item.job_id, address, sig)
      localStorage.setItem(getVotedKey(address, item.job_id), '1')
      setVoted(true)
      setVoteCount(result.vote_count)
    } catch { /* phantom rejected */ } finally {
      setVoting(false)
    }
  }

  return (
    <div className="meme-card" onClick={() => !imgFailed && onSelect(item)}>
      <div className="meme-card-img">
        {!imgFailed ? (
          <img
            src={imageUrl(item.job_id)}
            alt={`Virgin ${virgin} vs Chad ${chad}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="meme-card-img-fallback">IMAGE UNAVAILABLE</div>
        )}
      </div>
      <div className="meme-card-body">
        <div className="meme-card-recipe">
          <div className="recipe-field">
            <span className="recipe-label">Virgin is…</span>
            <span className="recipe-value">{virgin}</span>
          </div>
          <div className="recipe-field">
            <span className="recipe-label">Chad is…</span>
            <span className="recipe-value recipe-value--chad">{chad}</span>
          </div>
        </div>
        <div className="meme-card-footer">
          {item.wallet ? (
            <div
              className={`meme-creator ${onOpenProfile ? 'meme-creator--clickable' : ''}`}
              onClick={(e) => { e.stopPropagation(); onOpenProfile?.(item.wallet!) }}
            >
              <CreatorAvatar wallet={item.wallet} />
              <span className="meme-date">{truncateAddress(item.wallet)}</span>
            </div>
          ) : (
            <span className="meme-date">{formatDate(item.created_at)}</span>
          )}
          <div className="meme-card-actions">
            {onOpenDetail && (
              <button
                className="btn-meme-page"
                onClick={(e) => { e.stopPropagation(); onOpenDetail(item) }}
                title="View meme page"
              >
                ↗
              </button>
            )}
            <button
              className={`btn-vote ${voted ? 'voted' : voting ? 'voting' : 'unvoted'}`}
              onClick={handleVote}
              disabled={!address || voted || voting}
              title={voted ? 'Already voted' : !address ? 'Connect wallet to vote' : undefined}
            >
              {voted ? `✓ ${voteCount}` : voting ? '…' : `↑ ${voteCount || 'Vote'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────

function Leaderboard({ onOpenProfile }: { onOpenProfile?: (wallet: string) => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<LightboxEntry | null>(null)

  useEffect(() => {
    fetchLeaderboard(15)
      .then((r) => setEntries(r.items.filter((e) => e.vote_count > 0)))
      .catch(() => setError('Could not load leaderboard.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="leaderboard-loading"><div className="gallery-spinner" /></div>
  if (error) return <div className="gallery-error">{error}</div>
  if (entries.length === 0) return (
    <div className="leaderboard-empty">
      No user-generated memes with votes yet. Create and vote to see rankings here.
    </div>
  )

  return (
    <>
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      <div className="leaderboard-wrap">
        {entries.map((entry, i) => {
          const { virgin, chad } = parseMemeId(entry.meme_id)
          const rank = i + 1
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
          return (
            <div
              key={entry.job_id}
              className={`leaderboard-row ${rank <= 3 ? 'leaderboard-row--podium' : ''}`}
              onClick={() => setLightbox({ jobId: entry.job_id, virgin, chad })}
            >
              <div className="leaderboard-rank">
                {medal ?? <span className="leaderboard-rank-num">{rank}</span>}
              </div>
              <div className="leaderboard-thumb">
                <img
                  src={imageUrl(entry.job_id)}
                  alt={`Virgin ${virgin} vs Chad ${chad}`}
                  loading="lazy"
                />
              </div>
              <div className="leaderboard-info">
                <div className="leaderboard-title">
                  <span className="leaderboard-virgin">Virgin {virgin}</span>
                  <span className="leaderboard-vs">vs</span>
                  <span className="leaderboard-chad">Chad {chad}</span>
                </div>
                <div
                  className={`leaderboard-wallet ${onOpenProfile ? 'leaderboard-wallet--clickable' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onOpenProfile?.(entry.wallet) }}
                >{truncateAddress(entry.wallet)}</div>
              </div>
              <div className="leaderboard-votes">
                <span className="leaderboard-vote-count">{entry.vote_count}</span>
                <span className="leaderboard-vote-label">votes</span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Winners & Rewards ─────────────────────────────────────────────

function WinnersRewards({ address, onConnect, onOpenProfile }: { address: string | null; onConnect: (a: string) => void; onOpenProfile?: (wallet: string) => void }) {
  const [connecting, setConnecting] = useState(false)

  const userRewards = null as { prize: string; memeId: string } | null

  const handleConnect = async () => {
    if (!isPhantomInstalled()) {
      window.open('https://phantom.app/', '_blank', 'noopener')
      return
    }
    setConnecting(true)
    try {
      const addr = await connectWallet()
      onConnect(addr)
    } catch { /* rejected */ } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="winners-wrap">
      <div className="winners-block">
        <h3 className="winners-block-title">Claim your rewards</h3>
        {!address ? (
          <div className="winners-state">
            <span className="winners-state-icon">🏆</span>
            <p className="winners-state-text">Connect your wallet to check your rewards</p>
            <button className="btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect wallet'}
            </button>
          </div>
        ) : userRewards ? (
          <div className="winners-state">
            <span className="winners-state-icon">🎉</span>
            <p className="winners-state-text">You have rewards to claim</p>
            <div className="winners-reward-card">
              <span className="winners-prize">{userRewards.prize}</span>
            </div>
            <button className="btn-primary" onClick={() => alert('Claim flow coming soon.')}>
              Claim reward
            </button>
          </div>
        ) : (
          <div className="winners-state">
            <span className="winners-state-icon">—</span>
            <p className="winners-state-text">No rewards yet</p>
            <p className="winners-state-sub">
              {truncateAddress(address)} · Create and share memes to win prizes
            </p>
          </div>
        )}
      </div>

      <div className="winners-block winners-block--leaderboard">
        <h3 className="winners-block-title">Top 15 — User memes</h3>
        <p className="winners-block-sub">Ranked by community votes · click to preview</p>
        <Leaderboard onOpenProfile={onOpenProfile} />
      </div>
    </div>
  )
}

// ── Gallery ───────────────────────────────────────────────────────

interface MemeGalleryProps {
  address: string | null
  onSelectMeme?: (meme: Meme) => void
  onAutoSelect?: (meme: Meme) => void
  onOpenDetail?: (meme: Meme) => void
  onOpenProfile?: (wallet: string) => void
  characterFilter?: string | null
  onClearCharacterFilter?: () => void
}

export const MemeGallery = forwardRef<HTMLElement, MemeGalleryProps>(
  ({ address, onSelectMeme, onAutoSelect, onOpenDetail, onOpenProfile, characterFilter, onClearCharacterFilter }, ref) => {
    const [tab, setTab] = useState<Tab>('all')
    const [allMemes, setAllMemes] = useState<Meme[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [walletAddress, setWalletAddress] = useState(address)

    useEffect(() => { setWalletAddress(address) }, [address])
    useEffect(() => {
      const h = (e: Event) => {
        const addr = (e as CustomEvent<string>).detail
        if (addr) setWalletAddress(addr)
      }
      window.addEventListener('vvc:wallet-connected', h)
      return () => window.removeEventListener('vvc:wallet-connected', h)
    }, [])

    const handleConnect = (addr: string) => {
      setWalletAddress(addr)
      window.dispatchEvent(new CustomEvent('vvc:wallet-connected', { detail: addr }))
    }

    const load = useCallback(async (pageNum: number, replace: boolean) => {
      try {
        const data = await fetchMemes(pageNum, 40)
        const userMemes = data.items.filter((m) => m.wallet !== null)
        setAllMemes((prev) => replace ? userMemes : [...prev, ...userMemes])
        if (replace && userMemes[0]) onAutoSelect?.(userMemes[0])
        setHasMore(data.has_next)
        setPage(pageNum)
      } catch {
        setError('Could not load memes. The server may be unreachable.')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    }, [])

    useEffect(() => {
      setLoading(true)
      setError(null)
      load(1, true)
    }, [load])

    const handleLoadMore = () => {
      setLoadingMore(true)
      load(page + 1, false)
    }

    const tabFiltered = tab === 'winners' ? [] : filterMemes(allMemes, tab)
    const visible = characterFilter
      ? tabFiltered.filter(m => {
          const { virgin, chad } = parseMemeId(m.meme_id)
          return virgin === characterFilter || chad === characterFilter
        })
      : tabFiltered
    const showGrid = tab !== 'winners'

    const handleSelectMeme = (item: Meme) => {
      onSelectMeme?.(item)
      document.querySelector('.memes-view')?.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
      <section className="gallery-section" ref={ref}>
        <div className="container">
          <div className="gallery-top-bar">
            <div className="gallery-title-row">
              <h2 className="section-title">Meme Gallery</h2>
              {characterFilter && (
                <div className="gallery-char-filter">
                  <span className="gallery-char-filter-label">{characterFilter}</span>
                  <button className="gallery-char-filter-clear" onClick={onClearCharacterFilter} title="Clear filter">×</button>
                </div>
              )}
            </div>
            <div className="gallery-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`gallery-tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'winners' && (
            <WinnersRewards address={walletAddress} onConnect={handleConnect} onOpenProfile={onOpenProfile} />
          )}

          {showGrid && (
            <div className="gallery-grid">
              {loading && (
                <div className="gallery-loading">
                  <div className="gallery-spinner" />
                </div>
              )}
              {error && <div className="gallery-error">{error}</div>}
              {!loading && !error && visible.length === 0 && (
                <div className="gallery-empty">
                  No memes in this period yet. Be the first to create one above.
                </div>
              )}
              {!loading && !error && visible.map((item) => (
                <MemeCard
                  key={item.job_id}
                  item={item}
                  address={walletAddress}
                  onSelect={handleSelectMeme}
                  onOpenDetail={onOpenDetail}
                  onOpenProfile={onOpenProfile}
                />
              ))}
              {hasMore && !loading && !error && (
                <div className="gallery-loadmore">
                  <button
                    className="btn-loadmore"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    )
  }
)

MemeGallery.displayName = 'MemeGallery'
