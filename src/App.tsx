import { useState, useEffect } from 'react'
import {
  disconnectWallet, tryAutoConnect, truncateAddress,
  detectWallets, connectWalletByType,
  type WalletType, type WalletInfo,
} from '@mf/wallet'
import { Live } from './views/Live'
import { Memes } from './views/Memes'
import { Vote } from './views/Vote'
import { Characters } from './views/Characters'
import { Quiz } from './views/Quiz'
import { Profile } from './views/Profile'
import { loadProfile, type UserProfile } from './lib/quizLog'

type View = 'live' | 'memes' | 'vote' | 'characters' | 'quiz' | 'profile'

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

export default function App() {
  const [address, setAddress]   = useState<string | null>(null)
  const [view, setView]         = useState<View>('live')
  const [profile, setProfile]   = useState<UserProfile | null>(null)

  useEffect(() => {
    tryAutoConnect().then((addr) => { if (addr) setAddress(addr) })
  }, [])

  useEffect(() => {
    if (!address) { setProfile(null); return }
    loadProfile(address).then(p => { if (p) setProfile(p) })
  }, [address])

  if (!address) return <WalletGate onConnect={setAddress} />

  const handleDisconnect = async () => {
    await disconnectWallet()
    setAddress(null)
    setProfile(null)
  }

  const avatar = profile?.portraitDataUrl ?? (profile ? `/assets/chars/${profile.character}.png` : null)

  return (
    <div className="suite-shell">
      <nav className="suite-nav">
        <img src="/assets/logo.png" alt="Virgin VS Chad" className="suite-nav-brand" />
        <div className="suite-nav-links">
          {([
            { id: 'live',       icon: '◉', label: 'LIVE'      },
            { id: 'memes',      icon: '🎭', label: 'MEMES'     },
            { id: 'vote',       icon: '🗳', label: 'VOTE'      },
            { id: 'characters', icon: '⚡', label: 'ROSTER'    },
            { id: 'quiz',       icon: '◈', label: 'ORACLE'    },
          ] as { id: View; icon: string; label: string }[]).map(({ id, icon, label }) => (
            <button
              key={id}
              className={`suite-nav-item ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="suite-nav-footer">
          <button
            className={`suite-nav-profile-btn ${view === 'profile' ? 'active' : ''}`}
            onClick={() => setView('profile')}
            title="My Profile"
          >
            {avatar
              ? <img src={avatar} alt="profile" className="suite-nav-avatar" />
              : <span className="suite-nav-avatar-placeholder">?</span>
            }
            <span className="suite-nav-wallet-label">{truncateAddress(address)}</span>
          </button>
          <button className="suite-nav-disconnect" onClick={handleDisconnect}>Disconnect</button>
        </div>
      </nav>
      <main className="suite-content">
        {view === 'live'       && <Live       address={address} />}
        {view === 'memes'      && <Memes      address={address} />}
        {view === 'vote'       && <Vote       address={address} />}
        {view === 'characters' && <Characters />}
        {view === 'quiz'       && <Quiz address={address} onProfileUpdate={p => { setProfile(p); }} />}
        {view === 'profile'    && <Profile address={address} profile={profile} onGoToOracle={() => setView('quiz')} />}
      </main>
    </div>
  )
}
