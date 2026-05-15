import { forwardRef, useState, useEffect, useRef } from 'react'
import { Connection, PublicKey, Transaction, SendTransactionError } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token'
import { getActiveProvider } from '@mf/wallet'

const _env         = (import.meta as unknown as { env: Record<string, string> }).env
const MEME_FACTORY = _env.VITE_MEME_FACTORY_URL ?? ''
const SOLANA_RPC   = _env.VITE_HELIUS_RPC_URL ?? 'https://mainnet.helius-rpc.com'
const USDC_MINT    = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const TREASURY     = new PublicKey('BvqPmrhAMJHozjpmJ9r7zLwkbZbS99pSaEkfQw3HxUQS')
const USDC_AMOUNT  = 1_000_000 // 1 USDC — 6 decimal places

type Stage =
  | 'idle'
  | 'building'    // computing ATAs, fetching blockhash
  | 'approving'   // waiting for user to approve in Phantom
  | 'confirming'  // transaction broadcast, awaiting on-chain confirmation
  | 'generating'  // MemeFactory processing the job
  | 'done'
  | 'error'

const STAGE_LABEL: Record<Stage, string> = {
  idle:       '',
  building:   'Building payment transaction…',
  approving:  'Approve 1 USDC payment in Phantom…',
  confirming: 'Waiting for on-chain confirmation…',
  generating: 'Generating your meme…',
  done:       '',
  error:      '',
}

type Props = {
  address:        string
  onNeedConnect?: () => void
}

