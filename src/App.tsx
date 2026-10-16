import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { tryAutoConnect, truncateAddress } from '@mf/wallet'
import { BadgeUnlockedToast } from './components/BadgeUnlockedToast'
import { JobTrackerPill } from './components/JobTrackerPill'
import ZadHelper from './components/ZadHelper/ZadHelper'
import { NotificationBell } from './components/NotificationPanel'
import { ChatWidget } from './components/ChatWidget'
import { CreditBalance } from './components/CreditBalance'
import { TopNav } from './components/TopNav'
import { fetchPlayer, recordLogin, type PlayerState, type BadgeDef } from './api/player'
import { fetchHolderStatus } from './api/credits'
import { BuyVvcButton, BuyVvcHost } from './components/BuyVvc'
import { useIdentity } from './identity/IdentityProvider'
import { JoinFlow } from './identity/JoinFlow'
import { profileImage } from './identity/api'

const NAV_MODE = (import.meta.env.VITE_NAV_MODE ?? 'side') as 'side' | 'top'

// Who you are comes from useIdentity() / useMemberGate(), not from here.
export type AppOutletContext = {
  playerState: PlayerState | null
  refreshPlayer: () => void
  openChat: (wallet?: string) => void
}

export const NAV_ITEMS = [
  { path: '/live',    icon: '◉', label: 'LIVE',    zadTarget: 'live'    },
  { path: '/memes',   icon: '🖼', label: 'MEMES',  zadTarget: 'memes'   },
  { path: '/vote',    icon: '🗳', label: 'VOTE',   zadTarget: 'vote'    },
  { path: '/cast',    icon: '⚡', label: 'CAST',   zadTarget: 'cast'    },
  { path: '/prizes',  icon: '🏆', label: 'PRIZES', zadTarget: 'prizes'  },
  { path: '/treasury',icon: '🏛', label: 'TREASURY',zadTarget: 'treasury' },
  { path: '/studio',  icon: '🖌', label: 'STUDIO', zadTarget: 'studio'  },
  { path: '/factory', icon: '🎭', label: 'FACTORY',zadTarget: 'factory' },
  // VIDEO / VIDEOS hidden — feature not production-ready yet
  { path: '/forum',   icon: '💬', label: 'FORUM',  zadTarget: 'forum'   },
] as const

function NavIdentity({ playerState, active, onOpenProfile, onNavigate, onOpenChat, onOpenMessages }: {
  playerState: PlayerState | null
  active: boolean
  onOpenProfile: () => void
  onNavigate: (path: string) => void
  onOpenChat: (wallet?: string) => void
  onOpenMessages: (rect: DOMRect) => void
}) {
  const { status, wallet, memberWallet, profile, join, signOut } = useIdentity()

  if (status === 'guest') return (
    <>
      <button className="suite-nav-join" onClick={() => join()}>Join</button>
      <p className="suite-nav-join-sub">Look around freely. Join to vote, chat and create.</p>
    </>
  )

  if (status === 'pending') return (
    <>
      <button className="suite-nav-join" onClick={() => join()}>Finish joining</button>
      <p className="suite-nav-join-sub">Signed in as {truncateAddress(wallet!)}. Your interview is saved.</p>
      <button className="suite-nav-disconnect" onClick={signOut}>Sign out</button>
    </>
  )

  if (status !== 'member' || !memberWallet) return null
  const avatar = profile ? profileImage(profile) : null
  return (
    <>
      <button className={`suite-nav-profile-btn ${active ? 'active' : ''}`} onClick={onOpenProfile} title="My Profile">
        {avatar
          ? <img src={avatar} alt="profile" className="suite-nav-avatar" />
          : <span className="suite-nav-avatar-placeholder">?</span>}
        <div className="suite-nav-profile-info">
          <span className="suite-nav-wallet-label">{truncateAddress(memberWallet)}</span>
          {playerState && (
            <span className="suite-nav-xp">⚡ {(playerState.total_xp ?? 0).toLocaleString()} XP</span>
          )}
        </div>
      </button>
      <div data-zad-target="credits" style={{ display: 'contents' }}>
        <CreditBalance />
      </div>
      <NotificationBell onNavigate={onNavigate} onOpenChat={onOpenChat} onOpenMessages={onOpenMessages} />
      <button className="suite-nav-disconnect" onClick={signOut}>Sign out</button>
    </>
  )
}

