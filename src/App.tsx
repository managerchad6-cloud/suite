import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  disconnectWallet, tryAutoConnect, truncateAddress,
  detectWallets, connectWalletByType,
  type WalletType, type WalletInfo,
} from '@mf/wallet'
import { BadgeUnlockedToast } from './components/BadgeUnlockedToast'
import { JobTrackerPill } from './components/JobTrackerPill'
import ZadHelper from './components/ZadHelper/ZadHelper'
import { NotificationBell } from './components/NotificationPanel'
import { ChatWidget } from './components/ChatWidget'
import { CreditBalance } from './components/CreditBalance'
import { TopNav } from './components/TopNav'
import { loadProfile, ensurePortraitsOnServer, type UserProfile } from './lib/quizLog'
import { primePortraitCache } from './components/UserChip'
import { fetchPlayer, recordLogin, type PlayerState, type BadgeDef } from './api/player'
import { claimSignupBonus } from './api/credits'

const NAV_MODE = (import.meta.env.VITE_NAV_MODE ?? 'side') as 'side' | 'top'

export type AppOutletContext = {
  address: string
  profile: UserProfile | null
  setProfile: (p: UserProfile | null) => void
  playerState: PlayerState | null
  refreshPlayer: () => void
  openChat: (wallet?: string) => void
}

const REEL_L = [
  'gizzard','bad','wraith','grandwizard','witch','wizard',
  'lshad','cad','legbeard','neckbeard','femcel','incel',
  'brad','brandy','virgin',
] as const

const REEL_R = [
  'virgin','becky','basic','veronica','basdchad','stacy',
  'thad','tracy','lad','lacy','shlad','boomer',
  'zad','ogchad','gad',
] as const

function GateReel({ images, dir, side }: {
  images: readonly string[]
  dir: 'up' | 'down'
  side: 'virgin' | 'chad'
}) {
  const doubled = [...images, ...images]
  return (
    <div className={`gate-reel gate-reel--${side}`}>
      <div className={`gate-reel-track gate-reel-track--${dir}`}>
        {doubled.map((name, i) => (
          <img key={i} src={`/assets/chars/${name}.png`} alt={name} className="gate-reel-img" draggable={false} />
        ))}
      </div>
    </div>
  )
}

const WALLET_LETTER: Record<WalletType, string> = {
  phantom: 'P', solflare: 'S', backpack: 'B', rabby: 'R',
}

