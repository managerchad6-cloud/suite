import { useState, useEffect } from 'react'
import { getActiveProvider } from '../wallet'
import { fetchCreditPacks, verifyPurchase, type CreditPack } from '../api/credits'
import './BuyCreditsModal.css'

const SOLANA_RPC  = (import.meta as any).env?.VITE_SOLANA_RPC_URL ?? 'https://mainnet.helius-rpc.com'
const USDC_MINT   = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TREASURY_PK = 'BvqPmrhAMJHozjpmJ9r7zLwkbZbS99pSaEkfQw3HxUQS'

// ─── VVC Token ───────────────────────────────────────────────────────────────
// Replace VVC_MINT with the mainnet contract address once VVC token is deployed.
const VVC_MINT     = '6ogzHhzdrQr9Pgv6hZ2MNze7UrzBMAFyBBWUYp1Fhitx'
const VVC_DECIMALS = 6  // standard SPL token decimals — confirm on deploy
// ─────────────────────────────────────────────────────────────────────────────

type Step = 'pick' | 'building' | 'approving' | 'confirming' | 'verifying' | 'done' | 'error'
type PayMethod = 'usdc' | 'sol' | 'vvc'

const STEP_LABEL: Record<Step, string> = {
  pick:       '',
  building:   'Building transaction…',
  approving:  'Approve in your wallet…',
  confirming: 'Confirming on-chain…',
  verifying:  'Verifying payment…',
  done:       'Credits added!',
  error:      '',
}

interface Props {
  wallet: string
  currentBalance: number
  requiredCredits?: number
  onClose: () => void
  onPurchased: (newBalance: number) => void
}

