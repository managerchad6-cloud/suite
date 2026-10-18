// The profile header card, shared by your own profile and everyone else's, laid out like a social
// profile: a banner across the top (their generated banner, or a wash of their art), the round PFP
// over its edge with the page's actions beside it, then who they are; their full character sits in a
// panel that rises into the banner and leans toward the pointer like a collectible card.
// Each page passes its own actions, stats and meta; the card owns the layout, the tilt and the lightbox.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTilt } from './ProfileShowcase'
import './ProfileXCard.css'

interface Props {
  accent: string
  /** The full character (or the stock art until it's painted) */
  art: string
  /** The round profile picture */
  pfp: string
  name: string
  /** Generated banner; without one, a blurred wash of the art */
  bannerUrl?: string | null
  /** A new banner is being painted (sweep over the current one) */
  bannerPainting?: boolean
  /** Over the banner's top-right corner (generate / refund buttons) */
  bannerTools?: ReactNode
  /** A new PFP is being framed (ring spins) */
  pfpBusy?: boolean
  /** Next to the PFP: follow/message, or your own buttons */
  actions?: ReactNode
  /** Under the name: @handle, archetype, rarity */
  handle?: ReactNode
  /** The count row (followers, following, …) */
  stats?: ReactNode
  bio?: string | null
  tagline?: string | null
  /** The small row under the bio (joined, side, …) */
  meta?: ReactNode
  /** Anything after the meta row (traits, the spectrum meter) */
  children?: ReactNode
  /** The full character is being painted */
  artPainting?: boolean
  /** Over the character panel (e.g. a retry button when the art failed) */
  artOverlay?: ReactNode
}

export function ProfileXCard({
  accent, art, pfp, name, bannerUrl, bannerPainting, bannerTools, pfpBusy, actions, handle, stats,
  bio, tagline, meta, children, artPainting, artOverlay,
}: Props) {
  const [lightbox, setLightbox] = useState(false)
  const tilt = useTilt<HTMLButtonElement>(0.6)

  return (
    <div className="pc-x-wrap">
      <section className="pc-x" style={{ '--pp-accent': accent } as CSSProperties}>
        <div className={`pc-x-banner${bannerUrl ? ' pc-x-banner--made' : ''}${bannerPainting ? ' pc-x-banner--painting' : ''}`}>
          {bannerUrl
            ? <img className="pc-x-banner-img" src={bannerUrl} alt="" />
            : <div className="pc-x-banner-bg" style={{ backgroundImage: `url("${art}")` }} aria-hidden />}
          {bannerTools && <div className="pc-x-banner-tools">{bannerTools}</div>}
        </div>

        <div className="pc-x-body">
          <div className="pc-x-main">
            <div className="pc-x-bar">
              <div className={`pc-x-avatar${pfpBusy ? ' pc-x-avatar--busy' : ''}`}>
                <img src={pfp} alt={`${name}'s profile picture`} />
              </div>
              {actions && <div className="pc-x-actions">{actions}</div>}
            </div>

            <div className="pc-x-id">
              <h1 className="pc-x-name">{name}</h1>
              {handle && <div className="pc-x-handle">{handle}</div>}
              {stats && <div className="pc-x-stats">{stats}</div>}
              {bio && <p className="pc-x-bio">{bio}</p>}
              {tagline && <p className="pc-x-tagline">“{tagline}”</p>}
              {meta && <div className="pc-x-meta">{meta}</div>}
              {children}
            </div>
          </div>

          <button {...tilt} className={`pc-x-side${artPainting ? ' pc-x-side--sketch' : ''}`} onClick={() => setLightbox(true)}
            title={`View ${name}'s full character`}>
            <img src={art} alt={`${name}, full character`} />
            {artOverlay}
            <span className="pc-x-side-hint">View full art ⤢</span>
            <span className="pc-x-side-shine" aria-hidden />
          </button>
        </div>
      </section>

      {lightbox && (
        <div className="pc-lightbox" onClick={() => setLightbox(false)} role="dialog" aria-label={`${name}, full character`}>
          <img src={art} alt="" />
          <span>Click anywhere to close</span>
        </div>
      )}
    </div>
  )
}
