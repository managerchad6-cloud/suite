import { useState, useEffect, useCallback } from 'react'
import { tryAutoConnect, truncateAddress } from '@mf/wallet'
import { Live } from './views/Live'
import { Memes } from './views/Memes'
import { Vote } from './views/Vote'
import { Characters } from './views/Characters'
import { Profile } from './views/Profile'
import { MemeStudio } from './views/MemeStudio'
import { Feed } from './views/Feed'
import { Brackets } from './views/Brackets'
import { UnifiedMemeDetail } from './views/UnifiedMemeDetail'
import { MemeDetail } from './views/MemeDetail'
import { PublicProfile } from './views/PublicProfile'
import { RankBadge } from './components/RankBadge'
import { RankUpModal } from './components/RankUpModal'
import { NotificationBell } from './components/NotificationPanel'
import { CreditBalance } from './components/CreditBalance'
import { fetchPlayer, recordLogin, type PlayerState } from './api/player'
import type { Meme } from './api/memes'
import type { UnifiedMemeItem } from './types/unified'
import { useIdentity } from './identity/IdentityProvider'
import { JoinFlow } from './identity/JoinFlow'
import { RetakeView } from './identity/RetakeView'
import { profileImage } from './identity/api'

type View = 'live' | 'memes' | 'factory' | 'vote' | 'characters' | 'quiz' | 'profile' | 'prizes' | 'studio' | 'brackets'

// Deep links from other VVC sites, e.g. the viewer's "Vote in the VVC Suite" → ?view=vote
const PUBLIC_VIEWS: View[] = ['live', 'memes', 'factory', 'vote', 'characters', 'prizes', 'studio', 'brackets']
function initialView(): View {
  const v = new URLSearchParams(window.location.search).get('view') as View | null
  return v && PUBLIC_VIEWS.includes(v) ? v : 'live'
}

function NavIdentity({ playerState, onOpenProfile, active }: {
  playerState: PlayerState | null
  onOpenProfile: () => void
  active: boolean
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
          {playerState && <RankBadge rank={playerState.current_rank} size="xs" />}
        </div>
      </button>
      <CreditBalance />
      <NotificationBell />
      <button className="suite-nav-disconnect" onClick={signOut}>Sign out</button>
    </>
  )
}

export default function App() {
  const { status, wallet, memberWallet } = useIdentity()
  const [view,          setView]          = useState<View>(initialView)
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

  // Payments still sign through the legacy wallet module: reattach a trusted provider quietly
  useEffect(() => { if (wallet) tryAutoConnect().catch(() => {}) }, [wallet])

  useEffect(() => {
    if (!memberWallet) { setPlayerState(null); return }
    refreshPlayer(memberWallet)
    // Record daily login and handle rank-up
    recordLogin().then(r => {
      if (r.ranked_up && r.rank) {
        const prev = playerState?.current_rank ?? 'basic'
        handleRankUp(prev, r.rank, playerState?.rank_direction ?? 'neutral')
      }
      refreshPlayer(memberWallet)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberWallet])

  // Signing out while on a member-only page: back to something everyone can see
  useEffect(() => {
    if (status !== 'member' && (view === 'profile' || view === 'quiz')) setView('live')
  }, [status, view])

  if (status === 'loading') return null

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

  const isMember = status === 'member'

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
          <NavIdentity playerState={playerState} active={view === 'profile'} onOpenProfile={() => setView('profile')} />
        </div>
      </nav>

      <main className="suite-content">
        {unifiedDetail ? (
          <UnifiedMemeDetail
            item={unifiedDetail}
            onBack={() => setUnifiedDetail(null)}
          />
        ) : detailMeme ? (
          <MemeDetail
            meme={detailMeme}
            onBack={() => setDetailMeme(null)}
            onNavigate={setDetailMeme}
            onOpenCharacter={(name) => { setDetailMeme(null); setView('characters'); setCharTarget(name) }}
            onOpenProfile={(w) => { setDetailMeme(null); setProfileTarget(w) }}
          />
        ) : profileTarget && profileTarget === memberWallet ? (
          (() => { setView('profile'); setProfileTarget(null); return null })()
        ) : profileTarget ? (
          <PublicProfile
            wallet={profileTarget}
            onBack={() => setProfileTarget(null)}
            onOpenDetail={(m) => { setProfileTarget(null); setDetailMeme(m) }}
          />
        ) : (
          <>
            {/* Every view is open to everyone; participation inside them is locked for non-members */}
            {view === 'live'       && <Live />}
            {view === 'memes'      && <Feed onOpenItem={setUnifiedDetail} onOpenProfile={w => setProfileTarget(w)} />}
            {view === 'factory'    && <Memes onOpenDetail={setDetailMeme} onOpenProfile={(w) => setProfileTarget(w)} />}
            {view === 'vote'       && <Vote />}
            {view === 'characters' && <Characters onOpenDetail={setDetailMeme} initialChar={charTarget} />}
            {view === 'brackets'   && <Brackets />}
            {view === 'prizes'     && <div className="placeholder-view"><span>Prizes</span><p>Coming soon.</p></div>}
            {view === 'studio'     && <MemeStudio onPublished={handlePublished} />}
            {view === 'profile'    && isMember && (
              <Profile onGoToOracle={() => setView('quiz')} onOpenDetail={setDetailMeme} />
            )}
            {view === 'quiz'       && isMember && <RetakeView onDone={() => setView('profile')} />}
          </>
        )}
      </main>

      <JoinFlow />
    </div>
  )
}
