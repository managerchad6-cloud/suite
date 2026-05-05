import { useState, useEffect } from 'react'
import { connectWallet, disconnectWallet, tryAutoConnect, isPhantomInstalled, truncateAddress } from '@mf/wallet'
import { Live } from './views/Live'
import { Memes } from './views/Memes'
import { Vote } from './views/Vote'

type View = 'live' | 'memes' | 'vote'

function WalletGate({ onConnect }: { onConnect: (addr: string) => void }) {
  const [connecting, setConnecting] = useState(false)
  const phantom = isPhantomInstalled()

  const handleConnect = async () => {
    if (!phantom) {
      window.open('https://phantom.app/', '_blank', 'noopener')
      return
    }
    setConnecting(true)
    try {
      const addr = await connectWallet()
      onConnect(addr)
    } catch { /* rejected */ } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="suite-gate">
      <div className="suite-gate-inner">
        <div className="suite-gate-logo">$VVC SUITE</div>
        <div className="suite-gate-sub">The Virgin vs Chad Command Center</div>
        <button className="suite-gate-btn" onClick={handleConnect} disabled={connecting}>
          {connecting ? 'Connecting…' : phantom ? 'Connect Phantom' : 'Install Phantom →'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [address, setAddress] = useState<string | null>(null)
  const [view, setView] = useState<View>('live')

  useEffect(() => {
    tryAutoConnect().then((addr) => { if (addr) setAddress(addr) })
  }, [])

  if (!address) return <WalletGate onConnect={setAddress} />

  const handleDisconnect = async () => {
    await disconnectWallet()
    setAddress(null)
  }

  return (
    <div className="suite-shell">
      <nav className="suite-nav">
        <div className="suite-nav-brand">$VVC</div>
        <div className="suite-nav-links">
          {([
            { id: 'live',  icon: '◉', label: 'LIVE'  },
            { id: 'memes', icon: '🎭', label: 'MEMES' },
            { id: 'vote',  icon: '🗳', label: 'VOTE'  },
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
          <div className="suite-nav-wallet">{truncateAddress(address)}</div>
          <button className="suite-nav-disconnect" onClick={handleDisconnect}>Disconnect</button>
        </div>
      </nav>
      <main className="suite-content">
        {view === 'live'  && <Live  address={address} />}
        {view === 'memes' && <Memes address={address} />}
        {view === 'vote'  && <Vote  address={address} />}
      </main>
    </div>
  )
}
