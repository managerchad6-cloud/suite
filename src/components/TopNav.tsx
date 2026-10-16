import { useEffect, useRef, useState } from 'react'
import { type Location } from 'react-router-dom'
import { truncateAddress } from '@mf/wallet'
import { NotificationBell } from './NotificationPanel'
import { CreditBalance } from './CreditBalance'
import { BuyVvcButton } from './BuyVvc'
import { GlobalSearch } from './GlobalSearch'
import type { PlayerState } from '../api/player'
import { useIdentity } from '../identity/IdentityProvider'
import { profileImage } from '../identity/api'
import './TopNav.css'

const NAV_H = 54

interface NavItem {
  path: string
  icon: string
  label: string
  zadTarget: string
}

interface Props {
  playerState: PlayerState | null
  location: Location
  navItems: readonly NavItem[]
  navigate: (path: string) => void
  onOpenChat: (wallet?: string) => void
  onOpenMessages: (rect: DOMRect) => void
}

export function TopNav({
  playerState, location, navItems, navigate, onOpenChat, onOpenMessages,
}: Props) {
  const { status, memberWallet, profile, join, signOut } = useIdentity()
  const avatar = profile ? profileImage(profile) : null
  const [visible, setVisible] = useState(true)
  const lastY = useRef(0)

  useEffect(() => {
    const shell = document.querySelector('.suite-shell--top')
    shell?.classList.toggle('nav-hidden', !visible)
  }, [visible])

  useEffect(() => {
    // Standard scroll (most pages)
    const content = document.querySelector('.suite-content') as HTMLElement | null
    const onScroll = () => {
      if (!content) return
      const y = content.scrollTop
      if (y < NAV_H) {
        setVisible(true)
      } else if (y > lastY.current + 2) {
        setVisible(false)
      } else if (y < lastY.current - 5) {
        setVisible(true)
      }
      lastY.current = y
    }

    // Feed intercepts wheel/touch and never scrolls the container —
    // it fires this event instead so we can still react.
    const onFeedAdvance = (e: Event) => {
      const dir = (e as CustomEvent<number>).detail
      if (dir > 0) setVisible(false)
      else         setVisible(true)
    }

    content?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('vvc:feed-advance', onFeedAdvance)
    return () => {
      content?.removeEventListener('scroll', onScroll)
      window.removeEventListener('vvc:feed-advance', onFeedAdvance)
    }
  }, [])

  return (
    <header className={`topnav${visible ? '' : ' topnav--hidden'}`} style={{ '--topnav-h': `${NAV_H}px` } as React.CSSProperties}>
      <div className="topnav-inner">

        {/* Logo */}
        <button className="topnav-logo" onClick={() => navigate('/memes')} aria-label="Home">
          <img src="/assets/logo.png" alt="Virgin VS Chad" />
        </button>

        {/* Nav items */}
        <nav className="topnav-links">
          {navItems.map(({ path, icon, label, zadTarget }) => (
            <button
              key={path}
              className={`topnav-item${location.pathname.startsWith(path) ? ' active' : ''}`}
              data-zad-target={zadTarget}
              onClick={() => navigate(path)}
            >
              <span className="topnav-item-icon">{icon}</span>
              <span className="topnav-item-label">{label}</span>
            </button>
          ))}
        </nav>

        {/* Right controls */}
        <div className="topnav-right">
          <GlobalSearch navigate={navigate} />
          <a
            className="topnav-website"
            href="https://virginvschad.vip"
            target="_blank"
            rel="noopener noreferrer"
          >
            🌐
          </a>

          {status === 'member' && memberWallet ? (
            <>
              <button
                className={`topnav-profile${location.pathname === '/profile' ? ' active' : ''}`}
                onClick={() => navigate('/profile')}
                title="My Profile"
              >
                {avatar
                  ? <img src={avatar} alt="profile" className="topnav-avatar" />
                  : <span className="topnav-avatar-placeholder">?</span>}
                <div className="topnav-profile-info">
                  <span className="topnav-wallet">{truncateAddress(memberWallet)}</span>
                  {playerState && (
                    <span className="topnav-xp">⚡ {(playerState.total_xp ?? 0).toLocaleString()} XP</span>
                  )}
                </div>
              </button>

              <BuyVvcButton />
              <div data-zad-target="credits" style={{ display: 'contents' }}>
                <CreditBalance />
              </div>

              <NotificationBell onNavigate={navigate} onOpenChat={onOpenChat} onOpenMessages={onOpenMessages} />

              <button className="topnav-disconnect" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <BuyVvcButton />
              <button className="suite-nav-join topnav-join" onClick={() => join()}>
                {status === 'pending' ? 'Finish joining' : 'Join'}
              </button>
              {status === 'pending' && <button className="topnav-disconnect" onClick={signOut}>Sign out</button>}
            </>
          )}
        </div>
      </div>
    </header>
  )
}
