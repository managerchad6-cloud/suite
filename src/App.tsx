import { useState, useEffect, useCallback } from 'react'
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
import { MemeStudio } from './views/MemeStudio'
import { Gallery } from './views/Gallery'
import { Feed } from './views/Feed'
import { Brackets } from './views/Brackets'
import { UnifiedMemeDetail } from './views/UnifiedMemeDetail'
import { MemeDetail } from './views/MemeDetail'
import { PublicProfile } from './views/PublicProfile'
import { RankBadge } from './components/RankBadge'
import { RankUpModal } from './components/RankUpModal'
import { NotificationBell } from './components/NotificationPanel'
import { CreditBalance } from './components/CreditBalance'
import { loadProfile, type UserProfile } from './lib/quizLog'
import { fetchPlayer, recordLogin, type PlayerState } from './api/player'
import type { Meme } from './api/memes'
import type { UnifiedMemeItem } from './types/unified'

type View = 'live' | 'memes' | 'factory' | 'vote' | 'characters' | 'quiz' | 'profile' | 'prizes' | 'studio' | 'brackets'

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
  const [address,       setAddress]       = useState<string | null>(null)
  const [view,          setView]          = useState<View>('live')
  const [profile,       setProfile]       = useState<UserProfile | null | undefined>(undefined)
  const [playerState,   setPlayerState]   = useState<PlayerState | null>(null)
  const [rankUp,        setRankUp]        = useState<{ from: string; to: string; direction: string } | null>(null)
  const [unifiedDetail, setUnifiedDetail] = useState<UnifiedMemeItem | null>(null)
  const [detailMeme,    setDetailMeme]    = useState<Meme | null>(null)
  const [charTarget,    setCharTarget]    = useState<string | null>(null)
  const [profileTarget, setProfileTarget] = useState<string | null>(null)

  const refreshPlayer = useCallback(async (addr: string) => {
    try { setPlayerState(await fetchPlayer(addr)) } catch {}
  }, [])

  const handleRankUp = useCallback((from: string, to: string, direction: string) => {
    setRankUp({ from, to, direction })
  }, [])

  useEffect(() => {
    tryAutoConnect().then((addr) => { if (addr) setAddress(addr) })
  }, [])

  useEffect(() => {
    if (!address) { setProfile(null); setPlayerState(null); return }
    setProfile(undefined)
    loadProfile(address).then(p => setProfile(p ?? null))
    refreshPlayer(address)
    // Record daily login and handle rank-up
    recordLogin(address).then(r => {
      if (r.ranked_up && r.rank) {
        const prev = playerState?.current_rank ?? 'basic'
        handleRankUp(prev, r.rank, playerState?.rank_direction ?? 'neutral')
      }
      refreshPlayer(address)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  if (!address) return <WalletGate onConnect={setAddress} />
  if (profile === undefined) return null
  if (profile === null) return (
    <div style={{ height: '100vh', overflow: 'auto' }}>
      <Quiz address={address} onProfileUpdate={p => setProfile(p)} />
    </div>
  )

  const handleDisconnect = async () => {
    await disconnectWallet()
    setAddress(null)
    setProfile(null)
  }

  const userProfile = profile as NonNullable<typeof profile>
  const avatar = userProfile.portraitDataUrl ?? `/assets/chars/${userProfile.character}.png`

  // When Studio publishes, open the new meme in unified detail
  function handlePublished(id: string) {
    setUnifiedDetail({
      key: `studio:${id}`, type: 'studio',
      imageUrl: `/handmade/${id}/image`,
      title: '', meta: '', dateIso: new Date().toISOString(),
      sourceId: id,
    })
    setView('memes')
  }

  return (
    <div className="suite-shell">
      {rankUp && (
        <RankUpModal
          from={rankUp.from}
          to={rankUp.to}
          direction={rankUp.direction}
          onClose={() => setRankUp(null)}
        />
      )}
      <nav className="suite-nav">
        <img src="/assets/logo.png" alt="Virgin VS Chad" className="suite-nav-brand" />
        <div className="suite-nav-links">
          {([
            { id: 'live',       icon: '◉', label: 'LIVE'      },
            { id: 'memes',      icon: '🖼', label: 'MEMES'     },
            { id: 'vote',       icon: '🗳', label: 'VOTE'      },
            { id: 'characters', icon: '⚡', label: 'ROSTER'    },
            { id: 'prizes',     icon: '🏆', label: 'PRIZES'    },
            { id: 'studio',     icon: '🖌', label: 'STUDIO'    },
            { id: 'factory',    icon: '🎭', label: 'FACTORY'   },
            { id: 'brackets',   icon: '🏆', label: 'BRACKETS'  },
          ] as { id: View; icon: string; label: string }[]).map(({ id, icon, label }) => (
            <button
              key={id}
              className={`suite-nav-item ${view === id ? 'active' : ''}`}
              onClick={() => {
                setView(id)
                setUnifiedDetail(null)
                if (id !== 'characters') setCharTarget(null)
              }}
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
            <div className="suite-nav-profile-info">
              <span className="suite-nav-wallet-label">{truncateAddress(address)}</span>
              {playerState && (
                <RankBadge rank={playerState.current_rank} size="xs" />
              )}
            </div>
          </button>
          <CreditBalance wallet={address} />
          <NotificationBell wallet={address} />
          <button className="suite-nav-disconnect" onClick={handleDisconnect}>Disconnect</button>
        </div>
      </nav>
      <main className="suite-content">
        {unifiedDetail ? (
          <UnifiedMemeDetail
            item={unifiedDetail}
            address={address}
            onBack={() => setUnifiedDetail(null)}
          />
        ) : detailMeme ? (
          <MemeDetail
            meme={detailMeme}
            address={address}
            onBack={() => setDetailMeme(null)}
            onNavigate={setDetailMeme}
            onOpenCharacter={(name) => { setDetailMeme(null); setView('characters'); setCharTarget(name) }}
            onOpenProfile={(w) => { setDetailMeme(null); setProfileTarget(w) }}
          />
        ) : profileTarget && profileTarget === address ? (
          (() => { setView('profile'); setProfileTarget(null); return null })()
        ) : profileTarget ? (
          <PublicProfile
            wallet={profileTarget}
            onBack={() => setProfileTarget(null)}
            onOpenDetail={(m) => { setProfileTarget(null); setDetailMeme(m) }}
          />
        ) : (
          <>
            {view === 'live'       && <Live address={address} />}
            {view === 'memes'      && <Feed address={address} onOpenItem={setUnifiedDetail} onOpenProfile={w => setProfileTarget(w)} />}
            {view === 'factory'    && <Memes address={address} onOpenDetail={setDetailMeme} onOpenProfile={(w) => setProfileTarget(w)} />}
            {view === 'vote'       && <Vote address={address} />}
            {view === 'characters' && <Characters onOpenDetail={setDetailMeme} initialChar={charTarget} address={address} />}
            {view === 'quiz'       && <Quiz address={address} onProfileUpdate={p => { setProfile(p) }} />}
            {view === 'brackets'   && <Brackets address={address} />}
            {view === 'prizes'     && <div className="placeholder-view"><span>Prizes</span><p>Coming soon.</p></div>}
            {view === 'studio'     && <MemeStudio address={address} onPublished={handlePublished} />}
            {view === 'profile'    && <Profile address={address} profile={userProfile} onGoToOracle={() => setView('quiz')} onOpenDetail={setDetailMeme} />}
          </>
        )}
      </main>
    </div>
  )
}