export function BuyCreditsModal({ wallet, currentBalance, requiredCredits, onClose, onPurchased }: Props) {
  const [packs,     setPacks]     = useState<CreditPack[]>([])
  const [selected,  setSelected]  = useState<string | null>(null)
  const [step,      setStep]      = useState<Step>('pick')
  const [error,     setError]     = useState<string | null>(null)
  const [added,     setAdded]     = useState(0)
  const [payMethod, setPayMethod] = useState<PayMethod>('usdc')
  const [solPrice,  setSolPrice]  = useState<number | null>(null)
  const [vvcPrice,  setVvcPrice]  = useState<number | null>(null)

  useEffect(() => {
    fetchCreditPacks().then(d => {
      setPacks(d.packs)
      if (requiredCredits) {
        const needed   = requiredCredits - currentBalance
        const suitable = d.packs.find(p => p.credits >= needed) ?? d.packs[d.packs.length - 1]
        setSelected(suitable.id)
      } else {
        setSelected(d.packs[1]?.id ?? d.packs[0]?.id ?? null)
      }
    }).catch(() => {})

    // SOL price: CoinGecko primary, DexScreener fallback
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
      .then(r => r.json())
      .then(d => {
        const p = d?.solana?.usd
        if (p) { setSolPrice(p); return }
        throw new Error('no price')
      })
      .catch(() =>
        fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112')
          .then(r => r.json())
          .then(d => { const p = d?.pairs?.[0]?.priceUsd; if (p) setSolPrice(parseFloat(p)) })
          .catch(() => {})
      )

    // VVC price via DexScreener — swap VVC_MINT for real mint after deploy
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${VVC_MINT}`)
      .then(r => r.json())
      .then(d => {
        const p = d?.pairs?.[0]?.priceUsd
        if (p) setVvcPrice(parseFloat(p))
      })
      .catch(() => {})
  }, [requiredCredits, currentBalance])

  function solForPack(pack: CreditPack): number | null {
    if (!solPrice) return null
    return pack.usdc / solPrice
  }

  function vvcForPack(pack: CreditPack): number | null {
    if (!vvcPrice) return null
    return pack.usdc / vvcPrice
  }

  async function purchase() {
    const pack = packs.find(p => p.id === selected)
    if (!pack || step !== 'pick') return
    setError(null)

    try {
      setStep('building')
      const [{ Connection, PublicKey, Transaction, SystemProgram, SendTransactionError },
             { getAssociatedTokenAddressSync, createTransferInstruction,
               createAssociatedTokenAccountIdempotentInstruction }] = await Promise.all([
        import('@solana/web3.js'),
        import('@solana/spl-token'),
      ])

      const connection = new Connection(SOLANA_RPC, 'confirmed')
      const walletPk   = new PublicKey(wallet)
      const treasury   = new PublicKey(TREASURY_PK)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      let tx: InstanceType<typeof Transaction>
      let expectedLamports: number | undefined

      if (payMethod === 'sol') {
        if (!solPrice) throw new Error('SOL price unavailable. Switch to USDC.')
        expectedLamports = Math.round((pack.usdc / solPrice) * 1_000_000_000)
        const solBal = await connection.getBalance(walletPk)
        if (solBal < expectedLamports + 15_000) throw new Error('Insufficient SOL balance.')
        tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPk })
          .add(SystemProgram.transfer({ fromPubkey: walletPk, toPubkey: treasury, lamports: expectedLamports }))

      } else if (payMethod === 'vvc') {
        // VVC Token — swap VVC_MINT for real mint after deploy
        if (!vvcPrice) throw new Error('VVC price unavailable. Switch to USDC.')
        const vvcMint     = new PublicKey(VVC_MINT)
        const senderATA   = getAssociatedTokenAddressSync(vvcMint, walletPk)
        const treasuryATA = getAssociatedTokenAddressSync(vvcMint, treasury)
        const [senderAcct, treasuryAcct, solBal] = await Promise.all([
          connection.getAccountInfo(senderATA),
          connection.getAccountInfo(treasuryATA),
          connection.getBalance(walletPk),
        ])
        if (!senderAcct) throw new Error('No VVC token account found. Add VVC to your wallet first.')
        const needsAta    = !treasuryAcct
        const minLamports = needsAta ? 2_100_000 : 15_000
        if (solBal < minLamports) {
          const min = (minLamports / 1e9).toFixed(6).replace(/0+$/, '')
          throw new Error(`Need at least ${min} SOL for network fees.`)
        }
        expectedLamports = Math.round((pack.usdc / vvcPrice) * Math.pow(10, VVC_DECIMALS))
        tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPk })
          .add(createAssociatedTokenAccountIdempotentInstruction(walletPk, treasuryATA, treasury, vvcMint))
          .add(createTransferInstruction(senderATA, treasuryATA, walletPk, expectedLamports))

      } else {
        // USDC
        const usdcMint    = new PublicKey(USDC_MINT)
        const senderATA   = getAssociatedTokenAddressSync(usdcMint, walletPk)
        const treasuryATA = getAssociatedTokenAddressSync(usdcMint, treasury)
        const [senderAcct, treasuryAcct, solBal] = await Promise.all([
          connection.getAccountInfo(senderATA),
          connection.getAccountInfo(treasuryATA),
          connection.getBalance(walletPk),
        ])
        if (!senderAcct) throw new Error('No USDC account found. Add USDC to your wallet first.')
        const needsAta    = !treasuryAcct
        const minLamports = needsAta ? 2_100_000 : 15_000
        if (solBal < minLamports) {
          const min = (minLamports / 1e9).toFixed(6).replace(/0+$/, '')
          throw new Error(`Need at least ${min} SOL for network fees.`)
        }
        const usdcAmount = Math.round(pack.usdc * 1_000_000)
        tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPk })
          .add(createAssociatedTokenAccountIdempotentInstruction(walletPk, treasuryATA, treasury, usdcMint))
          .add(createTransferInstruction(senderATA, treasuryATA, walletPk, usdcAmount))
      }

      setStep('approving')
      const provider = getActiveProvider()
      if (!provider) throw new Error('No wallet connected. Connect Phantom, Solflare, or Backpack.')
      const signedTx = await provider.signTransaction(tx)

      setStep('confirming')
      let txSig: string
      try {
        txSig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' })
      } catch (e: any) {
        if (e instanceof SendTransactionError) {
          const msg = e.message
          if (msg.includes('insufficient lamports')) throw new Error('Insufficient SOL for fees.')
          throw new Error(`Transaction failed: ${msg}`)
        }
        throw e
      }
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed')

      setStep('verifying')
      const result = await verifyPurchase(wallet, pack.id, txSig, payMethod, expectedLamports)
      setAdded(result.credits_added)
      setStep('done')
      onPurchased(result.new_balance)

    } catch (e: any) {
      if (e?.message?.includes('User rejected') || e?.message?.includes('cancelled')) {
        setStep('pick')
      } else {
        setError(e?.message ?? 'Purchase failed')
        setStep('error')
      }
    }
  }

  const busy = step !== 'pick' && step !== 'done' && step !== 'error'
  const pack = packs.find(p => p.id === selected)

  return (
    <div className="bcm-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="bcm-modal">
        <div className="bcm-header">
          <span className="bcm-title">Buy Credits</span>
          {!busy && <button className="bcm-close" onClick={onClose}>✕</button>}
        </div>

        {requiredCredits && step === 'pick' && (
          <div className="bcm-notice">
            You need <strong>{requiredCredits} credits</strong> — you have <strong>{currentBalance}</strong>
          </div>
        )}

        {/* Payment method toggle */}
        {(step === 'pick' || step === 'error') && (
          <div className="bcm-pay-toggle">
            <button className={`bcm-pay-btn ${payMethod === 'usdc' ? 'active' : ''}`} onClick={() => setPayMethod('usdc')}>
              <span className="bcm-pay-icon">💵</span> USDC
            </button>
            <button className={`bcm-pay-btn ${payMethod === 'sol' ? 'active' : ''}`} onClick={() => setPayMethod('sol')}>
              <span className="bcm-pay-icon">◎</span> SOL
              {!solPrice && <span className="bcm-pay-fetching"> …</span>}
            </button>
            <button className={`bcm-pay-btn bcm-pay-btn--vvc ${payMethod === 'vvc' ? 'active' : ''}`} onClick={() => setPayMethod('vvc')}>
              <span className="bcm-pay-icon">⚡</span> VVC
              {!vvcPrice && <span className="bcm-pay-fetching"> …</span>}
            </button>
          </div>
        )}

        {/* Pack grid */}
        {(step === 'pick' || step === 'error') && (
          <div className="bcm-packs">
            {packs.map(p => {
              const solAmt = solForPack(p)
              return (
                <button
                  key={p.id}
                  className={`bcm-pack ${selected === p.id ? 'selected' : ''}`}
                  onClick={() => setSelected(p.id)}
                >
                  <span className="bcm-pack-label">{p.label}</span>
                  <span className="bcm-pack-credits">{p.credits} credits</span>
                  {payMethod === 'usdc' ? (<>
                    <span className="bcm-pack-price">${p.usdc.toFixed(2)} USDC</span>
                    <span className="bcm-pack-rate">${(p.usdc / p.credits * 10).toFixed(1)}¢ / credit</span>
                  </>) : payMethod === 'sol' ? (<>
                    <span className="bcm-pack-price">{solAmt !== null ? `◎ ${solAmt.toFixed(4)} SOL` : '…'}</span>
                    <span className="bcm-pack-rate">≈ ${p.usdc.toFixed(2)} USD</span>
                  </>) : (<>
                    <span className="bcm-pack-price bcm-pack-price--vvc">
                      {vvcForPack(p) !== null ? `⚡ ${vvcForPack(p)!.toLocaleString(undefined, { maximumFractionDigits: 0 })} VVC` : '…'}
                    </span>
                    <span className="bcm-pack-rate">≈ ${p.usdc.toFixed(2)} USD</span>
                  </>)}
                </button>
              )
            })}
          </div>
        )}

        {/* Rate breakdown */}
        {step === 'pick' && (
          <div className="bcm-breakdown">
            <span>🖌️ RE-SKIN / EDIT / Art AI = 3 credits</span>
            <span>⚡ IN ACTION (×1/×2/×3) = 3 / 5 / 8 credits</span>
          </div>
        )}

        {/* Live rate note */}
        {step === 'pick' && payMethod === 'sol' && solPrice && (
          <div className="bcm-sol-rate">◎ 1 SOL ≈ ${solPrice.toLocaleString()} · rate locks at signing</div>
        )}
        {step === 'pick' && payMethod === 'vvc' && vvcPrice && (
          <div className="bcm-sol-rate">⚡ 1 VVC ≈ ${vvcPrice < 0.001 ? vvcPrice.toExponential(2) : vvcPrice.toFixed(4)} · rate locks at signing</div>
        )}

        {/* In-progress */}
        {busy && (
          <div className="bcm-progress">
            <div className="bcm-spinner" />
            <span>{STEP_LABEL[step]}</span>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="bcm-done">
            <span className="bcm-done-icon">✓</span>
            <span><strong>{added} credits</strong> added to your account</span>
            <span className="bcm-done-balance">New balance: {currentBalance + added} credits</span>
            <button className="bcm-btn-primary" onClick={onClose}>Done</button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && error && (
          <div className="bcm-error">{error}</div>
        )}

        {/* CTA */}
        {step === 'pick' && (
          <button
            className={`bcm-btn-primary ${payMethod === 'vvc' ? 'bcm-btn-primary--vvc' : ''}`}
            disabled={!selected || (payMethod === 'sol' && !solPrice) || (payMethod === 'vvc' && !vvcPrice)}
            onClick={purchase}
          >
            {pack ? (
              payMethod === 'usdc'
                ? `Buy ${pack.credits} credits — $${pack.usdc.toFixed(2)} USDC`
                : payMethod === 'sol'
                  ? `Buy ${pack.credits} credits — ◎ ${solForPack(pack)?.toFixed(4) ?? '…'} SOL`
                  : `Buy ${pack.credits} credits — ⚡ ${vvcForPack(pack)?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '…'} VVC`
            ) : 'Select a pack'}
          </button>
        )}
        {step === 'error' && (
          <button className="bcm-btn-secondary" onClick={() => setStep('pick')}>Try again</button>
        )}
      </div>
    </div>
  )
}
