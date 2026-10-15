import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { truncateAddress } from '../wallet'
import { bestImage, getPublicProfile, type PublicProfile } from '../identity/api'
import './UserChip.css'

interface UserChipProps {
  wallet: string
  size?: 'sm' | 'md'
  className?: string
}

/** A wallet as a clickable chip: the member's portrait (or stock art) + short address. */
export function UserChip({ wallet, size = 'sm', className = '' }: UserChipProps) {
  const navigate = useNavigate()
  // undefined = loading, null = not a member
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    if (wallet === 'VVCAdmin') return
    setImgFailed(false)
    getPublicProfile(wallet).then(setProfile)
  }, [wallet])

  if (wallet === 'VVCAdmin') {
    return <span className={`user-chip user-chip--admin ${className}`}>★ Admin</span>
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
        ) : profile && !imgFailed ? (
          <img src={bestImage(profile)} alt="" className="uc-av-img" onError={() => setImgFailed(true)} />
        ) : (
          <span className="uc-av-fb">{wallet.slice(0, 2).toUpperCase()}</span>
        )}
      </span>
      <span className="uc-label">{truncateAddress(wallet)}</span>
    </button>
  )
}
