// The wallet provider used to sign *payments* (credit top-ups, paid meme generation).
//
// Identity is not here: who you are is the identity session (src/identity). This module only keeps
// a handle on the extension so transactions can be signed, and it must be the signed-in wallet.
// No per-action message signing: the session already proves who is acting.

export type WalletType = 'phantom' | 'solflare' | 'backpack'

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

type Win = Window & {
  phantom?:  { solana?: SolanaProvider & { isPhantom?: boolean } }
  solflare?: SolanaProvider & { isSolflare?: boolean }
  backpack?: SolanaProvider & { isBackpack?: boolean }
}

let _activeProvider: SolanaProvider | null = null
let _activeType:     WalletType | null     = null

function win(): Win { return window as unknown as Win }

function getSolanaProvider(type: WalletType): SolanaProvider | null {
  const w = win()
  switch (type) {
    case 'phantom':  return w.phantom?.solana ?? null
    case 'solflare': return w.solflare        ?? null
    case 'backpack': return w.backpack        ?? null
  }
}

/** Remember the extension the user just signed in with, for later payments. */
export async function connectWalletByType(type: WalletType): Promise<string> {
  const p = getSolanaProvider(type)
  if (!p) throw new Error(`${type} wallet not found`)
  const result = await p.connect()
  const pkStr = result?.publicKey?.toString() ?? p.publicKey?.toString()
  if (!pkStr) throw new Error(`Could not get public key from ${type}`)
  _activeProvider = p
  _activeType     = type
  return pkStr
}

/** After a reload: quietly reattach an extension the user already trusted (no popup). */
export async function tryAutoConnect(): Promise<string | null> {
  const w = win()
  const phantom = w.phantom?.solana
  if (phantom?.isPhantom) {
    try {
      const { publicKey } = await phantom.connect({ onlyIfTrusted: true })
      _activeProvider = phantom
      _activeType     = 'phantom'
      return publicKey.toString()
    } catch {}
  }
  const solflare = w.solflare
  if (solflare?.isSolflare && solflare.isConnected && solflare.publicKey) {
    _activeProvider = solflare
    _activeType     = 'solflare'
    return solflare.publicKey.toString()
  }
  return null
}

export function getActiveProvider(): SolanaProvider | null { return _activeProvider }
export function getActiveType():     WalletType | null     { return _activeType }

export function truncateAddress(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr
}
