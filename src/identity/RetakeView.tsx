// Members retaking the interview. Their current archetype stays until the new interview completes.
import { useState } from 'react'
import { useIdentity } from './IdentityProvider'
import { Interview } from './Interview'
import { ArchetypeReveal } from './ArchetypeReveal'
import { cancelRetake } from './api'

export function RetakeView({ onDone }: { onDone: () => void }) {
  const { profile, setMe, refresh } = useIdentity()
  const [started, setStarted] = useState(false)
  const [revealed, setRevealed] = useState<{ rerollsLeft: number | null } | null>(null)

  if (revealed && profile) {
    return (
      <ArchetypeReveal
        profile={profile}
        rerollsLeft={revealed.rerollsLeft}
        onRerolled={left => setRevealed({ rerollsLeft: left })}
        doneLabel="Back to profile"
        onDone={onDone}
      />
    )
  }

  if (!started) {
    return (
      <div className="quiz-idle">
        <p className="quiz-oracle-label">VVC ARCHETYPE ORACLE</p>
        <h1 className="quiz-idle-title">Retake the interview?</h1>
        <p className="quiz-idle-sub">Your current archetype stays until you finish. Answer honestly. The oracle always knows.</p>
        <button className="quiz-start-btn" onClick={() => setStarted(true)}>Begin Interview</button>
        <button className="join-link-btn" onClick={onDone}>Back to profile</button>
      </div>
    )
  }

  return (
    <>
      <Interview kind="retake" onCompleted={(me, interview) => { setMe(me); setRevealed({ rerollsLeft: interview.rerollsLeft }) }} />
      <button
        className="join-link-btn"
        onClick={async () => { await cancelRetake().catch(() => {}); await refresh(); onDone() }}
      >
        Cancel retake (keep my archetype)
      </button>
    </>
  )
}
