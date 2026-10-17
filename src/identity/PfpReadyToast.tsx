// "Your profile picture is ready": shown when the PFP finishes while the member is elsewhere in the
// suite (they entered before it was done). The reveal screen celebrates it itself when it's open.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdentity } from './IdentityProvider'
import { displayName } from './archetypes'
import { Confetti } from '../components/Confetti'
import './reveal.css'

const SHOW_MS = 9000

export function PfpReadyToast() {
  const { profile, joinOpen } = useIdentity()
  const navigate = useNavigate()
  const [shown, setShown] = useState<{ url: string; name: string } | null>(null)
  const wasWorking = useRef(false)

  const working = !!profile && (profile.avatar.status === 'generating' || profile.portrait.status === 'generating'
    || (profile.avatar.status === 'ready' && profile.portrait.status === 'none'))

  useEffect(() => {
    if (working) { wasWorking.current = true; return }
    if (!wasWorking.current || !profile) return
    wasWorking.current = false
    if (profile.portrait.status === 'ready' && profile.portrait.url && !joinOpen) {
      setShown({ url: profile.portrait.url, name: displayName(profile) })
    }
  }, [working, profile, joinOpen])

  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(t)
  }, [shown])

  if (!shown) return null
  return (
    <>
      <Confetti pieces={90} />
      <button className="rv-toast" onClick={() => { setShown(null); navigate('/profile') }} aria-live="polite">
        <img src={shown.url} alt="" />
        <span className="rv-toast-text">
          <b>Your profile picture is ready</b>
          <span>{shown.name} · see your profile →</span>
        </span>
        <span className="rv-toast-x" onClick={e => { e.stopPropagation(); setShown(null) }} aria-label="Dismiss">✕</span>
      </button>
    </>
  )
}
