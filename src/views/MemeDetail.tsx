import { useState, useEffect } from 'react'
import { imageUrl, parseMemeId, submitVote, buildTweetUrl, fetchMemes, fetchMemesByWallet, type Meme } from '../api/memes'
import { signAction, truncateAddress } from '../wallet'
import { CHARACTERS } from '../data/characterLore'
import { CommentSection } from '../components/CommentSection'

// ── Creator profile ───────────────────────────────────────────────────────────
type CachedProfile = { character: string; portraitDataUrl?: string } | null
const _cache = new Map<string, Promise<CachedProfile>>()
function getProfile(wallet: string): Promise<CachedProfile> {
  if (!_cache.has(wallet)) {
    _cache.set(wallet,
      fetch(`/profiles/${encodeURIComponent(wallet)}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  }
  return _cache.get(wallet)!
}

function CreatorBadge({ wallet }: { wallet: string }) {
  const [profile, setProfile] = useState<CachedProfile | undefined>(undefined)
  useEffect(() => { getProfile(wallet).then(setProfile) }, [wallet])

  const src = profile?.portraitDataUrl ?? (profile ? `/assets/chars/${profile.character}.png` : null)

  return (
    <div className="md-creator">
      <div className="md-creator-avatar">
        {profile === undefined
          ? <div className="creator-avatar creator-avatar--pulse" style={{ width: 44, height: 44 }} />
          : src
            ? <img src={src} alt="" className="md-creator-img" />
            : <div className="md-creator-placeholder">{wallet.slice(0, 2).toUpperCase()}</div>
        }
      </div>
      <div className="md-creator-info">
        <span className="md-creator-label">Creator</span>
        <span className="md-creator-addr">{truncateAddress(wallet)}</span>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getVotedKey(address: string, jobId: string) {
  return `vvc_voted_v2_${address}_${jobId}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// ── Related memes strip ───────────────────────────────────────────────────────
function RelatedStrip({ currentJobId, creatorWallet, onNavigate }: {
  currentJobId: string
  creatorWallet: string | null
  onNavigate: (meme: Meme) => void
}) {
  const [creatorMemes, setCreatorMemes] = useState<Meme[]>([])
  const [recentMemes, setRecentMemes] = useState<Meme[]>([])

  useEffect(() => {
    if (creatorWallet) {
      fetchMemesByWallet(creatorWallet, 20).then(items =>
        setCreatorMemes(items.filter(m => m.job_id !== currentJobId).slice(0, 8))
      ).catch(() => {})
    }
    fetchMemes(1, 40).then(data =>
      setRecentMemes(data.items.filter(m => m.job_id !== currentJobId && m.wallet !== null).slice(0, 12))
    ).catch(() => {})
  }, [currentJobId, creatorWallet])

  const sections: { label: string; items: Meme[] }[] = []
  if (creatorMemes.length > 0) sections.push({ label: 'More from this creator', items: creatorMemes })
  if (recentMemes.length > 0) sections.push({ label: 'Recent memes', items: recentMemes })
  if (sections.length === 0) return null

  return (
    <div className="md-related">
      {sections.map(({ label, items }) => (
        <div key={label} className="md-related-section">
          <h4 className="md-related-title">{label}</h4>
          <div className="md-related-strip">
            {items.map(m => {
              const { virgin, chad } = parseMemeId(m.meme_id)
              return (
                <div key={m.job_id} className="md-related-card" onClick={() => onNavigate(m)}>
                  <img src={imageUrl(m.job_id)} alt={`${virgin} vs ${chad}`} className="md-related-img" />
                  <div className="md-related-label">
                    <span className="md-related-virgin">{virgin}</span>
                    <span className="md-related-vs"> vs </span>
                    <span className="md-related-chad">{chad}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  meme: Meme
  address: string | null
  onBack: () => void
  onNavigate?: (meme: Meme) => void
  onOpenCharacter?: (name: string) => void
  onOpenProfile?: (wallet: string) => void
}

export function MemeDetail({ meme, address, onBack, onNavigate, onOpenCharacter, onOpenProfile }: Props) {
  const { virgin, chad } = parseMemeId(meme.meme_id)
  // Match descriptor to a roster character; fall back to canonical Virgin/Chad
  const virginRoster = CHARACTERS.find(c => c.name === virgin)
  const chadRoster   = CHARACTERS.find(c => c.name === chad)
  const virginChar   = virginRoster ?? CHARACTERS.find(c => c.key === 'virgin')!
  const chadChar     = chadRoster   ?? CHARACTERS.find(c => c.key === 'chad')!
  const virginFilter = virginRoster?.name ?? 'Virgin'
  const chadFilter   = chadRoster?.name   ?? 'Chad'

  const [voted, setVoted] = useState(() =>
    address ? !!localStorage.getItem(getVotedKey(address, meme.job_id)) : false
  )
  const [voting, setVoting] = useState(false)
  const [voteCount, setVoteCount] = useState(meme.vote_count ?? 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const handleVote = async () => {
    if (!address || voted || voting) return
    setVoting(true)
    try {
      const sig = await signAction(`vote:${meme.job_id}`, address)
      const result = await submitVote(meme.job_id, address, sig)
      localStorage.setItem(getVotedKey(address, meme.job_id), '1')
      setVoted(true)
      setVoteCount(result.vote_count)
    } catch { /* phantom rejected */ } finally { setVoting(false) }
  }

  const jobShort = meme.job_id.replace('api_', '')

  return (
    <div className="meme-detail">

      {/* ── Top bar ── */}
      <div className="md-topbar">
        <button className="md-back" onClick={onBack}>← Back</button>
        <span className="md-id">#{jobShort}</span>
      </div>

      {/* ── Main layout ── */}
      <div className="md-layout">

        {/* Image */}
        <div className="md-image-panel">
          <img
            className="md-image"
            src={imageUrl(meme.job_id)}
            alt={`Virgin ${virgin} vs Chad ${chad}`}
          />
        </div>

        {/* Info */}
        <div className="md-info">

          <h1 className="md-title">
            <span className="md-title-virgin">Virgin {virgin}</span>
            <span className="md-title-vs">vs</span>
            <span className="md-title-chad">Chad {chad}</span>
          </h1>

          {meme.wallet && (
            <div
              className={onOpenProfile ? 'md-creator-clickable' : undefined}
              onClick={() => meme.wallet && onOpenProfile?.(meme.wallet)}
            >
              <CreatorBadge wallet={meme.wallet} />
            </div>
          )}

          <div className="md-attrs">
            <div className="md-attr">
              <span className="md-attr-label">Created</span>
              <span className="md-attr-value">{formatDate(meme.created_at)}</span>
            </div>
            <div className="md-attr">
              <span className="md-attr-label">Time</span>
              <span className="md-attr-value">{formatTime(meme.created_at)}</span>
            </div>
            <div className="md-attr">
              <span className="md-attr-label">Votes</span>
              <span className="md-attr-value">{voteCount}</span>
            </div>
          </div>

          <div className="md-characters">
            <span className="md-characters-title">Featured Characters</span>
            <div className="md-characters-row">
              <button
                className="md-char-portrait"
                onClick={() => onOpenCharacter?.(virginFilter)}
                title={`Go to ${virginChar.name}'s profile`}
              >
                <div className="md-char-portrait-img-wrap">
                  <img src={`/assets/chars/${virginChar.file}.${virginChar.ext ?? 'png'}`} alt={virginChar.name} />
                </div>
                <span className="md-char-portrait-name">{virginChar.name}</span>
              </button>
              <button
                className="md-char-portrait"
                onClick={() => onOpenCharacter?.(chadFilter)}
                title={`Go to ${chadChar.name}'s profile`}
              >
                <div className="md-char-portrait-img-wrap">
                  <img src={`/assets/chars/${chadChar.file}.${chadChar.ext ?? 'png'}`} alt={chadChar.name} />
                </div>
                <span className="md-char-portrait-name">{chadChar.name}</span>
              </button>
            </div>
          </div>

          <div className="md-actions">
            <button
              className={`md-vote-btn ${voted ? 'voted' : ''}`}
              onClick={handleVote}
              disabled={!address || voted || voting}
              title={!address ? 'Connect wallet to vote' : undefined}
            >
              {voted ? `✓ Voted  ·  ${voteCount}` : voting ? '…' : `↑ Vote  ·  ${voteCount}`}
            </button>
            <a
              className="md-share-btn"
              href={buildTweetUrl(virgin, chad)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Share on X ↗
            </a>
          </div>

        </div>
      </div>

      {/* ── Comments ── */}
      <CommentSection jobId={meme.job_id} address={address} onOpenProfile={onOpenProfile} />

      {onNavigate && (
        <RelatedStrip
          currentJobId={meme.job_id}
          creatorWallet={meme.wallet}
          onNavigate={(m) => {
            onNavigate(m)
            // scroll detail back to top
            document.querySelector('.meme-detail')?.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )}

    </div>
  )
}
