import { useRef, useState } from 'react'
import { trackFeedAction } from '../api/votes'
import type { UnifiedMemeItem } from '../types/unified'
import './FeedCard.css'

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  studio:  { label: 'STUDIO',  cls: 'badge--studio'  },
  factory: { label: 'FACTORY', cls: 'badge--factory' },
  reddit:  { label: 'REDDIT',  cls: 'badge--reddit'  },
}

const TIER_CHIP: Record<string, string> = {
  rising:    'fc-tier-chip fc-tier-rising',
  hot:       'fc-tier-chip fc-tier-hot',
  legendary: 'fc-tier-chip fc-tier-legendary',
  pantheon:  'fc-tier-chip fc-tier-pantheon',
}
const TIER_LABEL: Record<string, string> = {
  rising: '📈 Rising', hot: '🔥 Hot', legendary: '★ Legendary', pantheon: '👑 Pantheon',
}

interface Props {
  item: UnifiedMemeItem
  address: string
  onOpen: (item: UnifiedMemeItem) => void
}

export function FeedCard({ item, address, onOpen }: Props) {
  const [imgAspect, setImgAspect] = useState<number | null>(null)
  const dwellStart = useRef(Date.now())

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setImgAspect(img.naturalWidth / img.naturalHeight)
    }
  }

  const badge = SOURCE_BADGE[item.type]
  const tier  = item.tier ?? 'fresh'

  return (
    <div className="fc-root">
      <div
        className="fc-card"
        style={imgAspect ? { aspectRatio: String(imgAspect) } : undefined}
      >

        {/* ── Image ── */}
        <div className="fc-img-wrap" onClick={() => {
          trackFeedAction(address, item.sourceId, item.type, 'detail', Date.now() - dwellStart.current)
          onOpen(item)
        }}>
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            className="fc-img"
            draggable={false}
            onLoad={onImgLoad}
          />
        </div>

        {/* ── Footer ── */}
        <div className="fc-footer">
          <div className="fc-info-row">
            <span className={`fc-source-badge gallery-badge ${badge.cls}`}>{badge.label}</span>
            <span className="fc-title">{item.title}</span>
          </div>
          <div className="fc-actions">
            {tier !== 'fresh' && TIER_CHIP[tier] && (
              <span className={TIER_CHIP[tier]}>{TIER_LABEL[tier]}</span>
            )}
            <span className="fc-creator">{item.meta}</span>
            <span className="fc-spacer" />
            <span className="fc-date">
              {new Date(item.dateIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button
              className="fc-share-btn"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href).catch(() => {})
                trackFeedAction(address, item.sourceId, item.type, 'share')
              }}
              title="Share"
            >↗</button>
          </div>
        </div>

      </div>
    </div>
  )
}
