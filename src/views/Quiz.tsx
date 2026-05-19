import { useState } from 'react'
import {
  sendMessage, makeUserMessage, makeModelMessage,
  type Message, type QuizQuestion, type QuizResult, type QuizResponse,
} from '../api/quiz'
import { generatePfp } from '../api/pfp'
import { saveQuizEntry, historyToConversation } from '../lib/quizLog'

const CHAR_TEMPLATE: Record<string, string> = {
  gigachad:  'gigachad_template',
  chad:      'chad_template',
  thad:      'thad_template',
  lad:       'lad_template',
  boomer:    'boomer_template',
  brad:      'brad_template',
  basic:     'basic_template',
  neckbeard: 'neckbeard_template',
  incel:     'incel_template',
  wizard:    'wizard_template',
  virgin:    'virgin_template',
  stacy:     'stacy_template',
  tracy:     'tracy_template',
  lacy:      'lacy_template',
  brandy:    'brandy_template',
  veronica:  'veronica_template',
  becky:     'becky_template',
  femcel:    'femcel_template',
  legbeard:  'legbeard_template',
  witch:     'witch_template',
  gad:       'gad_template',
  zad:       'zad_template',
  bad:       'bad_template',
  gizzard:   'gizzard_template',
}

const CHAR_NAME: Record<string, string> = {
  gigachad: 'Gigachad', chad: 'Chad', thad: 'Thad', lad: 'Lad',
  boomer: 'Dad', brad: 'Brad', basic: 'Basic', neckbeard: 'Neckbeard',
  incel: 'Incel', wizard: 'Wizard', virgin: 'Virgin', stacy: 'Stacy',
  tracy: 'Tracy', lacy: 'Lacy', brandy: 'Brandy', veronica: 'Veronica',
  becky: 'Becky', femcel: 'Femcel', legbeard: 'Legbeard', witch: 'Witch',
  gad: 'Gad', zad: 'Zad', bad: 'Bad', gizzard: 'Gizzard',
}

const OPENER: QuizQuestion = {
  done: false,
  type: 'single',
  question: 'First things first — what are you?',
  options: ['Male', 'Female', 'Something else entirely'],
}

type Phase = 'idle' | 'questioning' | 'generating' | 'revealed'

interface RevealData {
  character: string
  attrs: Record<string, string>
  imageUrl: string
}

