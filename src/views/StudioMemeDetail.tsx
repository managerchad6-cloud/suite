import { useEffect, useRef, useState } from 'react'
import { fetchStudioMeme, studioMemeImageUrl, type StudioMeme } from '../api/studio'
import { truncateAddress } from '../wallet'
import { CommentSection } from '../components/CommentSection'
import '../studio-meme-detail.css'

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

function CreatorRow({ wallet }: { wallet: string }) {
  const [profile, setProfile] = useState<CachedProfile | undefined>(undefined)
  useEffect(() => { getProfile(wallet).then(setProfile) }, [wallet])

  const src = profile?.portraitDataUrl ?? (profile ? `/assets/chars/${profile.character}.png` : null)

  return (
    <div className="smd-creator-row">
      <div className="smd-creator-avatar">
        {profile === undefined
          ? <div className="smd-creator-avatar-placeholder">…</div>
          : src
            ? <img src={src} alt="" />
            : <div className="smd-creator-avatar-placeholder">{wallet.slice(0, 2).toUpperCase()}</div>
        }
      </div>
      <div className="smd-creator-info">
        <span className="smd-creator-label">Creator</span>
        <span className="smd-creator-addr">{truncateAddress(wallet)}</span>
      </div>
    </div>
  )
}

function LabelSection({ meme }: { meme: StudioMeme }) {
  const links = meme.labelLinks
  const hasLinks = links && links.length > 0
  if (!hasLinks && (!meme.labels || meme.labels.length === 0)) return null

  if (hasLinks) {
    const groups = new Map<string | null, string[]>()
    for (const { text, charKey } of links!) {
      const key = charKey ?? null
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(text)
    }
    const charGroups: [string, string[]][] = []
    const unlinked: string[] = []
    for (const [key, texts] of groups) {
      if (key === null) unlinked.push(...texts)
      else charGroups.push([key, texts])
    }
    return (
      <div className="smd-section">
        <div className="smd-section-label">Labels</div>
        <div className="smd-label-groups">
          {charGroups.map(([charKey, texts]) => (
            <div key={charKey} className="smd-label-group">
              <div className="smd-label-group-header">{charKey.replace(/_/g, ' ')}</div>
              <div className="smd-traits-grid">
                {texts.map((t, i) => (
                  <div key={i} className="smd-trait">
                    <span className="smd-trait-type">Label</span>
                    <span className="smd-trait-value">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {unlinked.length > 0 && (
            <div className="smd-label-group">
              <div className="smd-label-group-header smd-label-group-header--unlinked">Unlinked</div>
              <div className="smd-traits-grid">
                {unlinked.map((t, i) => (
                  <div key={i} className="smd-trait">
                    <span className="smd-trait-type">Label</span>
                    <span className="smd-trait-value">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="smd-section">
      <div className="smd-section-label">Labels</div>
      <div className="smd-traits-grid">
        {meme.labels!.map((l, i) => (
          <div key={i} className="smd-trait">
            <span className="smd-trait-type">Label</span>
            <span className="smd-trait-value">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  id: string
  address: string | null
  onBack: () => void
}

export function StudioMemeDetail({ id, address, onBack }: Props) {
  const [meme,     setMeme]     = useState<StudioMeme | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [imgLoaded, setImgLoaded] = useState(false)
  const zoomImgRef = useRef<HTMLImageElement>(null)

  function handleHeroMove(e: React.MouseEvent<HTMLDivElement>) {
    const img = zoomImgRef.current
    if (!img) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width)  * 100
    const y = ((e.clientY - rect.top)  / rect.height) * 100
    img.style.transformOrigin = `${x}% ${y}%`
  }

  useEffect(() => {
    setLoading(true)
    setMeme(null)
    setImgLoaded(false)
    fetchStudioMeme(id)
      .then(setMeme)
      .catch(() => setMeme(null))
      .finally(() => setLoading(false))
  }, [id])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const title = meme?.titles?.[0]
    ?? (meme?.characters?.length ? meme.characters.map(c => c.replace(/_/g, ' ')).join(' vs ') : 'Untitled Meme')

  return (
    <div className="smd-root">
      <div className="smd-topbar">
        <button className="smd-back" onClick={onBack}>← Back</button>
        <span className="smd-breadcrumb">Memes / <span>{id.slice(0, 8)}…</span></span>
      </div>

      {loading ? (
        <div className="smd-state-fill">Loading…</div>
      ) : !meme ? (
        <div className="smd-state-fill">Meme not found.</div>
      ) : (
        <div className="smd-page">

          {/* ── Meta content ── */}
          <div className="smd-content">

            <div className="smd-head">
              <div className="smd-token-id">VVC Studio #{meme.id.slice(0, 8).toUpperCase()}</div>
              <h1 className="smd-title">{title}</h1>
            </div>

          </div>

          {/* ── Hero image ── */}
          <div className="smd-hero" onMouseMove={handleHeroMove}>
            {!imgLoaded && <div className="smd-hero-loading">Loading…</div>}
            <img
              ref={zoomImgRef}
              className="smd-hero-img"
              src={studioMemeImageUrl(meme.id)}
              alt={title}
              style={{ display: imgLoaded ? 'block' : 'none' }}
              onLoad={() => setImgLoaded(true)}
            />
          </div>

          {/* ── Rest of content ── */}
          <div className="smd-content">

            <CreatorRow wallet={meme.wallet} />

            <div className="smd-divider" />

            {meme.characters.length > 0 && (
              <div className="smd-section">
                <div className="smd-section-label">Characters</div>
                <div className="smd-char-grid">
                  {meme.characters.map((c, i) => (
                    <div key={i} className="smd-char-card">
                      <img
                        className="smd-char-thumb"
                        src={`/assets/chars/${c}.png`}
                        alt={c}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                      <div className="smd-char-info">
                        <span className="smd-trait-type">Character</span>
                        <span className="smd-char-name">{c.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <LabelSection meme={meme} />

            <div className="smd-divider" />

            <div className="smd-details">
              <div className="smd-detail-row">
                <span className="smd-detail-key">Created</span>
                <span className="smd-detail-val">{formatDate(meme.created_at)}</span>
              </div>
              <div className="smd-detail-row">
                <span className="smd-detail-key">Token ID</span>
                <span className="smd-detail-val smd-detail-val--mono">{meme.id}</span>
              </div>
              <div className="smd-detail-row">
                <span className="smd-detail-key">Type</span>
                <span className="smd-detail-val">Handmade</span>
              </div>
            </div>

            <div className="smd-divider" />

            <CommentSection jobId={meme.id} address={address} />

          </div>
        </div>
      )}
    </div>
  )
}
