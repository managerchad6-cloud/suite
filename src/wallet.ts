// Phantom wallet utilities used across the Suite app.

export type PhantomProvider = {
  isPhantom:    boolean
  isConnected:  boolean
  publicKey:    { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
  signMessage(msg: Uint8Array, enc: string): Promise<{ signature: Uint8Array }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAndSendTransaction(tx: any): Promise<{ signature: string }>
}

function getProvider(): PhantomProvider | null {
  return (window as unknown as { phantom?: { solana?: PhantomProvider } })
    .phantom?.solana ?? null
}

export function isPhantomInstalled(): boolean {
  return !!(window as unknown as { phantom?: { solana?: { isPhantom?: boolean } } })
    .phantom?.solana?.isPhantom
}

export function getPhantomProvider(): PhantomProvider | null {
  return getProvider()
}

export async function connectWallet(): Promise<string> {
  const p = getProvider()
  if (!p) throw new Error('Phantom wallet not found')
  const { publicKey } = await p.connect()
  return publicKey.toString()
}

export async function disconnectWallet(): Promise<void> {
  await getProvider()?.disconnect()
}

export async function tryAutoConnect(): Promise<string | null> {
  const p = getProvider()
  if (!p) return null
  try {
    const { publicKey } = await p.connect({ onlyIfTrusted: true })
    return publicKey.toString()
  } catch {
    return null
  }
}

export function truncateAddress(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr
}