export function Quiz() {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [history, setHistory]       = useState<Message[]>([])
  const [currentQ, setCurrentQ]     = useState<QuizQuestion | null>(null)
  const [selected, setSelected]     = useState<string[]>([])
  const [openText, setOpenText]     = useState('')
  const [questionCount, setCount]   = useState(0)
  const [reveal, setReveal]         = useState<RevealData | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [thinking, setThinking]     = useState(false)

  const applyResponse = (response: QuizResponse, baseHistory: Message[]) => {
    const modelMsg = makeModelMessage(response)
    const next = [...baseHistory, modelMsg]
    setHistory(next)

    if (response.done) {
      finalize(response as QuizResult, next)
    } else {
      const q = response as QuizQuestion
      setCurrentQ(q)
      setCount(c => c + 1)
      setThinking(false)
    }
  }

  const finalize = async (result: QuizResult, hist: Message[]) => {
    setPhase('generating')
    setCurrentQ(null)

    const template = CHAR_TEMPLATE[result.character] ?? 'basic_template'
    const attrLines = Object.entries(result.attributes).map(([k, v]) => `- ${k}: ${v}`).join('\n')
    const prompt = `You are given a black-and-white line-art template of a cartoon character. Color it with the exact attributes listed below. Keep the same pose, proportions, and body shape. Use bold flat cartoon colors with black outlines, white background. VVC meme-style cartoon illustration.\n\nAttributes:\n${attrLines}\n\nDo not change the pose. Do not add or remove body parts. Only color and add surface details as described.`

    try {
      const imageUrl = await generatePfp(template, prompt)

      const conversation = historyToConversation(hist)
      saveQuizEntry({ conversation, character: result.character, attributes: result.attributes })

      setReveal({ character: result.character, attrs: result.attributes, imageUrl })
      setPhase('revealed')
    } catch (e: any) {
      setError(`Image generation failed: ${e.message}`)
      setPhase('questioning')
      setThinking(false)
    }
  }

  const startQuiz = () => {
    setPhase('questioning')
    setHistory([])
    setCurrentQ(OPENER)
    setCount(1)
    setReveal(null)
    setError(null)
    setThinking(false)
  }

  const submitAnswer = async (answer: string) => {
    const trimmed = answer.trim()
    if (!trimmed || thinking) return

    setSelected([])
    setOpenText('')
    setThinking(true)
    setCurrentQ(null)

    // If this is the first answer, seed history with the opener so Gemini has context
    const base = history.length === 0
      ? [makeModelMessage(OPENER)]
      : history
    const userMsg = makeUserMessage(trimmed)
    const next = [...base, userMsg]
    setHistory(next)

    try {
      const response = await sendMessage(next)
      applyResponse(response, next)
    } catch (e: any) {
      setError(e.message)
      setThinking(false)
    }
  }

  const toggleMulti = (opt: string) =>
    setSelected(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt])

  const reset = () => {
    setPhase('idle')
    setHistory([])
    setCurrentQ(null)
    setSelected([])
    setOpenText('')
    setCount(0)
    setReveal(null)
    setError(null)
    setThinking(false)
  }

  const progress = Math.min(Math.round((questionCount / 15) * 88), 88)

  // ── Idle ──────────────────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div className="quiz-idle">
      <p className="quiz-oracle-label">VVC ARCHETYPE ORACLE</p>
      <h1 className="quiz-idle-title">Who are you, really?</h1>
      <p className="quiz-idle-sub">Answer honestly. The oracle always knows.</p>
      <button className="quiz-start-btn" onClick={startQuiz}>Begin Interview</button>
{error && <p className="quiz-error">{error}</p>}
    </div>
  )

  // ── Generating ────────────────────────────────────────────────────────
  if (phase === 'generating') return (
    <div className="quiz-generating">
      <div className="quiz-gen-ring" />
      <p className="quiz-gen-label">Materializing your archetype…</p>
    </div>
  )

  // ── Revealed ──────────────────────────────────────────────────────────
  if (phase === 'revealed' && reveal) {
    const name = CHAR_NAME[reveal.character] ?? reveal.character
    return (
      <div className="quiz-reveal">
        <p className="quiz-oracle-label">YOU ARE</p>
        <h2 className="quiz-reveal-char">{name}</h2>
        <img src={reveal.imageUrl} alt={name} className="quiz-reveal-img" />
        <div className="quiz-reveal-attrs">
          {Object.entries(reveal.attrs).map(([k, v]) => (
            <span key={k} className="pfp-attr-tag">
              <span className="pfp-attr-key">{k}</span> {v}
            </span>
          ))}
        </div>
        <div className="quiz-reveal-actions">
          <a href={reveal.imageUrl} download={`${reveal.character}_pfp.jpg`} className="pfp-modal-download">
            Download PFP
          </a>
          <button className="quiz-retake-btn" onClick={reset}>Retake</button>
        </div>
      </div>
    )
  }

  // ── Questioning ───────────────────────────────────────────────────────
  return (
    <div className="quiz-interview">
      <div className="quiz-progress-track">
        <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="quiz-question-wrap">
        {thinking && !currentQ ? (
          <div className="quiz-thinking">
            <span className="quiz-thinking-dot" /><span className="quiz-thinking-dot" /><span className="quiz-thinking-dot" />
          </div>
        ) : currentQ ? (
          <div className="quiz-question-card">
            <p className="quiz-question-text">{currentQ.question}</p>

            {currentQ.type === 'single' && currentQ.options && (
              <div className="quiz-options">
                {currentQ.options.map(opt => (
                  <button key={opt} className="quiz-option" onClick={() => submitAnswer(opt)}>
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {currentQ.type === 'multi' && currentQ.options && (
              <>
                <div className="quiz-options">
                  {currentQ.options.map(opt => (
                    <button
                      key={opt}
                      className={`quiz-option${selected.includes(opt) ? ' quiz-option--selected' : ''}`}
                      onClick={() => toggleMulti(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <button
                  className="quiz-continue-btn"
                  onClick={() => submitAnswer(selected.join(', '))}
                  disabled={selected.length === 0}
                >
                  Continue
                </button>
              </>
            )}

            {currentQ.type === 'open' && (
              <>
                <textarea
                  className="quiz-textarea"
                  placeholder="Type your answer…"
                  value={openText}
                  onChange={e => setOpenText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnswer(openText) }
                  }}
                  autoFocus
                  rows={3}
                />
                <button
                  className="quiz-continue-btn"
                  onClick={() => submitAnswer(openText)}
                  disabled={!openText.trim()}
                >
                  Continue
                </button>
              </>
            )}

            {error && <p className="quiz-error">{error}</p>}
          </div>
        ) : null}
      </div>
    </div>
  )
}
