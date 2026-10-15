// The archetype interview, driven by the identity server. The browser only shows the current
// question and sends answers; the conversation lives on the server, so leaving and coming back
// resumes it.
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  answerQuestion, getInterview, restartInterview, startOnboarding, startRetake,
  type Interview as InterviewState, type SignedIn,
} from './api'

interface Props {
  kind: 'onboarding' | 'retake'
  onCompleted: (me: SignedIn, interview: InterviewState) => void
}

// The oracle aims for ~20–28 answers; the bar never claims it's finished
const progressOf = (turn: number) => Math.min(95, Math.round((turn / 24) * 100))

export function Interview({ kind, onCompleted }: Props) {
  const [interview, setInterview] = useState<InterviewState | null>(null)
  const [thinking, setThinking] = useState(true)
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [openText, setOpenText] = useState('')
  const [otherOpen, setOtherOpen] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true          // StrictMode mounts twice: re-arm on every mount
    return () => { alive.current = false }
  }, [])

  async function load(fresh = false) {
    setThinking(true)
    setError(null)
    try {
      let iv: InterviewState | null = null
      if (fresh) iv = (await restartInterview()).interview
      else if (kind === 'onboarding') iv = (await startOnboarding()).interview
      else {
        const active = (await getInterview()).interview
        iv = active?.kind === 'retake' ? active : (await startRetake()).interview
      }
      if (alive.current) setInterview(iv)
    } catch (e) {
      if (alive.current) setError({ message: (e as Error).message, retry: () => load(fresh) })
    } finally {
      if (alive.current) setThinking(false)
    }
  }

  useEffect(() => { load() }, [kind])   // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(answer: string) {
    const text = answer.trim()
    if (!text || !interview || thinking) return
    setThinking(true)
    setError(null)
    try {
      const res = await answerQuestion(interview, text)
      if (!alive.current) return
      setSelected([]); setOpenText(''); setOtherOpen(false)
      if (res.completed && res.me) onCompleted(res.me, res.interview)
      else setInterview(res.interview)
    } catch (e) {
      if (!alive.current) return
      const err = e as ApiError
      if (err.code === 'turn_mismatch' || err.code === 'interview_changed') {
        // Answered in another tab, or the interview moved on: show where it really is
        const current = (await getInterview().catch(() => null))?.interview
        if (current) setInterview(current)
        else await load()
      } else {
        // Nothing was saved: the same answer can be sent again
        setError({ message: err.message, retry: () => submit(text) })
      }
    } finally {
      if (alive.current) setThinking(false)
    }
  }

  const q = interview?.question
  const otherAnswer = openText.trim() ? `Other (write-in): ${openText.trim()}` : ''
  const multiAnswer = [...selected, otherOpen ? otherAnswer : ''].filter(Boolean).join(', ')

  return (
    <div className="quiz-interview">
      <div className="quiz-progress-track">
        <div className="quiz-progress-fill" style={{ width: `${progressOf(interview?.turn ?? 0)}%` }} />
      </div>

      <div className="quiz-question-wrap">
        {thinking || !q ? (
          error ? null : (
            <div className="quiz-thinking">
              <span className="quiz-thinking-dot" /><span className="quiz-thinking-dot" /><span className="quiz-thinking-dot" />
            </div>
          )
        ) : (
          <div className="quiz-question-card">
            <p className="quiz-question-text">{q.question}</p>

            {q.type === 'single' && q.options && (
              <div className="quiz-options">
                {q.options.map(opt => (
                  <button key={opt} className="quiz-option" onClick={() => submit(opt)}>{opt}</button>
                ))}
                <button className={`quiz-option quiz-option--other${otherOpen ? ' quiz-option--selected' : ''}`} onClick={() => setOtherOpen(o => !o)}>
                  Other…
                </button>
              </div>
            )}

            {q.type === 'multi' && q.options && (
              <div className="quiz-options">
                {q.options.map(opt => (
                  <button
                    key={opt}
                    className={`quiz-option${selected.includes(opt) ? ' quiz-option--selected' : ''}`}
                    onClick={() => setSelected(s => s.includes(opt) ? s.filter(o => o !== opt) : [...s, opt])}
                  >
                    {opt}
                  </button>
                ))}
                <button className={`quiz-option quiz-option--other${otherOpen ? ' quiz-option--selected' : ''}`} onClick={() => setOtherOpen(o => !o)}>
                  Other…
                </button>
              </div>
            )}

            {(q.type === 'open' || otherOpen) && (
              <textarea
                className="quiz-textarea"
                placeholder={q.type === 'open' ? 'Type your answer…' : 'Your own answer…'}
                value={openText}
                onChange={e => setOpenText(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || e.shiftKey) return
                  e.preventDefault()
                  submit(q.type === 'open' ? openText : q.type === 'multi' ? multiAnswer : otherAnswer)
                }}
                maxLength={900}
                autoFocus
                rows={q.type === 'open' ? 3 : 2}
              />
            )}

            {q.type === 'open' && (
              <button className="quiz-continue-btn" onClick={() => submit(openText)} disabled={!openText.trim()}>Continue</button>
            )}
            {q.type === 'single' && otherOpen && (
              <button className="quiz-continue-btn" onClick={() => submit(otherAnswer)} disabled={!otherAnswer}>Continue</button>
            )}
            {q.type === 'multi' && (
              <button className="quiz-continue-btn" onClick={() => submit(multiAnswer)} disabled={!multiAnswer}>Continue</button>
            )}
          </div>
        )}

        {error && (
          <div className="quiz-error-box">
            <p className="quiz-error">{error.message}</p>
            {error.retry && <button className="quiz-continue-btn" onClick={error.retry}>Try again</button>}
          </div>
        )}

        {interview && interview.turn > 0 && !thinking && (
          <button className="join-link-btn" onClick={() => { if (confirm('Start the interview over? Your answers so far will be discarded.')) load(true) }}>
            Start over
          </button>
        )}
      </div>
    </div>
  )
}
