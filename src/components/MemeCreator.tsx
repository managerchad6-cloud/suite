import { useState, useEffect, useRef, forwardRef } from 'react'
import {
  generateRaw,
  generateFreestyle,
  pollJob,
  fetchMetadata,
  imageUrl,
  parse,
  buildTweetUrl,
  type JobMetadata,
} from '../api/memes'
import { getActiveProvider, getActiveType, detectWallets, connectWalletByType } from '../wallet'

const _env = (import.meta as unknown as { env: Record<string, string> }).env
const SOLANA_RPC   = _env.VITE_SOLANA_RPC_URL ?? 'https://mainnet.helius-rpc.com'
const USDC_MINT_PK = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TREASURY_PK  = 'BvqPmrhAMJHozjpmJ9r7zLwkbZbS99pSaEkfQw3HxUQS'
const USDC_AMOUNT  = 1_000_000 // 1 USDC — 6 decimals

type Phase = 'idle' | 'building' | 'approving' | 'confirming' | 'submitting' | 'polling' | 'resolving' | 'done' | 'error'

function fakeProgress(elapsed: number): number {
  return Math.min(95 * (1 - Math.exp(-elapsed / 30)), 93)
}

export interface MemeCreatorProps {
  address: string | null
  onNeedConnect: () => void
  onClose?: () => void
  initialVirgn?: string
  initialChad?: string
  initialVirginLabels?: string[]
  initialChadLabels?: string[]
  initialFreetext?: string
  initialFormMode?: 'freestyle' | 'manual'
  variant?: 'card' | 'flat'
  readOnly?: boolean
  onCreateOwn?: () => void
}

function phaseLabel(elapsed: number, hasMetadata: boolean): string {
  if (hasMetadata) return 'Rendering the image…'
  if (elapsed < 15) return 'Generating character concepts…'
  if (elapsed < 40) return 'Writing labels…'
  if (elapsed < 80) return 'Rendering the image…'
  return 'Almost there…'
}