export default function App() {
  const { status, wallet, memberWallet } = useIdentity()
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)
  const [newBadges,   setNewBadges]   = useState<BadgeDef[]>([])
  const [chatOpen,    setChatOpen]    = useState(false)
  const [chatPartner, setChatPartner] = useState<string | null>(null)
  const [chatAnchor,  setChatAnchor]  = useState<DOMRect | null>(null)

  const location = useLocation()
  const navigate = useNavigate()

  const openChat = useCallback((partner?: string) => {
    if (partner) setChatPartner(partner)
    setChatAnchor(null)   // sidebar mode
    setChatOpen(true)
  }, [])

  const openMessages = useCallback((rect: DOMRect) => {
    // toggle if already open as popup
    if (chatOpen && chatAnchor) { setChatOpen(false); setChatAnchor(null); return }
    setChatPartner(null)
    setChatAnchor(rect)
    setChatOpen(true)
  }, [chatOpen, chatAnchor])

  const refreshPlayer = useCallback(async (addr: string) => {
    try { setPlayerState(await fetchPlayer(addr)) } catch {}
  }, [])

  const pushBadges = useCallback((badges: BadgeDef[] | undefined) => {
    if (badges?.length) setNewBadges(prev => [...prev, ...badges])
  }, [])

  useEffect(() => {
    const handler = (e: Event) => pushBadges((e as CustomEvent<BadgeDef[]>).detail)
    window.addEventListener('vvc:badges-unlocked', handler)
    return () => window.removeEventListener('vvc:badges-unlocked', handler)
  }, [pushBadges])

  useEffect(() => {
    const handler = () => { if (memberWallet) void refreshPlayer(memberWallet) }
    window.addEventListener('vvc:xp-awarded', handler)
    return () => window.removeEventListener('vvc:xp-awarded', handler)
  }, [memberWallet, refreshPlayer])

  // Payments still sign through the legacy wallet module: reattach a trusted provider quietly
  useEffect(() => { if (wallet) tryAutoConnect().catch(() => {}) }, [wallet])

  // A member arrived (signed in, or just finished joining): daily login, holder credits, player stats
  useEffect(() => {
    if (!memberWallet) { setPlayerState(null); setChatOpen(false); return }
    refreshPlayer(memberWallet)
    fetchHolderStatus().catch(() => {})     // $VVC holders: weekly free credits, topped up when due
    recordLogin().then(r => {
      pushBadges(r.new_badges)
      refreshPlayer(memberWallet)
    })
  }, [memberWallet, pushBadges, refreshPlayer])

  if (status === 'loading') return null

  const ctx: AppOutletContext = {
    playerState,
    refreshPlayer: () => { if (memberWallet) void refreshPlayer(memberWallet) },
    openChat,
  }

  return (
    <div className={`suite-shell${NAV_MODE === 'top' ? ' suite-shell--top' : ''}`}>
      <BuyVvcHost />
      <BadgeUnlockedToast
        badges={newBadges}
        onDismiss={id => setNewBadges(prev => prev.filter(b => b.id !== id))}
      />
      <JobTrackerPill />
      <ZadHelper />

      {NAV_MODE === 'top' ? (
        <TopNav
          playerState={playerState}
          location={location}
          navItems={NAV_ITEMS}
          navigate={navigate}
          onOpenChat={openChat}
          onOpenMessages={openMessages}
        />
      ) : (
        <nav className="suite-nav">
          <img src="/assets/logo.png" alt="Virgin VS Chad" className="suite-nav-brand" />
          <div className="suite-nav-links">
            {NAV_ITEMS.map(({ path, icon, label, zadTarget }) => (
              <button
                key={path}
                className={`suite-nav-item ${location.pathname.startsWith(path) ? 'active' : ''}`}
                data-zad-target={zadTarget}
                onClick={() => navigate(path)}
              >
                <span className="nav-icon">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <a
            className="suite-nav-website"
            href="https://virginvschad.vip"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="nav-icon">🌐</span>
            <span>WEBSITE</span>
          </a>
          <div className="suite-nav-footer">
            <BuyVvcButton className="buyvvc-cta--block" />
            <NavIdentity
              playerState={playerState}
              active={location.pathname === '/profile'}
              onOpenProfile={() => navigate('/profile')}
              onNavigate={navigate}
              onOpenChat={openChat}
              onOpenMessages={openMessages}
            />
          </div>
        </nav>
      )}

      <main className="suite-content">
        <Outlet context={ctx} />
      </main>

      {/* Direct messages are between members */}
      {memberWallet && (
        <ChatWidget
          open={chatOpen}
          partner={chatPartner}
          anchorRect={chatAnchor}
          onOpenChange={open => { setChatOpen(open); if (!open) setChatAnchor(null) }}
          onPartnerChange={setChatPartner}
        />
      )}

      <JoinFlow />
    </div>
  )
}
