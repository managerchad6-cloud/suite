import { useState, useEffect, useRef } from 'react'
import { getMemeIntake, voteMeme, submitMemeToLivestream, WS_URL } from '../api/livestream'
import { OrchestratorWS, type MemeVoteItem, type MemeIntakeState } from '../api/ws'

type VotingState = 'idle' | 'voting' | 'rolling'

function countdownSecs(endsAt: number | null): number | null {
  if (!endsAt) return null
  return Math.max(0, Math.round((endsAt - Date.now()) / 1000))
}

export function MemeQueue({ address: _address }: { address: string }) {
  const [pool, setPool] = useState<MemeVoteItem[]>([])
  const [state, setState] = useState<VotingState>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [voting, setVoting] = useState<number | null>(null)
  const wsRef = useRef<OrchestratorWS | null>(null)

  const [memeText, setMemeText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)
  const submitMsgRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function applyState(d: MemeIntakeState) {
    setPool(d.mimo?.pool ?? [])
    setState(d.mimo?.votingState ?? 'idle')
    setCountdown(countdownSecs(d.mimo?.countdownEndsAt ?? null))
  }

  useEffect(() => {
    getMemeIntake().then((d) => { if (d) applyState(d) })

    wsRef.current = new OrchestratorWS(WS_URL)
    const unsub = wsRef.current.on((msg) => {
      if (msg.event === 'meme:intake-update') {
        applyState((msg as { event: string; data: MemeIntakeState }).data)
      }
    })
    return () => { unsub(); wsRef.current?.destroy() }
  }, [])

  // Tick countdown locally between WS updates
  useEffect(() => {
    if (state !== 'voting' || countdown === null) return
    const t = setInterval(() => setCountdown((c) => (c != null && c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [state, countdown !== null])

  const handleVote = async (number: number) => {
    if (voting !== null) return
    setVoting(number)
    try { await voteMeme(number) }
    catch { /* rejected */ } finally { setVoting(null) }
  }

  const handleMemeSubmit = async () => {
    const text = memeText.trim()
    if (!text || submitting) return
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      await submitMemeToLivestream(text)
      setMemeText('')
      setSubmitMsg('Submitted!')
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
      if (submitMsgRef.current) clearTimeout(submitMsgRef.current)
      submitMsgRef.current = setTimeout(() => setSubmitMsg(null), 3000)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">NEXT MEME</span>
        {state === 'voting'  && countdown != null && <span className="panel-badge countdown">{countdown}s</span>}
        {state === 'rolling' && <span className="panel-badge rolling">ROLLING</span>}
        {state === 'idle'    && <span className="panel-badge idle">WAITING</span>}
      </div>
      <div className="panel-form">
        <textarea
          className="yt-input"
          placeholder="Virgin X vs Chad Y…"
          value={memeText}
          onChange={(e) => setMemeText(e.target.value)}
          disabled={submitting}
          maxLength={400}
          style={{ width: '100%', height: 58, resize: 'none', display: 'block', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="suggestion-submit-btn"
            onClick={handleMemeSubmit}
            disabled={submitting || !memeText.trim()}
          >
            {submitting ? '…' : 'Submit Meme'}
          </button>
          {submitMsg && <span style={{ fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--gold)' }}>{submitMsg}</span>}
        </div>
      </div>
      <div className="panel-body">
        {pool.length === 0 ? (
          <div className="panel-empty">Drop a meme idea above ↑</div>
        ) : pool.map((item) => (
          <div key={item.id} className="queue-item">
            <span className="queue-num">#{item.number}</span>
            <span className="queue-text">{item.description}</span>
            <div className="queue-item-right">
              <span className="queue-votes">{item.votes}</span>
              <button
                className="btn-queue-vote"
                onClick={() => handleVote(item.number)}
                disabled={voting !== null || state !== 'voting'}
              >
                {voting === item.number ? '…' : '↑'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