export const MemeCreator = forwardRef<HTMLDivElement, MemeCreatorProps>(
  ({ address, onNeedConnect: _onNeedConnect, onClose, initialVirgn, initialChad, initialVirginLabels, initialChadLabels, initialFreetext, initialFormMode, variant = 'card', readOnly, onCreateOwn }, ref) => {
    const [freetext, setFreetext] = useState(initialFreetext ?? '')
    const [virgin, setVirgin] = useState(initialVirgn ?? '')
    const [chad, setChad] = useState(initialChad ?? '')
    const [virginLabels, setVirginLabels] = useState<string[]>(initialVirginLabels ?? [])
    const [chadLabels, setChadLabels] = useState<string[]>(initialChadLabels ?? [])
    const [context, setContext] = useState('')
    const [formMode, setFormMode] = useState<'freestyle' | 'manual'>(initialFormMode ?? 'manual')
    const [parsing, setParsing] = useState(false)
    const [parseError, setParseError] = useState<string | null>(null)

    const [phase, setPhase] = useState<Phase>('idle')
    const [jobId, setJobId] = useState<string | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const [progress, setProgress] = useState(0)
    const [metadata, setMetadata] = useState<JobMetadata | null>(null)
    const [finalImage, setFinalImage] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [connectingInline, setConnectingInline] = useState(false)

    const pollTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
    const metaTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
    const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const resolveTimerRef = useRef<ReturnType<typeof setTimeout>  | null>(null)
    const consecutiveFailsRef = useRef(0)
    const labelsSeeded = useRef(false)

    const clearAllTimers = () => {
      if (pollTimerRef.current)    clearInterval(pollTimerRef.current)
      if (metaTimerRef.current)    clearInterval(metaTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current)
    }

    useEffect(() => () => clearAllTimers(), [])

    // Seed labels once when parent provides them (handles async metadata arrival)
    useEffect(() => {
      if (labelsSeeded.current) return
      if (initialVirginLabels?.length || initialChadLabels?.length) {
        setVirginLabels(initialVirginLabels ?? [])
        setChadLabels(initialChadLabels ?? [])
        labelsSeeded.current = true
      }
    }, [initialVirginLabels, initialChadLabels])

    const handleParse = async () => {
      const text = freetext.trim()
      if (!text) return
      setParsing(true)
      setParseError(null)
      try {
        const result = await parse(text)
        setVirgin(result.virgin)
        setChad(result.chad)
        setVirginLabels((result.virgin_labels ?? []).slice(0, 8))
        setChadLabels((result.chad_labels ?? []).slice(0, 8))
        setFormMode('manual')
      } catch (e: unknown) {
        setParseError(e instanceof Error ? e.message : 'Could not parse your idea.')
      } finally {
        setParsing(false)
      }
    }

    const startPolling = (id: string) => {
      setElapsed(0)
      setProgress(0)
      consecutiveFailsRef.current = 0
      const deadline = Date.now() + 4 * 60 * 1000

      elapsedTimerRef.current = setInterval(() => {
        setElapsed((e) => { const n = e + 1; setProgress(fakeProgress(n)); return n })
      }, 1000)

      metaTimerRef.current = setInterval(async () => {
        const m = await fetchMetadata(id)
        if (m) { setMetadata(m); if (metaTimerRef.current) clearInterval(metaTimerRef.current) }
      }, 5000)

      pollTimerRef.current = setInterval(async () => {
        if (Date.now() > deadline) {
          clearAllTimers()
          setErrorMsg('Generation timed out. The server may have restarted mid-job. Please try again.')
          setPhase('error')
          return
        }
        try {
          const { status, error } = await pollJob(id)
          consecutiveFailsRef.current = 0
          if (status === 'done') {
            clearAllTimers()
            setFinalImage(imageUrl(id))
            setProgress(100)
            setPhase('resolving')
            resolveTimerRef.current = setTimeout(() => setPhase('done'), 550)
          } else if (status === 'failed') {
            clearAllTimers()
            setErrorMsg(error || 'Generation failed. Try again.')
            setPhase('error')
          }
        } catch {
          consecutiveFailsRef.current += 1
          if (consecutiveFailsRef.current >= 4) {
            clearAllTimers()
            setErrorMsg('Could not reach the server. Check your connection and try again.')
            setPhase('error')
          }
        }
      }, 3000)
    }

    const handleConnectInline = async () => {
      const available = detectWallets().filter(w => !w.isEvm && w.detected)
      if (available.length === 0) { window.open('https://phantom.app/', '_blank', 'noopener'); return }
      setConnectingInline(true)
      try {
        const addr = await connectWalletByType(available[0].type)
        window.dispatchEvent(new CustomEvent('vvc:wallet-connected', { detail: addr }))
      } catch { /* rejected */ } finally { setConnectingInline(false) }
    }

    const handleSubmit = async () => {
      if (!address) return
      const v = virgin.trim(), c = chad.trim(), ft = freetext.trim()
      const isFreestyle = formMode === 'freestyle'
      if (isFreestyle && !ft) return
      if (!isFreestyle && (!v || !c)) return
      const filteredVL = virginLabels.map(l => l.trim()).filter(Boolean)
      const filteredCL = chadLabels.map(l => l.trim()).filter(Boolean)
      const hasLabels = filteredVL.length > 0 || filteredCL.length > 0

      try {
        setErrorMsg(null); setMetadata(null); setFinalImage(null)

        // ── 1. Build USDC payment transaction ──────────────────────────────
        setPhase('building')
        const [{ Connection, PublicKey, Transaction, SendTransactionError }, { getAssociatedTokenAddressSync, createTransferInstruction, createAssociatedTokenAccountIdempotentInstruction }] = await Promise.all([
          import('@solana/web3.js'),
          import('@solana/spl-token'),
        ])
        const connection   = new Connection(SOLANA_RPC, 'confirmed')
        const walletPubkey = new PublicKey(address)
        const USDC_MINT    = new PublicKey(USDC_MINT_PK)
        const TREASURY     = new PublicKey(TREASURY_PK)
        const senderATA    = getAssociatedTokenAddressSync(USDC_MINT, walletPubkey)
        const treasuryATA  = getAssociatedTokenAddressSync(USDC_MINT, TREASURY)

        const [senderAcct, treasuryAcct, solBalance] = await Promise.all([
          connection.getAccountInfo(senderATA),
          connection.getAccountInfo(treasuryATA),
          connection.getBalance(walletPubkey),
        ])

        if (!senderAcct) throw new Error('No USDC token account found. Add USDC to your wallet first.')

        const needsAta    = !treasuryAcct
        const minLamports = needsAta ? 2_100_000 : 15_000
        if (solBalance < minLamports) {
          const min = (minLamports / 1e9).toFixed(6).replace(/0+$/, '')
          throw new Error(`Need at least ${min} SOL for fees` + (needsAta ? ' (one-time treasury setup)' : '') + '.')
        }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPubkey })
          .add(createAssociatedTokenAccountIdempotentInstruction(walletPubkey, treasuryATA, TREASURY, USDC_MINT))
          .add(createTransferInstruction(senderATA, treasuryATA, walletPubkey, USDC_AMOUNT))

        // ── 2. User approves in wallet ─────────────────────────────────────
        const walletName = getActiveType() ?? 'wallet'
        setPhase('approving')
        const provider = getActiveProvider()
        if (!provider) throw new Error('No Solana wallet connected. Only Phantom, Solflare, and Backpack can sign transactions.')
        const signedTx = await provider.signTransaction(tx)

        // ── 3. Broadcast + wait for confirmation ───────────────────────────
        setPhase('confirming')
        let txSig: string
        try {
          txSig = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          })
        } catch (sendErr) {
          if (sendErr instanceof SendTransactionError) {
            let detail = sendErr.message
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const logs: string[] | null = await (sendErr as any).getLogs?.(connection) ?? null
              const hit = logs?.find(l => l.includes('Error') || l.includes('failed'))
              if (hit) detail = hit
            } catch {}
            if (detail.includes('no record of a prior credit') || detail.includes('insufficient lamports')) {
              throw new Error('Insufficient SOL for fees. Add SOL to your wallet.')
            }
            throw new Error(`Transaction failed: ${detail}`)
          }
          throw sendErr
        }

        await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed')

        // ── 4. Submit to backend with tx proof ─────────────────────────────
        setPhase('submitting')
        void walletName // used in approving label above
        const result: { job_id: string } = isFreestyle
          ? await generateFreestyle(ft, address, undefined, txSig)
          : (hasLabels || !context.trim())
            ? await generateRaw(v, c, address, undefined, filteredVL, filteredCL, txSig)
            : await generateFreestyle(`Virgin: ${v}, Chad: ${c}. ${context.trim()}`, address, undefined, txSig)

        setJobId(result.job_id)
        setPhase('polling')
        startPolling(result.job_id)

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Something went wrong.'
        if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('cancelled')) {
          setPhase('idle')
        } else { setErrorMsg(msg); setPhase('error') }
      }
    }

    const handleReset = () => {
      clearAllTimers()
      setPhase('idle'); setJobId(null); setMetadata(null)
      setFinalImage(null); setErrorMsg(null)
      setElapsed(0); setProgress(0)
      setVirginLabels([]); setChadLabels([])
      consecutiveFailsRef.current = 0
    }

    const handleDownload = () => {
      if (!finalImage) return
      const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-')
      const a = document.createElement('a')
      a.href = finalImage
      a.download = `virgin-${slug(virgin)}-vs-chad-${slug(chad)}.png`
      a.click()
    }

    const canSubmit = !!address && phase === 'idle' && (
      formMode === 'freestyle' ? !!freetext.trim() : !!(virgin.trim() && chad.trim())
    )
    const isActive = phase !== 'idle' && phase !== 'done' && phase !== 'error'
    const showForm    = phase === 'idle' || phase === 'error'
    const formDisabled = isActive || !!readOnly

    return (
      <div className={variant === 'flat' ? 'creator-flat' : 'creator-modal-card'} ref={ref}>
        {/* ── Header ── */}
        <div className="creator-panel-header">
          <span className="creator-panel-title">MEME FACTORY — $VVC</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="live-badge"><span className="live-dot" />LIVE</span>
            {onClose && <button className="creator-close-btn" onClick={onClose}>✕</button>}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="creator-form-body">

          {/* Form — shown when idle or error */}
          {showForm && (
            <>
              {/* ── Freestyle section ── */}
              <div className="form-section">
                <button
                  className={`form-section-toggle${formMode === 'freestyle' ? ' form-section-toggle--active' : ''}`}
                  onClick={() => setFormMode('freestyle')}
                  disabled={formDisabled}
                >
                  <span>Enter your meme idea</span>
                  <span className="form-section-chevron">{formMode === 'freestyle' ? '▾' : '▸'}</span>
                </button>
                {formMode === 'freestyle' && (
                  <div className="form-section-body">
                    <textarea
                      className="form-input textarea"
                      placeholder="Virgin X vs Chad Y…"
                      value={freetext}
                      onChange={(e) => setFreetext(e.target.value)}
                      maxLength={500}
                      disabled={formDisabled}
                      style={{ height: 80 }}
                    />
                    <button className="btn-parse" onClick={handleParse} disabled={!freetext.trim() || parsing || isActive}>
                      {parsing ? 'Parsing…' : '✨ Parse idea'}
                    </button>
                    {parseError && <p className="form-error" style={{ marginTop: 6 }}>{parseError}</p>}
                  </div>
                )}
              </div>

              {/* ── Manual section ── */}
              <div className="form-section">
                <button
                  className={`form-section-toggle${formMode === 'manual' ? ' form-section-toggle--active' : ''}`}
                  onClick={() => setFormMode('manual')}
                  disabled={formDisabled}
                >
                  <span>Fill in manually</span>
                  <span className="form-section-chevron">{formMode === 'manual' ? '▾' : '▸'}</span>
                </button>
                {formMode === 'manual' && (
                  <div className="form-section-body">
                    <div className="form-row-2">
                      <div className="form-field">
                        <label className="form-label">Virgin is…</label>
                        <input className="form-input" placeholder="Gym Bro" value={virgin}
                          onChange={(e) => setVirgin(e.target.value)} maxLength={50} disabled={formDisabled} />
                        <div className="label-inputs">
                          {virginLabels.length < 8 && !formDisabled && (
                            <button className="btn-add-label" onClick={() => setVirginLabels([...virginLabels, ''])}>
                              + label
                            </button>
                          )}
                          {virginLabels.map((lbl, i) => (
                            <div key={i} className="label-input-row">
                              <input
                                className="label-input"
                                value={lbl}
                                onChange={(e) => {
                                  const next = [...virginLabels]; next[i] = e.target.value; setVirginLabels(next)
                                }}
                                maxLength={40}
                                disabled={formDisabled}
                                placeholder={`Label ${i + 1}`}
                              />
                              {!readOnly && <button
                                className="label-remove-btn"
                                onClick={() => setVirginLabels(virginLabels.filter((_, j) => j !== i))}
                              >×</button>}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="form-field">
                        <label className="form-label">Chad is…</label>
                        <input className="form-input" placeholder="Skinny Fat" value={chad}
                          onChange={(e) => setChad(e.target.value)} maxLength={50} disabled={formDisabled} />
                        <div className="label-inputs">
                          {chadLabels.length < 8 && !formDisabled && (
                            <button className="btn-add-label btn-add-label--chad" onClick={() => setChadLabels([...chadLabels, ''])}>
                              + label
                            </button>
                          )}
                          {chadLabels.map((lbl, i) => (
                            <div key={i} className="label-input-row">
                              <input
                                className="label-input label-input--chad"
                                value={lbl}
                                onChange={(e) => {
                                  const next = [...chadLabels]; next[i] = e.target.value; setChadLabels(next)
                                }}
                                maxLength={40}
                                disabled={formDisabled}
                                placeholder={`Label ${i + 1}`}
                              />
                              {!readOnly && <button
                                className="label-remove-btn"
                                onClick={() => setChadLabels(chadLabels.filter((_, j) => j !== i))}
                              >×</button>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Context (optional)</label>
                      <textarea className="form-input textarea"
                        placeholder="Who actually has the right relationship with their body."
                        value={context} onChange={(e) => setContext(e.target.value)}
                        maxLength={400} disabled={formDisabled} style={{ height: 52, marginBottom: 4 }} />
                    </div>
                    <p className="form-hint">Context shapes the labels — leave blank to let AI decide.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Payment flow states */}
          {(phase === 'building' || phase === 'approving' || phase === 'confirming' || phase === 'submitting') && (
            <div className="creator-inline-state">
              {phase === 'approving'
                ? <span className="signing-icon">💳</span>
                : <div className="creator-loading-spinner" />
              }
              <div className="signing-title">
                {phase === 'building'   && 'Preparing payment…'}
                {phase === 'approving'  && 'Approve 1 USDC in your wallet'}
                {phase === 'confirming' && 'Confirming on-chain…'}
                {phase === 'submitting' && 'Submitting to AI…'}
              </div>
              <div className="signing-sub">
                {phase === 'building'   && 'Computing token accounts'}
                {phase === 'approving'  && '1 USDC will be sent to the treasury'}
                {phase === 'confirming' && 'Waiting for Solana confirmation'}
                {phase === 'submitting' && 'Sending your meme idea to the factory'}
              </div>
            </div>
          )}

          {/* Polling / resolving */}
          {(phase === 'polling' || phase === 'resolving') && (
            <div className="creator-inline-state">
              {phase === 'polling'
                ? <div className="creator-loading-spinner" />
                : <div style={{ fontSize: 36 }}>✓</div>
              }
              <div className="creator-loading-title">
                {phase === 'resolving' ? 'Done!' : 'Generating…'}
              </div>
              <div className="creator-loading-elapsed">{elapsed}s elapsed · up to ~2 min</div>
              <div className="creator-loading-phase">{phaseLabel(elapsed, !!metadata)}</div>
              <div className="gen-progress-wrap">
                <div
                  className={`gen-progress-fill${phase === 'resolving' ? ' gen-progress-fill--complete' : ''}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {metadata && (
                <div className="label-preview" style={{ marginTop: 8 }}>
                  <div className="label-preview-side">
                    <div className="label-preview-heading">Virgin {virgin || metadata.id}</div>
                    <div className="label-chips">
                      {metadata.virgin_labels.map((l) => <span key={l} className="label-chip">{l}</span>)}
                    </div>
                  </div>
                  <div className="label-preview-side">
                    <div className="label-preview-heading">Chad {chad}</div>
                    <div className="label-chips">
                      {metadata.chad_labels.map((l) => <span key={l} className="label-chip">{l}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Done — show image inline */}
          {phase === 'done' && finalImage && (
            <div className="creator-inline-result">
              <img src={finalImage} alt={`Virgin ${virgin} vs Chad ${chad}`} />
              <div className="creator-result-actions">
                <button className="btn-download" onClick={handleDownload}>↓ Download</button>
                <button className="btn-tweet" onClick={handleShareTwitter}>𝕏 Share</button>
                <button className="btn-new" onClick={handleReset}>New</button>
              </div>
              {metadata && (
                <div className="creator-labels-result">
                  <div className="label-preview-side">
                    <div className="label-preview-heading">Virgin {virgin || metadata.id}</div>
                    <div className="label-chips">
                      {metadata.virgin_labels.map(l => <span key={l} className="label-chip">{l}</span>)}
                    </div>
                  </div>
                  <div className="label-preview-side">
                    <div className="label-preview-heading">Chad {chad}</div>
                    <div className="label-chips">
                      {metadata.chad_labels.map(l => <span key={l} className="label-chip label-chip--chad">{l}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CTA row */}
          <div className="creator-cta-area">
            {readOnly ? (
              <button className="btn-create btn-create-own" onClick={onCreateOwn}>
                CREATE MY OWN →
              </button>
            ) : address ? (
              <button
                className="btn-create"
                onClick={phase === 'done' ? handleReset : handleSubmit}
                disabled={phase === 'done' ? false : !canSubmit}
              >
                {phase === 'idle'       ? 'CREATE — 1 USDC →'
                : phase === 'building'  ? 'Building transaction…'
                : phase === 'approving' ? 'Approve in wallet…'
                : phase === 'confirming'? 'Confirming on-chain…'
                : phase === 'submitting'? 'Submitting…'
                : phase === 'polling'   ? `Generating… ${elapsed}s`
                : phase === 'resolving' ? 'Done!'
                : phase === 'done'      ? '← Create another'
                : 'TRY AGAIN →'}
              </button>
            ) : (
              <div className="connect-prompt">
                <strong onClick={handleConnectInline}>
                  {connectingInline ? 'Connecting…' : 'Connect Phantom'}
                </strong>{' '}
                to create a meme.
              </div>
            )}
            {errorMsg && phase === 'error' && (
              <>
                <div className="form-error">{errorMsg}</div>
                <button className="btn-retry" style={{ marginTop: 8, width: '100%' }} onClick={handleReset}>
                  Try again
                </button>
              </>
            )}
          </div>

          {jobId && phase === 'done' && (
            <p style={{ fontSize: 10, color: '#444', marginTop: 8, opacity: 0.5 }}>job: {jobId}</p>
          )}
        </div>
      </div>
    )

    function handleShareTwitter() {
      window.open(buildTweetUrl(virgin || 'Virgin', chad || 'Chad'), '_blank', 'noopener,width=600,height=500')
    }
  }
)

MemeCreator.displayName = 'MemeCreator'
