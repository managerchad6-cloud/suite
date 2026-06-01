import { useEffect, useRef, useState } from 'react'
import { fetchStudioMeme, type StudioMeme } from '../api/studio'
import { fetchMetadata, type JobMetadata } from '../api/memes'
import { truncateAddress } from '../wallet'
import { CommentSection } from '../components/CommentSection'
import type { UnifiedMemeItem } from '../types/unified'
import '../studio-meme-detail.css'

// ── Creator row (shared with StudioMemeDetail) ────────────────────────────────

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

// ── Character chips ───────────────────────────────────────────────────────────

function CharGrid({ chars }: { chars: string[] }) {
  if (!chars.length) return null
  return (
    <div className="smd-section">
      <div className="smd-section-label">Characters</div>
      <div className="smd-char-grid">
        {chars.map((c, i) => (
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
  )
}

// ── Label grid ────────────────────────────────────────────────────────────────

function LabelGroup({ heading, labels }: { heading?: string; labels: string[] }) {
  if (!labels.length) return null
  return (
    <div className="smd-label-group">
      {heading && <div className="smd-label-group-header">{heading}</div>}
      <div className="smd-traits-grid">
        {labels.map((l, i) => (
          <div key={i} className="smd-trait">
            <span className="smd-trait-type">Label</span>
            <span className="smd-trait-value">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────

const BADGE_CLS: Record<string, string> = {
  studio:  'badge--studio',
  factory: 'badge--factory',
  reddit:  'badge--reddit',
}
const BADGE_LABEL: Record<string, string> = {
  studio: 'Studio', factory: 'Factory', reddit: 'Reddit',
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  item: UnifiedMemeItem
  address: string | null
  onBack: () => void
}

export function UnifiedMemeDetail({ item, address, onBack }: Props) {
  const [studioMeta,  setStudioMeta]  = useState<StudioMeme | null>(null)
  const [factoryMeta, setFactoryMeta] = useState<JobMetadata | null>(null)
  const [imgLoaded,   setImgLoaded]   = useState(false)
  const zoomImgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    setStudioMeta(null)
    setFactoryMeta(null)
    setImgLoaded(false)
    if (item.type === 'studio') {
      fetchStudioMeme(item.sourceId).then(setStudioMeta).catch(() => null)
    } else if (item.type === 'factory') {
      fetchMetadata(item.sourceId).then(m => { if (m) setFactoryMeta(m) })
    }
  }, [item.key, item.type, item.sourceId])

  function handleHeroMove(e: React.MouseEvent<HTMLDivElement>) {
    const img = zoomImgRef.current
    if (!img) return
    const rect = e.currentTarget.getBoundingClientRect()
    img.style.transformOrigin =
      `${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  // Resolve display values — prefer enriched, fall back to item
  const title = studioMeta?.titles?.[0] ?? item.title
  const wallet = studioMeta?.wallet ?? item.wallet

  // Characters
  const chars: string[] = studioMeta?.characters ?? []

  // Labels
  const studioLinks = studioMeta?.labelLinks
  const studioLabels = studioMeta?.labels ?? []

  // Factory labels
  const virginLabels = factoryMeta?.virgin_labels ?? []
  const chadLabels   = factoryMeta?.chad_labels   ?? []

  // Reddit sides
  const redditLeft  = item.redditLeftTitle
  const redditRight = item.redditRightTitle
  const redditLeftLabels  = item.redditLeftLabels  ?? []
  const redditRightLabels = item.redditRightLabels ?? []

  const hasLabels =
    (studioLinks && studioLinks.length > 0) ||
    studioLabels.length > 0 ||
    virginLabels.length > 0 || chadLabels.length > 0 ||
    redditLeftLabels.length > 0 || redditRightLabels.length > 0

  return (
    <div className="smd-root">
      <div className="smd-topbar">
        <button className="smd-back" onClick={onBack}>← Back</button>
        <span className="smd-breadcrumb">
          Memes / <span className={`topbar-badge gallery-badge ${BADGE_CLS[item.type]}`}>{BADGE_LABEL[item.type]}</span>
        </span>
      </div>

      <div className="smd-page">

        {/* ── Title ── */}
        <div className="smd-content">
          <div className="smd-head">
            <div className="smd-token-id">
              VVC {BADGE_LABEL[item.type].toUpperCase()} #{item.sourceId.slice(0, 8).toUpperCase()}
            </div>
            <h1 className="smd-title">{title}</h1>
          </div>
        </div>

        {/* ── Hero image ── */}
        <div className="smd-hero" onMouseMove={handleHeroMove}>
          {!imgLoaded && <div className="smd-hero-loading">Loading…</div>}
          <img
            ref={zoomImgRef}
            className="smd-hero-img"
            src={item.imageUrl}
            alt={title}
            style={{ display: imgLoaded ? 'block' : 'none' }}
            onLoad={() => setImgLoaded(true)}
          />
        </div>

        {/* ── Meta ── */}
        <div className="smd-content">

          {wallet && <CreatorRow wallet={wallet} />}

          {/* Reddit topic */}
          {item.redditTopic && (
            <div className="smd-reddit-topic">{item.redditTopic}</div>
          )}

          {chars.length > 0 && (
            <>
              <div className="smd-divider" />
              <CharGrid chars={chars} />
            </>
          )}

          {hasLabels && (
            <>
              <div className="smd-divider" />
              <div className="smd-section">
                <div className="smd-section-label">Labels</div>
                <div className="smd-label-groups">

                  {/* Studio grouped labels */}
                  {studioLinks && studioLinks.length > 0 && (() => {
                    const groups = new Map<string | null, string[]>()
                    for (const { text, charKey } of studioLinks) {
                      const k = charKey ?? null
                      if (!groups.has(k)) groups.set(k, [])
                      groups.get(k)!.push(text)
                    }
                    return <>
                      {[...groups.entries()].filter(([k]) => k !== null).map(([k, ls]) => (
                        <LabelGroup key={k!} heading={k!.replace(/_/g, ' ')} labels={ls} />
                      ))}
                      {(groups.get(null)?.length ?? 0) > 0 && (
                        <LabelGroup heading="Unlinked" labels={groups.get(null)!} />
                      )}
                    </>
                  })()}

                  {/* Studio flat labels (legacy) */}
                  {!studioLinks?.length && studioLabels.length > 0 && (
                    <LabelGroup labels={studioLabels} />
                  )}

                  {/* Factory labels */}
                  {virginLabels.length > 0 && <LabelGroup heading="Virgin" labels={virginLabels} />}
                  {chadLabels.length   > 0 && <LabelGroup heading="Chad"   labels={chadLabels}   />}

                  {/* Reddit labels */}
                  {redditLeftLabels.length  > 0 && <LabelGroup heading={redditLeft  ?? 'Left'}  labels={redditLeftLabels}  />}
                  {redditRightLabels.length > 0 && <LabelGroup heading={redditRight ?? 'Right'} labels={redditRightLabels} />}

                </div>
              </div>
            </>
          )}

          <div className="smd-divider" />

          <div className="smd-details">
            <div className="smd-detail-row">
              <span className="smd-detail-key">Created</span>
              <span className="smd-detail-val">{formatDate(item.dateIso)}</span>
            </div>
            {item.redditScore != null && (
              <div className="smd-detail-row">
                <span className="smd-detail-key">Reddit score</span>
                <span className="smd-detail-val">▲ {item.redditScore.toLocaleString()}</span>
              </div>
            )}
            <div className="smd-detail-row">
              <span className="smd-detail-key">Type</span>
              <span className={`smd-detail-val gallery-badge ${BADGE_CLS[item.type]}`} style={{ position: 'static' }}>
                {BADGE_LABEL[item.type]}
              </span>
            </div>
            {item.redditPermalink && (
              <div className="smd-detail-row">
                <span className="smd-detail-key">Source</span>
                <a className="smd-detail-link" href={item.redditPermalink} target="_blank" rel="noopener noreferrer">
                  View on Reddit ↗
                </a>
              </div>
            )}
          </div>

          <div className="smd-divider" />

          {/* Comments — for studio and factory; reddit links to thread */}
          {item.type !== 'reddit' ? (
            <CommentSection jobId={item.sourceId} address={address} />
          ) : item.redditPermalink ? (
            <a className="smd-reddit-thread-link" href={item.redditPermalink} target="_blank" rel="noopener noreferrer">
              View discussion on Reddit ↗
            </a>
          ) : null}

        </div>
      </div>
    </div>
  )
}
