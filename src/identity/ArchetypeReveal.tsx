// "You are …": the profile an interview produced. The archetype is final at once (you're a member);
// the images follow in the background: first the full character is painted, then the round
// profile picture is framed from it. This screen says which step it's on and how long it usually
// takes, shows the stock art as a sketch until the real one lands, then reveals each image.
import { useEffect, useRef, useState } from 'react'
import { useIdentity } from './IdentityProvider'
import { reroll, requestPortrait, retryAvatar, type Profile } from './api'
import { archetypeName } from './archetypes'
import { CHARACTERS } from '../data/characterLore'
import { Confetti } from '../components/Confetti'
import './reveal.css'

interface Props {
  profile: Profile
  /** Rerolls left for the interview that produced this profile (null: unknown, hide reroll) */
  rerollsLeft: number | null
  onRerolled?: (rerollsLeft: number | null) => void
  /** Primary action label + handler, e.g. "Enter the suite" */
  doneLabel?: string
  onDone?: () => void
}

type Stage = 'painting' | 'framing' | 'done' | 'avatar-failed' | 'portrait-failed'

function stageOf(p: Profile): Stage {
  if (p.avatar.status === 'failed') return 'avatar-failed'
  if (p.avatar.status !== 'ready') return 'painting'
  if (p.portrait.status === 'ready') return 'done'
  if (p.portrait.status === 'failed') return 'portrait-failed'
  return 'framing'                     // generating, or queued a moment after the avatar landed
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Seconds since `key` last changed */
function useElapsed(key: string) {
  const since = useRef(Date.now())
  const [, tick] = useState(0)
  useEffect(() => { since.current = Date.now() }, [key])
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.floor((Date.now() - since.current) / 1000)
}

const STEPS: { id: 'archetype' | 'painting' | 'framing'; label: string; hint: string }[] = [
  { id: 'archetype', label: 'Archetype assigned', hint: 'The Oracle has spoken' },
  { id: 'painting',  label: 'Painting your character', hint: 'Your answers, drawn into the art' },
  { id: 'framing',   label: 'Framing your profile picture', hint: 'The round PFP everyone sees' },
]

export function ArchetypeReveal({ profile, rerollsLeft, onRerolled, doneLabel, onDone }: Props) {
  const { setMe } = useIdentity()
  const [busy, setBusy] = useState<null | 'reroll' | 'retry' | 'portrait'>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)
  const [justRevealed, setJustRevealed] = useState<null | 'avatar' | 'portrait'>(null)

  const stage = stageOf(profile)
  const elapsed = useElapsed(`${stage}:${profile.updatedAt ?? ''}`)
  const prevStage = useRef(stage)

  // Celebrate each image as it lands (not when the screen opens on an already-finished profile)
  useEffect(() => {
    const prev = prevStage.current
    prevStage.current = stage
    if (prev === stage) return
    if (stage === 'done') { setJustRevealed('portrait'); setBurst(b => b + 1) }
    else if (prev === 'painting' && stage === 'framing') { setJustRevealed('avatar'); setBurst(b => b + 1) }
  }, [stage])
  useEffect(() => {
    if (!justRevealed) return
    const t = setTimeout(() => setJustRevealed(null), 1600)
    return () => clearTimeout(t)
  }, [justRevealed])

  async function run(kind: 'reroll' | 'retry' | 'portrait') {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'reroll') {
        const res = await reroll(feedback.trim() || undefined)
        setMe(res.me)
        setFeedback('')
        onRerolled?.(res.interview.rerollsLeft)
      } else {
        setMe((kind === 'retry' ? await retryAvatar() : await requestPortrait()).me)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const name = archetypeName(profile.archetype)
  const char = CHARACTERS.find(c => c.key === profile.archetype)
  const working = stage === 'painting' || stage === 'framing'
  const stepState = (id: (typeof STEPS)[number]['id']) => {
    if (id === 'archetype') return 'done'
    if (id === 'painting') return stage === 'painting' ? 'active' : stage === 'avatar-failed' ? 'failed' : 'done'
    return stage === 'done' ? 'done' : stage === 'framing' ? 'active' : stage === 'portrait-failed' ? 'failed' : 'todo'
  }

  return (
    <div className="rv">
      {burst > 0 && <Confetti key={burst} pieces={justRevealed === 'portrait' ? 110 : 70} />}

      <header className="rv-head">
        <p className="rv-kicker">The Oracle has spoken · you are</p>
        <h2 className="rv-name">
          {profile.title && <span className="rv-title">{profile.title}</span>}
          <span className="rv-arch">{name}</span>
        </h2>
        {char && <p className="rv-tagline">“{char.tagline}”</p>}
      </header>

      <div className="rv-body">
        {/* ── Images ── */}
        <div className="rv-visual">
          <div className={`rv-art${stage === 'painting' ? ' rv-art--sketch' : ''}${justRevealed === 'avatar' ? ' rv-art--reveal' : ''}`}>
            <img src={profile.avatar.url ?? profile.fallbackImageUrl} alt={name} />
            {stage === 'painting' && <div className="rv-scan" aria-hidden />}
            {stage === 'painting' && <span className="rv-art-note">Sketch · your version is being painted</span>}
          </div>

          <div className={`rv-pfp${profile.portrait.url ? ' rv-pfp--ready' : ''}${justRevealed === 'portrait' ? ' rv-pfp--reveal' : ''}`}
            title="Your profile picture">
            {profile.portrait.url
              ? <img src={profile.portrait.url} alt="Your profile picture" />
              : <div className={`rv-pfp-wait${stage === 'framing' ? ' rv-pfp-wait--active' : ''}`}><span>PFP</span></div>}
          </div>
        </div>

        {/* ── Progress + details ── */}
        <div className="rv-side">
          <ol className="rv-steps" aria-live="polite">
            {STEPS.map(s => {
              const st = stepState(s.id)
              return (
                <li key={s.id} className={`rv-step rv-step--${st}`}>
                  <span className="rv-step-dot" aria-hidden>{st === 'done' ? '✓' : st === 'failed' ? '!' : ''}</span>
                  <span className="rv-step-text">
                    <span className="rv-step-label">{s.label}</span>
                    <span className="rv-step-hint">
                      {st === 'active' ? `${s.hint} · ${mmss(elapsed)}` : st === 'failed' ? 'Didn’t work this time' : s.hint}
                    </span>
                  </span>
                  {st === 'active' && <span className="rv-step-spin" aria-hidden />}
                </li>
              )
            })}
          </ol>

          {working && (
            <p className="rv-eta">
              {stage === 'painting' ? 'Usually takes 1–3 minutes.' : 'Almost there, usually under a minute.'}{' '}
              {onDone && 'You can go in now. It keeps going in the background and we’ll tell you when it’s ready.'}
            </p>
          )}
          {stage === 'done' && <p className="rv-eta rv-eta--done">Your profile picture is live everywhere: chat, comments, your profile.</p>}

          {stage === 'avatar-failed' && (
            <div className="rv-fail">
              <span>{profile.avatar.error ?? 'Painting the character failed.'}</span>
              <button className="rv-btn" onClick={() => run('retry')} disabled={!!busy}>{busy === 'retry' ? 'Retrying…' : 'Try again'}</button>
            </div>
          )}
          {stage === 'portrait-failed' && (
            <div className="rv-fail">
              <span>{profile.portrait.error ?? 'Framing the profile picture failed.'}</span>
              <button className="rv-btn" onClick={() => run('portrait')} disabled={!!busy}>{busy === 'portrait' ? 'Retrying…' : 'Try again'}</button>
            </div>
          )}

          <p className="rv-desc">{profile.description}</p>

          {Object.keys(profile.attributes).length > 0 && (
            <details className="rv-attrs">
              <summary>What went into your picture</summary>
              <div className="rv-attr-list">
                {Object.entries(profile.attributes).map(([k, v]) => (
                  <span key={k} className="rv-attr"><b>{k}</b> {v}</span>
                ))}
              </div>
            </details>
          )}

          <div className="rv-actions">
            {onDone && <button className="rv-primary" onClick={onDone}>{doneLabel ?? 'Done'}{working ? ' →' : ''}</button>}
            {profile.portrait.url && <a href={profile.portrait.url} download={`${profile.archetype}_pfp`} className="rv-link">Download PFP</a>}
            {profile.avatar.url && <a href={profile.avatar.url} download={profile.archetype} className="rv-link">Download full art</a>}
          </div>

          {rerollsLeft !== null && rerollsLeft > 0 && (
            <details className="rv-reroll">
              <summary>Not you? Roll again ({rerollsLeft} left)</summary>
              <textarea
                className="rv-reroll-input"
                placeholder="Optional: what didn't fit?"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                maxLength={500}
                rows={2}
              />
              <button className="rv-btn" onClick={() => run('reroll')} disabled={!!busy}>
                {busy === 'reroll' ? 'Rolling…' : 'Roll again'}
              </button>
            </details>
          )}

          {error && <p className="quiz-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