function WalletGate({ onConnect }: { onConnect: (addr: string) => void }) {
  const [connecting, setConnecting] = useState<WalletType | null>(null)
  const wallets = detectWallets()

  const handle = async (info: WalletInfo) => {
    if (connecting) return
    if (!info.detected) { window.open(info.installUrl, '_blank', 'noopener'); return }
    setConnecting(info.type)
    try {
      const addr = await connectWalletByType(info.type)
      onConnect(addr)
    } catch { /* rejected */ } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="suite-gate">
      <GateReel images={REEL_L} dir="up" side="virgin" />
      <div className="suite-gate-inner">
        <div className="suite-gate-vignette" />
        <img src="/assets/logo.png" alt="Virgin VS Chad" className="suite-gate-logo" />
        <div className="wg-grid">
          {wallets.map(info => (
            <button
              key={info.type}
              className={[
                'wg-btn',
                !info.detected           ? 'wg-btn-uninstalled' : '',
                connecting === info.type ? 'wg-btn-busy'        : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handle(info)}
              disabled={!!connecting}
            >
              <span className={`wg-icon wg-icon-${info.type}`}>{WALLET_LETTER[info.type]}</span>
              <span className="wg-name">{info.name}</span>
              <span className="wg-action">
                {connecting === info.type ? 'Connecting…' : info.detected ? 'Connect' : 'Install →'}
              </span>
              {info.isEvm && <span className="wg-evm-tag">EVM</span>}
            </button>
          ))}
        </div>
        <div className="wg-note">Solana wallets required for meme generation</div>
        <img src="/assets/virgin_back.webp" alt="" className="gate-watcher gate-watcher--virgin" draggable={false} />
        <img src="/assets/chad_back.webp"   alt="" className="gate-watcher gate-watcher--chad"   draggable={false} />
      </div>
      <GateReel images={REEL_R} dir="down" side="chad" />
    </div>
  )
}

const NAV_ITEMS = [
  { path: '/live',    icon: '◉', label: 'LIVE',    zadTarget: 'live'    },
  { path: '/pfp',     icon: '🎯', label: 'PFP',    zadTarget: 'pfp'     },
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

export default function App() {
  const [address,     setAddress]     = useState<string | null>(null)
  const [profile,     setProfile]     = useState<UserProfile | null | undefined>(undefined)
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)
  const [newBadges,   setNewBadges]   = useState<BadgeDef[]>([])
  const [chatOpen,    setChatOpen]    = useState(false)
  const [chatPartner, setChatPartner] = useState<string | null>(null)
  const [chatAnchor,  setChatAnchor]  = useState<DOMRect | null>(null)

  const openChat = useCallback((wallet?: string) => {
    if (wallet) setChatPartner(wallet)
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

  const location = useLocation()
  const navigate = useNavigate()

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
    const handler = () => { if (address) void refreshPlayer(address) }
    window.addEventListener('vvc:xp-awarded', handler)
    return () => window.removeEventListener('vvc:xp-awarded', handler)
  }, [address, refreshPlayer])

  useEffect(() => {
    tryAutoConnect().then((addr) => { if (addr) setAddress(addr) })
  }, [])

  useEffect(() => {
    if (!address) { setProfile(null); setPlayerState(null); return }
    setProfile(undefined)
    loadProfile(address).then(p => {
      setProfile(p ?? null)
      if (p) {
        // Prime the UserChip portrait cache so any chip showing this wallet
        // immediately uses the local data URL while server portraits sync.
        const localPortrait = p.portraitDataUrl ?? p.characterImageDataUrl
        if (localPortrait) primePortraitCache(address, localPortrait)
        // Fire-and-forget: upload portraits to server if not already there.
        ensurePortraitsOnServer(address, p).catch(() => {})
      }
    })
    refreshPlayer(address)
    claimSignupBonus(address).then(r => {
      if (r.granted > 0) window.dispatchEvent(new CustomEvent('vvc:credits-changed'))
    }).catch(() => {})
    recordLogin(address).then(r => {
      pushBadges(r.new_badges)
      refreshPlayer(address)
    })
  }, [address, pushBadges, refreshPlayer])

  const setProfileAndPrime = useCallback((p: UserProfile | null) => {
    setProfile(p)
    const localPortrait = p?.portraitDataUrl ?? p?.characterImageDataUrl
    if (address && localPortrait) primePortraitCache(address, localPortrait)
  }, [address])

  if (!address) return <WalletGate onConnect={setAddress} />
  if (profile === undefined) return null

  const handleDisconnect = async () => {
    await disconnectWallet()
    setAddress(null)
    setProfile(null)
  }

  // Server portrait URL is the source of truth. Pass local data URL as fallback so TopNav
  // can display something while the server syncs or if upload hasn't happened yet.
  const avatarSrc      = `/profiles/${encodeURIComponent(address)}/portrait`
  const avatarFallback = profile?.portraitDataUrl
    ?? profile?.characterImageDataUrl
    ?? (profile?.character ? `/assets/chars/${profile.character}.png` : null)

  const ctx: AppOutletContext = {
    address,
    profile,
    setProfile: setProfileAndPrime,
    playerState,
    refreshPlayer: () => refreshPlayer(address),
    openChat,
  }

  return (
    <div className={`suite-shell${NAV_MODE === 'top' ? ' suite-shell--top' : ''}`}>
      <BadgeUnlockedToast
        badges={newBadges}
        onDismiss={id => setNewBadges(prev => prev.filter(b => b.id !== id))}
      />
      <JobTrackerPill />
      <ZadHelper address={address} />

      {NAV_MODE === 'top' ? (
        <TopNav
          address={address}
          playerState={playerState}
          avatar={avatarSrc}
          avatarFallback={avatarFallback}
          location={location}
          navItems={NAV_ITEMS}
          navigate={navigate}
          onDisconnect={handleDisconnect}
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
            <button
              className={`suite-nav-profile-btn ${location.pathname === '/profile' ? 'active' : ''}`}
              onClick={() => navigate('/profile')}
              title="My Profile"
            >
              {avatarSrc
                ? <img
                    src={avatarSrc}
                    alt="profile"
                    className="suite-nav-avatar"
                    onError={e => {
                      if (avatarFallback) { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback }
                      else e.currentTarget.style.display = 'none'
                    }}
                  />
                : <span className="suite-nav-avatar-placeholder">?</span>
              }
              <div className="suite-nav-profile-info">
                <span className="suite-nav-wallet-label">{truncateAddress(address)}</span>
                {playerState && (
                  <span className="suite-nav-xp">⚡ {(playerState.total_xp ?? 0).toLocaleString()} XP</span>
                )}
              </div>
            </button>
            <div data-zad-target="credits" style={{ display: 'contents' }}>
              <CreditBalance wallet={address} />
            </div>
            <NotificationBell wallet={address} onNavigate={navigate} onOpenChat={openChat} onOpenMessages={openMessages} />
            <button className="suite-nav-disconnect" onClick={handleDisconnect}>Disconnect</button>
          </div>
        </nav>
      )}

      <main className="suite-content">
        <Outlet context={ctx} />
      </main>
      <ChatWidget
        address={address}
        open={chatOpen}
        partner={chatPartner}
        anchorRect={chatAnchor}
        onOpenChange={open => { setChatOpen(open); if (!open) setChatAnchor(null) }}
        onPartnerChange={setChatPartner}
      />
    </div>
  )
}
