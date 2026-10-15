import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHARACTERS } from '../data/characterLore'
import { truncateAddress } from '../wallet'
import './UserChip.css'

type ChipProfile = { character: string } | null

// Module-level portrait override — set once by App when the user's own profile loads.
// Lets any chip showing the logged-in user's wallet fall back to their local data URL
// while server portraits are still being synced.
const _portraitOverride = new Map<string, string>()
export function primePortraitCache(wallet: string, dataUrl: string) {
  _portraitOverride.set(wallet.toLowerCase(), dataUrl)
}

const _cache = new Map<string, Promise<ChipProfile>>()
function fetchChipProfile(wallet: string): Promise<ChipProfile> {
  if (!_cache.has(wallet)) {
    _cache.set(
      wallet,
      fetch(`/profiles/${encodeURIComponent(wallet)}`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    )
  }
  return _cache.get(wallet)!
}

function charStockSrc(character: string): string {
  const cd = CHARACTERS.find(c => c.key === character)
  return cd ? `/assets/chars/${cd.file}.${cd.ext}` : `/assets/chars/${character}.png`
}

interface UserChipProps {
  wallet: string
  size?: 'sm' | 'md'
  className?: string
}

export function UserChip({ wallet, size = 'sm', className = '' }: UserChipProps) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ChipProfile | undefined>(undefined)
  const [imgFailed, setImgFailed] = useState(false)
  const profileRef = useRef<ChipProfile | undefined>(undefined)

  useEffect(() => {
    if (wallet === 'VVCAdmin') return
    fetchChipProfile(wallet).then(p => {
      profileRef.current = p
      setProfile(p)
    })
  }, [wallet])

  if (wallet === 'VVCAdmin') {
    return <span className={`user-chip user-chip--admin ${className}`}>★ Admin</span>
  }

  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget

    // First failure: /portrait not found — try /portrait/full
    if (!img.dataset.triedFull) {
      img.dataset.triedFull = '1'
      img.onerror = () => {
        // Second failure: /portrait/full not found.
        // Try local portrait data (own profile only) — check both the in-session
        // cache and localStorage directly (reliable on page reload).
        const fromCache = _portraitOverride.get(wallet.toLowerCase())
        if (fromCache) {
          img.onerror = () => setImgFailed(true)
          img.src = fromCache
          return
        }
        try {
          const raw = localStorage.getItem(`vvc_profile_${wallet}`)
          if (raw) {
            const lp = JSON.parse(raw) as Record<string, string>
            const localSrc = lp.portraitDataUrl ?? lp.characterImageDataUrl
            if (localSrc) {
              img.onerror = () => setImgFailed(true)
              img.src = localSrc
              return
            }
          }
        } catch {}
        // Final fallback: character stock image
        const tryStock = (character: string | undefined) => {
          if (character) {
            img.onerror = () => setImgFailed(true)
            img.src = charStockSrc(character)
          } else {
            setImgFailed(true)
          }
        }
        const p = profileRef.current
        if (p === undefined) {
          setTimeout(() => tryStock(profileRef.current?.character ?? undefined), 400)
        } else {
          tryStock(p?.character ?? undefined)
        }
      }
      img.src = `/profiles/${encodeURIComponent(wallet)}/portrait/full`
      return
    }
  }

  return (
    <button
      className={`user-chip user-chip--${size} ${className}`}
      onClick={e => {
        e.stopPropagation()
        e.preventDefault()
        navigate(`/u/${encodeURIComponent(wallet)}`)
      }}
      title={wallet}
    >
      <span className="uc-av">
        {profile === undefined ? (
          <span className="uc-av-pulse" />
        ) : !imgFailed ? (
          <img
            src={`/profiles/${encodeURIComponent(wallet)}/portrait`}
            alt=""
            className="uc-av-img"
            onError={handleImgError}
          />
        ) : (
          <span className="uc-av-fb">{wallet.slice(0, 2).toUpperCase()}</span>
        )}
      </span>
      <span className="uc-label">{truncateAddress(wallet)}</span>
    </button>
  )
}
