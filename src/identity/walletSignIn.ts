// Sign in with a Solana wallet: connect, sign identity's one-time challenge, get a session.
// Uses the wallet's native Sign-In With Solana (signIn) when it has one, else signMessage.
import { challenge, verify, type SignedIn } from './api'

export type SolanaWalletType = 'phantom' | 'solflare' | 'backpack'

interface Provider {
  publicKey: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toString(): string } } | void>
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array } | Uint8Array>
  signIn?(input: Record<string, string>): Promise<{
    address?: { toString(): string } | string
    account?: { address: string }
    signature: Uint8Array
    signedMessage: Uint8Array
  }>
}

type Win = Window & {
  phantom?: { solana?: Provider & { isPhantom?: boolean } }
  solflare?: Provider & { isSolflare?: boolean }
  backpack?: Provider & { isBackpack?: boolean }
}

export interface WalletOption {
  type: SolanaWalletType
  name: string
  installUrl: string
  detected: boolean
}

function provider(type: SolanaWalletType): Provider | null {
  const w = window as Win
  switch (type) {
    case 'phantom':  return w.phantom?.solana?.isPhantom ? w.phantom.solana : null
    case 'solflare': return w.solflare?.isSolflare ? w.solflare : null
    case 'backpack': return w.backpack?.isBackpack ? w.backpack : null
  }
}

export function walletOptions(): WalletOption[] {
  return [
    { type: 'phantom',  name: 'Phantom',  installUrl: 'https://phantom.app/' },
    { type: 'solflare', name: 'Solflare', installUrl: 'https://solflare.com/' },
    { type: 'backpack', name: 'Backpack', installUrl: 'https://backpack.app/' },
  ].map(o => ({ ...o, type: o.type as SolanaWalletType, detected: !!provider(o.type as SolanaWalletType) }))
}

const toBase64 = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/** True when the user said no in their wallet (as opposed to something breaking). */
export function isUserRejection(e: unknown): boolean {
  const err = e as { code?: number; message?: string }
  return err?.code === 4001 || /reject|denied|cancel|closed/i.test(err?.message ?? '')
}

export async function signInWithWallet(type: SolanaWalletType): Promise<SignedIn> {
  const p = provider(type)
  if (!p) throw new Error('Wallet not found. Is the extension installed and unlocked?')

  const connected = await p.connect()
  const wallet = (connected && connected.publicKey?.toString()) ?? p.publicKey?.toString()
  if (!wallet) throw new Error('The wallet did not share an address')

  const ch = await challenge(wallet)

  if (typeof p.signIn === 'function') {
    const out = await p.signIn(ch.input)
    const signer = out.account?.address ?? out.address?.toString()
    if (signer && signer !== wallet) throw new Error('The wallet signed with a different account. Switch back and try again.')
    return verify({ nonce: ch.nonce, signature: toBase64(out.signature), signedMessage: toBase64(out.signedMessage) })
  }

  if (typeof p.signMessage !== 'function') throw new Error('This wallet cannot sign messages')
  const signed = await p.signMessage(new TextEncoder().encode(ch.message), 'utf8')
  const signature = signed instanceof Uint8Array ? signed : signed.signature
  return verify({ nonce: ch.nonce, signature: toBase64(signature) })
}
