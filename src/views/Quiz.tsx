import { useState, useEffect } from 'react'
import {
  sendMessage, makeUserMessage, makeModelMessage,
  type Message, type QuizQuestion, type QuizResult, type QuizResponse,
} from '../api/quiz'
import { generatePfp, generatePortraitPfp, LEGENDARY_CHARS } from '../api/pfp'
import { saveQuizEntry, saveProfile, loadProfile, historyToConversation } from '../lib/quizLog'

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

const MAX_REGENS = 3

type Phase = 'idle' | 'questioning' | 'generating' | 'revealed'

interface RevealData {
  character: string
  description: string
  attrs: Record<string, string>
  imageUrl: string
}

interface Props { address: string }

export function Quiz({ address }: Props) {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [history, setHistory]       = useState<Message[]>([])
  const [currentQ, setCurrentQ]     = useState<QuizQuestion | null>(null)
  const [selected, setSelected]     = useState<string[]>([])
  const [openText, setOpenText]     = useState('')
  const [questionCount, setCount]   = useState(0)
  const [reveal, setReveal]         = useState<RevealData | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [thinking, setThinking]     = useState(false)
  const [portraitUrl, setPortraitUrl]         = useState<string | null>(null)
  const [portraitLoading, setPortraitLoading] = useState(false)
  const [regenCount, setRegenCount] = useState(0)
  const [regenText, setRegenText]   = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [savedProfile, setSavedProfile] = useState<RevealData | null>(null)

  useEffect(() => {
    loadProfile(address).then(p => {
      if (p) setSavedProfile({
        character:   p.character,
        description: p.description,
        attrs:       p.attributes,
        imageUrl:    `/assets/chars/${p.character}.png`,
      })
    })
  }, [address])

  const buildPrompt = (result: QuizResult) => {
    const attrLines = Object.entries(result.attributes).map(([k, v]) => `- ${k}: ${v}`).join('\n')
    return `You are given a black-and-white line-art template of a cartoon character. Color it with the exact attributes listed below. Keep the same pose, proportions, and body shape. Use bold flat cartoon colors with black outlines, white background. VVC meme-style cartoon illustration.\n\nAttributes:\n${attrLines}\n\nDo not change the pose. Do not add or remove body parts. Only color and add surface details as described.`
  }

  const applyResponse = (response: QuizResponse, baseHistory: Message[]) => {
    const modelMsg = makeModelMessage(response)
    const next = [...baseHistory, modelMsg]
    setHistory(next)
    if (response.done) {
      finalize(response as QuizResult, next)
    } else {
      setCurrentQ(response as QuizQuestion)
      setCount(c => c + 1)
      setThinking(false)
    }
  }

  const finalize = async (result: QuizResult, hist: Message[]) => {
    setPhase('generating')
    setCurrentQ(null)
    const template = CHAR_TEMPLATE[result.character] ?? 'basic_template'
    try {
      const imageUrl = await generatePfp(template, buildPrompt(result))
      const conversation = historyToConversation(hist)
      saveQuizEntry({ conversation, character: result.character, attributes: result.attributes })
      saveProfile({ walletAddress: address, character: result.character, description: result.description, attributes: result.attributes })
      setReveal({ character: result.character, description: result.description, attrs: result.attributes, imageUrl })
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
    setPortraitUrl(null)
    setPortraitLoading(false)
    setRegenCount(0)
    setRegenText('')
  }

  const submitAnswer = async (answer: string) => {
    const trimmed = answer.trim()
    if (!trimmed || thinking) return
    setSelected([])
    setOpenText('')
    setThinking(true)
    setCurrentQ(null)
    const base = history.length === 0 ? [makeModelMessage(OPENER)] : history
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

  const handleRegen = async () => {
    if (!reveal || regenCount >= MAX_REGENS) return
    setRegenLoading(true)
    setPortraitUrl(null)
    const feedback = regenText.trim()
    const regenMsg = feedback
      ? `Assign me a different character archetype that also fits this interview. I didn't like the last result for this reason: "${feedback}". Take that into account. Output only the final JSON result (done:true) with a new description and attributes.`
      : `Assign me a different character archetype that also fits this interview — pick the next best fit. Output only the final JSON result (done:true) with a new description and attributes.`
    const userMsg = makeUserMessage(regenMsg)
    const next = [...history, userMsg]
    setHistory(next)
    try {
      const response = await sendMessage(next)
      const modelMsg = makeModelMessage(response)
      setHistory([...next, modelMsg])
      if (response.done) {
        setRegenCount(c => c + 1)
        setRegenText('')
        const result = response as QuizResult
        const template = CHAR_TEMPLATE[result.character] ?? 'basic_template'
        setPhase('generating')
        const imageUrl = await generatePfp(template, buildPrompt(result))
        saveProfile({ walletAddress: address, character: result.character, description: result.description, attributes: result.attributes })
        setReveal({ character: result.character, description: result.description, attrs: result.attributes, imageUrl })
        setPhase('revealed')
      }
    } catch (e: any) {
      setError(`Regeneration failed: ${e.message}`)
    } finally {
      setRegenLoading(false)
    }
  }

  const handleGeneratePortrait = async () => {
    if (!reveal) return
    setPortraitLoading(true)
    setPortraitUrl(null)
    try {
      const url = await generatePortraitPfp(reveal.imageUrl, LEGENDARY_CHARS.has(reveal.character))
      setPortraitUrl(url)
    } catch (e: any) {
      setError(`Portrait generation failed: ${e.message}`)
    } finally {
      setPortraitLoading(false)
    }
  }

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
    setPortraitUrl(null)
    setPortraitLoading(false)
    setRegenCount(0)
    setRegenText('')
    setRegenLoading(false)
  }

  const toggleMulti = (opt: string) =>
    setSelected(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt])

  const progress = Math.min(Math.round((questionCount / 15) * 88), 88)

  // ── Idle ──────────────────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div className="quiz-idle">
      <p className="quiz-oracle-label">VVC ARCHETYPE ORACLE</p>
      <h1 className="quiz-idle-title">Who are you, really?</h1>
      <p className="quiz-idle-sub">Answer honestly. The oracle always knows.</p>
      {savedProfile && (
        <div className="quiz-saved-profile">
          <p className="quiz-saved-label">Your archetype</p>
          <img src={savedProfile.imageUrl} alt={savedProfile.character} className="quiz-saved-img" />
          <p className="quiz-saved-char">{CHAR_NAME[savedProfile.character] ?? savedProfile.character}</p>
          <p className="quiz-saved-desc">{savedProfile.description}</p>
        </div>
      )}
      <button className="quiz-start-btn" onClick={startQuiz}>
        {savedProfile ? 'Retake Interview' : 'Begin Interview'}
      </button>
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
        <div className="quiz-reveal-header">
          <p className="quiz-oracle-label">YOU ARE</p>
          <h2 className="quiz-reveal-char">{name}</h2>
        </div>

        <div className="quiz-reveal-body">
          {/* Left: images */}
          <div className="quiz-reveal-left">
            <img src={reveal.imageUrl} alt={name} className="quiz-reveal-img" />
            {portraitLoading && <div className="quiz-gen-ring quiz-portrait-spinner" />}
            {portraitUrl && (
              <div className="quiz-portrait-result">
                <p className="quiz-portrait-label">Profile Picture</p>
                <img src={portraitUrl} alt="Profile picture" className="quiz-portrait-img" />
                <a href={portraitUrl} download={`${reveal.character}_portrait.jpg`} className="pfp-modal-download">
                  Download Portrait
                </a>
              </div>
            )}
          </div>

          {/* Right: description + attrs + actions */}
          <div className="quiz-reveal-right">
            <p className="quiz-reveal-desc">{reveal.description}</p>

            <div className="quiz-reveal-attrs">
              {Object.entries(reveal.attrs).map(([k, v]) => (
                <span key={k} className="pfp-attr-tag">
                  <span className="pfp-attr-key">{k}</span> {v}
                </span>
              ))}
            </div>

            <div className="quiz-reveal-actions">
              <button
                className="quiz-portrait-btn"
                onClick={handleGeneratePortrait}
                disabled={portraitLoading}
              >
                {portraitLoading ? 'Generating…' : 'Generate PFP'}
              </button>
              <a href={reveal.imageUrl} download={`${reveal.character}.jpg`} className="pfp-modal-download">
                Download
              </a>
              <button className="quiz-retake-btn" onClick={reset}>New Interview</button>
            </div>

            {regenCount < MAX_REGENS && (
              <div className="quiz-regen-wrap">
                <textarea
                  className="quiz-regen-input"
                  placeholder={`Optional: what didn't fit? (${MAX_REGENS - regenCount} reroll${MAX_REGENS - regenCount !== 1 ? 's' : ''} left)`}
                  value={regenText}
                  onChange={e => setRegenText(e.target.value)}
                  rows={2}
                />
                <button
                  className="quiz-regen-btn"
                  onClick={handleRegen}
                  disabled={regenLoading}
                >
                  {regenLoading ? 'Rolling…' : `Roll Again (${MAX_REGENS - regenCount} left)`}
                </button>
              </div>
            )}

            {error && <p className="quiz-error">{error}</p>}
          </div>
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
