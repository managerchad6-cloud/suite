// Who is looking at the suite: guest, signed in but not yet a member (pending), or member.
// The server decides (GET /api/identity/me); nothing about identity is kept in the browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { JOIN_REQUIRED_EVENT, SIGNED_OUT_EVENT } from '../api/client'
import { getMe, logout, type Me, type Profile, type State } from './api'

export interface IdentityValue {
  /** 'loading' only until the first /me answers */
  status: 'loading' | State
  me: Me | null
  /** Signed-in wallet (pending or member) */
  wallet: string | null
  /** Wallet only when the visitor is a member: what participation is allowed for */
  memberWallet: string | null
  profile: Profile | null
  /** Re-read /me (after anything that may have changed the account) */
  refresh: () => Promise<void>
  /** Use an identity response that already carries the new /me */
  setMe: (me: Me) => void
  /** Open the Join flow. `reason` finishes "Join to …", e.g. "vote". */
  join: (reason?: string) => void
  closeJoin: () => void
  joinOpen: boolean
  joinReason: string | null
  signOut: () => Promise<void>
}

const IdentityContext = createContext<IdentityValue | null>(null)

const POLL_MS = 4000

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinReason, setJoinReason] = useState<string | null>(null)
  const latest = useRef(0)

  // Responses can overlap (poll + action): only the newest request may win
  const refresh = useCallback(async () => {
    const id = ++latest.current
    try {
      const next = await getMe()
      if (id === latest.current) setMeState(next)
    } catch {
      // Identity unreachable: keep what we have; a first load falls back to guest
      if (id === latest.current) setMeState(prev => prev ?? { state: 'guest' })
    }
  }, [])

  const setMe = useCallback((next: Me) => { latest.current++; setMeState(next) }, [])

  useEffect(() => { refresh() }, [refresh])

  // Signed out elsewhere / session over, or a service said "members only"
  useEffect(() => {
    const onSignedOut = () => { refresh() }
    const onJoin = (e: Event) => {
      setJoinReason((e as CustomEvent<{ reason: string | null }>).detail?.reason ?? null)
      setJoinOpen(true)
    }
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    window.addEventListener(JOIN_REQUIRED_EVENT, onJoin)
    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
      window.removeEventListener(JOIN_REQUIRED_EVENT, onJoin)
    }
  }, [refresh])

  const profile = me && me.state !== 'guest' ? me.account.profile : null

  // Images are generated in the background: keep /me fresh until they settle
  const generating = profile?.avatar.status === 'generating' || profile?.portrait.status === 'generating' || profile?.banner?.status === 'generating'
  useEffect(() => {
    if (!generating) return
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [generating, refresh])

  const signOut = useCallback(async () => {
    try { await logout() } finally { setMe({ state: 'guest' }) }
  }, [setMe])

  const value = useMemo<IdentityValue>(() => {
    const wallet = me && me.state !== 'guest' ? me.wallet : null
    return {
      status: me ? me.state : 'loading',
      me,
      wallet,
      memberWallet: me?.state === 'member' ? wallet : null,
      profile,
      refresh,
      setMe,
      join: (reason?: string) => { setJoinReason(reason ?? null); setJoinOpen(true) },
      closeJoin: () => setJoinOpen(false),
      joinOpen,
      joinReason,
      signOut,
    }
  }, [me, profile, refresh, setMe, joinOpen, joinReason, signOut])

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export function useIdentity(): IdentityValue {
  const v = useContext(IdentityContext)
  if (!v) throw new Error('useIdentity must be used inside <IdentityProvider>')
  return v
}
