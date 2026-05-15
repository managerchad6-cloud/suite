export type WalletType = 'phantom' | 'solflare' | 'backpack' | 'rabby'

export type SolanaProvider = {
  publicKey:    { toString(): string } | null
  isConnected?: boolean
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction(tx: any): Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAndSendTransaction(tx: any): Promise<{ signature: string }>
}

type EvmProvider = {
  isRabby?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request(args: { method: string; params?: any[] }): Promise<any>
}

type Win = Window & {
  phantom?:  { solana?: SolanaProvider & { isPhantom?: boolean } }
  solflare?: SolanaProvider & { isSolflare?: boolean }
  backpack?: SolanaProvider & { isBackpack?: boolean }
  ethereum?: EvmProvider
}

let _activeProvider: SolanaProvider | null = null
let _activeType:     WalletType | null     = null

function win(): Win { return window as unknown as Win }

export type WalletInfo = {
  type:       WalletType
  name:       string
  installUrl: string
  isEvm:      boolean
  detected:   boolean
}

export function detectWallets(): WalletInfo[] {
  const w = win()
  return [
    {
      type:       'phantom',
      name:       'Phantom',
      installUrl: 'https://phantom.app/',
      isEvm:      false,
      detected:   !!(w.phantom?.solana?.isPhantom),
    },
    {
      type:       'solflare',
      name:       'Solflare',
      installUrl: 'https://solflare.com/',
      isEvm:      false,
      detected:   !!(w.solflare?.isSolflare),
    },
    {
      type:       'backpack',
      name:       'Backpack',
      installUrl: 'https://backpack.app/',
      isEvm:      false,
      detected:   !!(w.backpack?.isBackpack),
    },
    {
      type:       'rabby',
      name:       'Rabby',
      installUrl: 'https://rabby.io/',
      isEvm:      true,
      detected:   !!(w.ethereum?.isRabby),
    },
  ]
}

function getSolanaProvider(type: Exclude<WalletType, 'rabby'>): SolanaProvider | null {
  const w = win()
  switch (type) {
    case 'phantom':  return w.phantom?.solana ?? null
    case 'solflare': return w.solflare        ?? null
    case 'backpack': return w.backpack        ?? null
  }
}

export async function connectWalletByType(type: WalletType): Promise<string> {
  if (type === 'rabby') {
    const evm = win().ethereum
    if (!evm) throw new Error('Rabby not found')
    const accounts = (await evm.request({ method: 'eth_requestAccounts' })) as string[]
    if (!accounts[0]) throw new Error('No account returned')
    _activeProvider = null
    _activeType     = 'rabby'
    return accounts[0]
  }

  const p = getSolanaProvider(type)
  if (!p) throw new Error(`${type} wallet not found`)
  const result = await p.connect()
  // Some wallets resolve connect() to { publicKey }, others just set p.publicKey
  const pkStr = result?.publicKey?.toString() ?? p.publicKey?.toString()
  if (!pkStr) throw new Error(`Could not get public key from ${type}`)
  _activeProvider = p
  _activeType     = type
  return pkStr
}

export async function connectWallet(): Promise<string> {
  return connectWalletByType('phantom')
}

export async function disconnectWallet(): Promise<void> {
  if (_activeProvider) {
    await _activeProvider.disconnect().catch(() => {})
  }
  _activeProvider = null
  _activeType     = null
}

export async function tryAutoConnect(): Promise<string | null> {
  const w = win()

  // Phantom silent reconnect
  const phantom = w.phantom?.solana
  if (phantom?.isPhantom) {
    try {
      const { publicKey } = await phantom.connect({ onlyIfTrusted: true })
      _activeProvider = phantom
      _activeType     = 'phantom'
      return publicKey.toString()
    } catch {}
  }

  // Solflare — already connected from a previous session
  const solflare = w.solflare
  if (solflare?.isSolflare && solflare.isConnected && solflare.publicKey) {
    _activeProvider = solflare
    _activeType     = 'solflare'
    return solflare.publicKey.toString()
  }

  return null
}

export function getActiveProvider(): SolanaProvider | null { return _activeProvider }
export function getActiveType():     WalletType | null     { return _activeType     }

// kept for backward-compat with MemeCreator
export function getPhantomProvider(): SolanaProvider | null {
  return win().phantom?.solana ?? null
}

export function isPhantomInstalled(): boolean {
  return !!(win().phantom?.solana?.isPhantom)
}

export function truncateAddress(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr
}
