import { useState, useEffect, useRef } from 'react'
import { getMemeIntake, voteMeme, WS_URL } from '../api/livestream'
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

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">NEXT MEME</span>
        {state === 'voting'  && countdown != null && <span className="panel-badge countdown">{countdown}s</span>}
        {state === 'rolling' && <span className="panel-badge rolling">ROLLING</span>}
        {state === 'idle'    && <span className="panel-badge idle">WAITING</span>}
      </div>
      <div className="panel-body">
        {pool.length === 0 ? (
          <div className="panel-empty">No memes in queue</div>
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