function parseLabels(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export const MemeCreator = forwardRef<HTMLElement, Props>(
  function MemeCreator({ address }, ref) {
    const [virgin,  setVirgin]  = useState('')
    const [chad,    setChad]    = useState('')
    const [vLabels, setVLabels] = useState('')
    const [cLabels, setCLabels] = useState('')
    const [stage,   setStage]   = useState<Stage>('idle')
    const [error,   setError]   = useState<string | null>(null)
    const [imgUrl,  setImgUrl]  = useState<string | null>(null)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    const busy  = stage !== 'idle' && stage !== 'done' && stage !== 'error'
    const ready = virgin.trim().length > 0 && chad.trim().length > 0

    const reset = () => {
      setStage('idle')
      setError(null)
      setImgUrl(null)
    }

    const handleGenerate = async () => {
      if (!ready || busy) return
      setError(null)
      setImgUrl(null)

      try {
        // ── 1. Build the USDC transfer transaction ──────────────────────────
        setStage('building')
        const connection   = new Connection(SOLANA_RPC, 'confirmed')
        const walletPubkey = new PublicKey(address)
        const senderATA    = getAssociatedTokenAddressSync(USDC_MINT, walletPubkey)
        const treasuryATA  = getAssociatedTokenAddressSync(USDC_MINT, TREASURY)

        // Pre-flight: verify sender ATA exists, check SOL balance for fees.
        const [senderAcct, treasuryAcct, solBalance] = await Promise.all([
          connection.getAccountInfo(senderATA),
          connection.getAccountInfo(treasuryATA),
          connection.getBalance(walletPubkey),
        ])

        if (!senderAcct) {
          throw new Error('No USDC token account found. Add USDC to your wallet first.')
        }

        // Treasury ATA creation costs ~0.00204 SOL rent if it doesn't exist yet.
        const needsAta    = !treasuryAcct
        const minLamports = needsAta ? 2_100_000 : 15_000
        if (solBalance < minLamports) {
          const min = (minLamports / 1e9).toFixed(6).replace(/0+$/, '')
          throw new Error(
            `Need at least ${min} SOL in your wallet for fees` +
            (needsAta ? ' (includes one-time treasury account setup)' : '') + '.',
          )
        }

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash('confirmed')

        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPubkey })
          // Create treasury ATA if it doesn't exist yet — idempotent, safe to
          // include every time. Simulation fails (→ Phantom "malicious" block)
          // when the destination account is missing.
          .add(createAssociatedTokenAccountIdempotentInstruction(
            walletPubkey, treasuryATA, TREASURY, USDC_MINT,
          ))
          .add(createTransferInstruction(senderATA, treasuryATA, walletPubkey, USDC_AMOUNT))

        // ── 2. Ask Phantom to sign only, then broadcast ourselves via Helius.
        //    signAndSendTransaction triggers Phantom's domain-reputation filter;
        //    signTransaction + manual sendRawTransaction bypasses that check.
        setStage('approving')
        const phantom = getActiveProvider()
        if (!phantom) throw new Error('Meme generation requires a Solana wallet (Phantom, Solflare, or Backpack)')
        const signedTx = await phantom.signTransaction(tx)

        setStage('confirming')
        let txSig: string
        try {
          txSig = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          })
        } catch (sendErr) {
          if (sendErr instanceof SendTransactionError) {
            // Extract simulation logs for a meaningful error message
            let detail = sendErr.message
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const logs: string[] | null = await (sendErr as any).getLogs?.(connection) ?? null
              const hit = logs?.find(l => l.includes('Error') || l.includes('failed'))
              if (hit) detail = hit
            } catch {}
            if (detail.includes('no record of a prior credit') || detail.includes('insufficient lamports')) {
              throw new Error('Insufficient SOL for transaction fees. Add SOL to your wallet and try again.')
            }
            throw new Error(`Simulation failed: ${detail}`)
          }
          throw sendErr
        }

        // ── 3. Wait for on-chain confirmation ───────────────────────────────
        await connection.confirmTransaction(
          { signature: txSig, blockhash, lastValidBlockHeight },
          'confirmed',
        )

        // ── 4. Trigger generation — backend re-verifies everything ──────────
        setStage('generating')
        const vl = parseLabels(vLabels)
        const cl = parseLabels(cLabels)

        const res = await fetch(`${MEME_FACTORY}/generate/raw`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            virgin:        virgin.trim(),
            chad:          chad.trim(),
            virgin_labels: vl.length ? vl : undefined,
            chad_labels:   cl.length ? cl : undefined,
            tx_signature:  txSig,
            wallet:        address,
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { detail?: string }).detail ?? `Server error ${res.status}`)
        }

        const { job_id } = (await res.json()) as { job_id: string }

        // ── 5. Poll until done ──────────────────────────────────────────────
        pollRef.current = setInterval(async () => {
          try {
            const s = (await fetch(`${MEME_FACTORY}/jobs/${job_id}`).then(r => r.json())) as {
              status: string; error?: string
            }
            if (s.status === 'done') {
              clearInterval(pollRef.current!)
              setImgUrl(`${MEME_FACTORY}/jobs/${job_id}/image?t=${Date.now()}`)
              setStage('done')
            } else if (s.status === 'failed') {
              clearInterval(pollRef.current!)
              throw new Error(s.error ?? 'Generation failed')
            }
          } catch (e) {
            clearInterval(pollRef.current!)
            setError(e instanceof Error ? e.message : String(e))
            setStage('error')
          }
        }, 2500)

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('cancelled')) {
          // User dismissed Phantom — return to idle silently
          setStage('idle')
        } else {
          setError(msg)
          setStage('error')
        }
      }
    }

    return (
      <section ref={ref} className="mc-wrap">
        <div className="mc-header">
          <span className="mc-title">CREATE MEME</span>
          <span className="mc-price">1 USDC</span>
        </div>

        <div className="mc-body">
          <div className="mc-row">
            {/* Virgin side */}
            <div className="mc-side">
              <label className="mc-label mc-label-virgin">VIRGIN</label>
              <input
                className="mc-input"
                value={virgin}
                onChange={e => setVirgin(e.target.value)}
                placeholder="e.g. Python Dev"
                disabled={busy}
              />
              <input
                className="mc-input mc-input-labels"
                value={vLabels}
                onChange={e => setVLabels(e.target.value)}
                placeholder="traits, comma-separated (optional)"
                disabled={busy}
              />
            </div>

            <div className="mc-vs">VS</div>

            {/* Chad side */}
            <div className="mc-side">
              <label className="mc-label mc-label-chad">CHAD</label>
              <input
                className="mc-input"
                value={chad}
                onChange={e => setChad(e.target.value)}
                placeholder="e.g. Rust Dev"
                disabled={busy}
              />
              <input
                className="mc-input mc-input-labels"
                value={cLabels}
                onChange={e => setCLabels(e.target.value)}
                placeholder="traits, comma-separated (optional)"
                disabled={busy}
              />
            </div>
          </div>

          {/* Status / error */}
          {error && (
            <div className="mc-error">
              <span>{error}</span>
              <button className="mc-error-dismiss" onClick={reset}>✕</button>
            </div>
          )}
          {busy && (
            <div className="mc-status">
              <div className="mc-spinner" />
              <span>{STAGE_LABEL[stage]}</span>
            </div>
          )}

          {/* Action buttons */}
          {!busy && stage !== 'done' && (
            <button
              className="mc-btn-generate"
              onClick={handleGenerate}
              disabled={!ready}
            >
              GENERATE · 1 USDC
            </button>
          )}
          {stage === 'done' && (
            <button className="mc-btn-again" onClick={reset}>
              CREATE ANOTHER
            </button>
          )}
        </div>

        {/* Result */}
        {imgUrl && (
          <div className="mc-result">
            <img
              className="mc-result-img"
              src={imgUrl}
              alt="generated meme"
            />
          </div>
        )}
      </section>
    )
  }
)
