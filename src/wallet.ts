export interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toString(): string } | null;
  isConnected: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
}

interface PhantomWindow {
  phantom?: { solana?: PhantomProvider };
  solana?: PhantomProvider;
}

export function getPhantom(): PhantomProvider | null {
  const win = window as unknown as PhantomWindow;
  return win.phantom?.solana ?? win.solana ?? null;
}

export function isPhantomInstalled(): boolean {
  return !!getPhantom()?.isPhantom;
}

export async function connectWallet(): Promise<string> {
  const phantom = getPhantom();
  if (!phantom) throw new Error('no_phantom');
  const { publicKey } = await phantom.connect();
  return publicKey.toString();
}

export async function disconnectWallet(): Promise<void> {
  await getPhantom()?.disconnect();
}

export async function tryAutoConnect(): Promise<string | null> {
  const phantom = getPhantom();
  if (!phantom) return null;
  try {
    const { publicKey } = await phantom.connect({ onlyIfTrusted: true });
    return publicKey.toString();
  } catch {
    return null;
  }
}

export async function signAction(action: string, address: string): Promise<string> {
  const phantom = getPhantom();
  if (!phantom) throw new Error('Phantom not found');
  const msg = [
    'VVC Meme Factory',
    `Action: ${action}`,
    `Wallet: ${address}`,
    `Timestamp: ${Date.now()}`,
  ].join('\n');
  const encoded = new TextEncoder().encode(msg);
  const { signature } = await phantom.signMessage(encoded, 'utf8');
  return btoa(String.fromCharCode(...Array.from(signature)));
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
