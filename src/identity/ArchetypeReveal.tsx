// "You are …": the profile an interview produced. The archetype is already final (you're a member);
// the generated image arrives in the background, with the stock art shown until then.
import { useState } from 'react'
import { useIdentity } from './IdentityProvider'
import { reroll, requestPortrait, retryAvatar, type Profile } from './api'
import { archetypeName } from './archetypes'

interface Props {
  profile: Profile
  /** Rerolls left for the interview that produced this profile (null: unknown, hide reroll) */
  rerollsLeft: number | null
  onRerolled?: (rerollsLeft: number | null) => void
  /** Primary action label + handler, e.g. "Enter the suite" */
  doneLabel?: string
  onDone?: () => void
}

export function ArchetypeReveal({ profile, rerollsLeft, onRerolled, doneLabel, onDone }: Props) {
  const { setMe } = useIdentity()
  const [busy, setBusy] = useState<null | 'reroll' | 'retry' | 'portrait'>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)

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
  const avatar = profile.avatar

  return (
    <div className="quiz-reveal">
      <div className="quiz-reveal-header">
        <p className="quiz-oracle-label">YOU ARE</p>
        <h2 className="quiz-reveal-char">{name}</h2>
      </div>

      <div className="quiz-reveal-body">
        <div className="quiz-reveal-left">
          <div className="join-reveal-img-wrap">
            <img src={avatar.url ?? profile.fallbackImageUrl} alt={name} className="quiz-reveal-img" />
            {avatar.status === 'generating' && (
              <div className="join-img-status"><div className="quiz-gen-ring" /><span>Painting your character…</span></div>
            )}
          </div>
          {avatar.status === 'failed' && (
            <div className="join-img-failed">
              <span>{avatar.error ?? 'Image generation failed.'}</span>
              <button className="quiz-portrait-btn" onClick={() => run('retry')} disabled={!!busy}>
                {busy === 'retry' ? 'Retrying…' : 'Retry image'}
              </button>
            </div>
          )}
          {profile.portrait.url && (
            <div className="quiz-portrait-result">
              <p className="quiz-portrait-label">Profile Picture</p>
              <img src={profile.portrait.url} alt="Profile picture" className="quiz-portrait-img" />
              <a href={profile.portrait.url} download={`${profile.archetype}_portrait`} className="pfp-modal-download">Download Portrait</a>
            </div>
          )}
        </div>

        <div className="quiz-reveal-right">
          <p className="quiz-reveal-desc">{profile.description}</p>

          <div className="quiz-reveal-attrs">
            {Object.entries(profile.attributes).map(([k, v]) => (
              <span key={k} className="pfp-attr-tag"><span className="pfp-attr-key">{k}</span> {v}</span>
            ))}
          </div>

          <div className="quiz-reveal-actions">
            {onDone && <button className="quiz-start-btn" onClick={onDone}>{doneLabel ?? 'Done'}</button>}
            {avatar.status === 'ready' && profile.portrait.status !== 'ready' && (
              <button className="quiz-portrait-btn" onClick={() => run('portrait')} disabled={!!busy || profile.portrait.status === 'generating'}>
                {profile.portrait.status === 'generating' || busy === 'portrait' ? 'Generating PFP…' : 'Generate PFP'}
              </button>
            )}
            {avatar.url && <a href={avatar.url} download={profile.archetype} className="pfp-modal-download">Download</a>}
          </div>

          {rerollsLeft !== null && rerollsLeft > 0 && (
            <div className="quiz-regen-wrap">
              <textarea
                className="quiz-regen-input"
                placeholder={`Optional: what didn't fit? (${rerollsLeft} reroll${rerollsLeft !== 1 ? 's' : ''} left)`}
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                maxLength={500}
                rows={2}
              />
              <button className="quiz-regen-btn" onClick={() => run('reroll')} disabled={!!busy}>
                {busy === 'reroll' ? 'Rolling…' : `Roll Again (${rerollsLeft} left)`}
              </button>
            </div>
          )}

          {error && <p className="quiz-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
