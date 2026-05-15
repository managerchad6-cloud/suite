import { useState, useEffect } from 'react'
import {
  disconnectWallet, tryAutoConnect, truncateAddress,
  detectWallets, connectWalletByType,
  type WalletType, type WalletInfo,
} from '@mf/wallet'
import { Live }  from './views/Live'
import { Memes } from './views/Memes'
import { Vote }  from './views/Vote'

type View = 'live' | 'memes' | 'vote'

const WALLET_LETTER: Record<WalletType, string> = {
  phantom:  'P',
  solflare: 'S',
  backpack: 'B',
  rabby:    'R',
}

function WalletGate({ onConnect }: { onConnect: (addr: string) => void }) {
  const [connecting, setConnecting] = useState<WalletType | null>(null)
  const wallets = detectWallets()

  const handle = async (info: WalletInfo) => {
    if (connecting) return
    if (!info.detected) {
      window.open(info.installUrl, '_blank', 'noopener')
      return
    }
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
      <div className="suite-gate-inner">
        <div className="suite-gate-logo">$VVC SUITE</div>
        <div className="suite-gate-sub">The Virgin vs Chad Command Center</div>
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
              <span className={`wg-icon wg-icon-${info.type}`}>
                {WALLET_LETTER[info.type]}
              </span>
              <span className="wg-name">{info.name}</span>
              <span className="wg-action">
                {connecting === info.type
                  ? 'Connecting…'
                  : info.detected
                  ? 'Connect'
                  : 'Install →'}
              </span>
              {info.isEvm && <span className="wg-evm-tag">EVM</span>}
            </button>
          ))}
        </div>
        <div className="wg-note">Solana wallets required for meme generation</div>
      </div>
    </div>
  )
}

export default function App() {
  const [address, setAddress] = useState<string | null>(null)
  const [view, setView]       = useState<View>('live')

  useEffect(() => {
    tryAutoConnect().then(addr => { if (addr) setAddress(addr) })
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
