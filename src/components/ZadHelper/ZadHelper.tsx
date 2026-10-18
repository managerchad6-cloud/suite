import { useState, useEffect, useRef, useCallback } from 'react'
import { chatWithZad, fetchZadQuota, makeUserMsg, makeModelMsg, type Message, type ZadQuota } from '../../api/zad'
import { ApiError } from '../../api/client'
import { TOUR_STEPS, type PositionKey } from '../../data/zadCorpus'
import { MemberGate, useMemberGate } from '../../identity/gate'
import './ZadHelper.css'

type ZadMode = 'minimized' | 'tour' | 'chat'

// Chat preset positions — tour uses dynamic element-relative positioning
const CHAT_POSITIONS: Record<PositionKey, React.CSSProperties> = {
  'bottom-right':  { bottom: 24, right: 24 },
  'bottom-left':   { bottom: 140, left: 240 },
  'mid-left':      { bottom: '40%', left: 240 },
  'top-left':      { bottom: '75%', left: 240 },
  'bottom-center': { bottom: 24, left: 'calc(50% - 220px)' },
}

// Chat layout: [bubble(260) | gap(10) | sprite(90)] — sprite.left = wrapper.left + 270
const SPRITE_OFFSET  = 270
const DRAG_THRESHOLD = 5
// Estimated sprite height for vertical centering during tour
const SPRITE_EST_H   = 105

function setSpotlight(target: string | null) {
  document.querySelectorAll('.zad-spotlight').forEach(el => el.classList.remove('zad-spotlight'))
  if (target) document.querySelector(`[data-zad-target="${target}"]`)?.classList.add('zad-spotlight')
}

export default function ZadHelper() {
  // The tour is for everyone; chatting with Zad is for members (it runs on our LLM key)
  const gate = useMemberGate()
  const TOUR_DONE_KEY = `zad_tour_done_${gate.wallet ?? 'guest'}`
  const isFirstVisit  = !localStorage.getItem(TOUR_DONE_KEY)

  const [mode, setMode]         = useState<ZadMode>('minimized')
  const [tourStep, setTourStep] = useState(0)
  const [history, setHistory]   = useState<Message[]>([])
  const [response, setResponse] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [input, setInput]       = useState('')
  const [quota, setQuota]       = useState<ZadQuota | null>(null)
  const [position, setPosition] = useState<PositionKey>('bottom-right')

  const [dragPos, setDragPos]       = useState<{ bottom: number; left: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const dragOrigin  = useRef<{ mouseX: number; mouseY: number; elemBottom: number; elemLeft: number } | null>(null)
  const hasDragged  = useRef(false)
  const wrapperRef  = useRef<HTMLDivElement>(null)
  const spriteRef   = useRef<HTMLImageElement>(null)
  const bubbleRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)

  // ── Document drag listeners ────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return
      const dx = e.clientX - dragOrigin.current.mouseX
      const dy = e.clientY - dragOrigin.current.mouseY
      if (!hasDragged.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      hasDragged.current = true
      setDragPos({ bottom: dragOrigin.current.elemBottom - dy, left: dragOrigin.current.elemLeft + dx })
    }
    const onUp = (e: MouseEvent) => {
      if (!dragOrigin.current) return
      const dx = e.clientX - dragOrigin.current.mouseX
      const dy = e.clientY - dragOrigin.current.mouseY
      const wasClick = Math.hypot(dx, dy) < DRAG_THRESHOLD
      dragOrigin.current = null
      setIsDragging(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      if (wasClick && !hasDragged.current) expandFromMinimized()
      hasDragged.current = false
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, textarea, input, a')) return
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    dragOrigin.current = { mouseX: e.clientX, mouseY: e.clientY, elemBottom: window.innerHeight - rect.bottom, elemLeft: rect.left }
    hasDragged.current = false
    setIsDragging(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    e.preventDefault()
  }

  // ── First-visit auto-launch ────────────────────────────────────────────
  useEffect(() => {
    if (!isFirstVisit) return
    const t = setTimeout(() => { setMode('tour'); showTourStep(0) }, 2000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => setSpotlight(null), [])

  // Scroll bubble to top on new response
  useEffect(() => {
    if (bubbleRef.current) bubbleRef.current.scrollTop = 0
  }, [response])

  // ── Tour: dynamic positioning next to the highlighted element ──────────
  const showTourStep = (idx: number) => {
    const step = TOUR_STEPS[idx]
    if (!step) return
    setSpotlight(step.targetNav)
    setResponse(step.script)
    setError('')

    if (step.targetNav) {
      const el = document.querySelector(`[data-zad-target="${step.targetNav}"]`)
      if (el) {
        const rect = el.getBoundingClientRect()
        const elCenterY = rect.top + rect.height / 2
        const spriteTop = elCenterY - SPRITE_EST_H / 2

        let bottom: number
        if (spriteTop < 16) {
          // Nav element is near the top — place sprite below the element instead
          const adjustedTop = rect.bottom + 12
          bottom = Math.max(8, window.innerHeight - adjustedTop - SPRITE_EST_H)
        } else {
          // Normal: vertically center sprite with the nav element
          bottom = Math.max(8, window.innerHeight - (elCenterY + SPRITE_EST_H / 2))
        }

        setDragPos({ bottom, left: rect.right + 8 })
        return
      }
    }
    // No target (welcome / done) — use preset
    setDragPos(null)
    setPosition(step.position)
  }

  const nextStep = () => {
    const next = tourStep + 1
    if (next >= TOUR_STEPS.length) { endTour(); return }
    setTourStep(next)
    showTourStep(next)
  }

  const endTour = () => {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    setSpotlight(null)
    setDragPos(null)
    setPosition('bottom-right')
    setMode('chat')
    setTourStep(0)
    setResponse(TOUR_STEPS[TOUR_STEPS.length - 1].script)
    setHistory([])
  }

  const skipTour = () => {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    setSpotlight(null)
    setDragPos(null)
    setPosition('bottom-right')
    setMode('chat')
    setTourStep(0)
    setResponse("You already know enough to start. The rest reveals itself by doing.")
    setHistory([])
  }

  // ── Expand: compute chat position from minimized sprite position ───────
  const expandFromMinimized = useCallback(() => {
    const done = !!localStorage.getItem(TOUR_DONE_KEY)
    if (!done) {
      setMode('tour')
      showTourStep(0)
    } else {
      // Chat layout: sprite is 270px right of wrapper left. Keep sprite in place.
      setDragPos(prev => prev ? { bottom: prev.bottom, left: prev.left - SPRITE_OFFSET } : prev)
      setMode('chat')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const minimize = () => {
    if (spriteRef.current) {
      const sr = spriteRef.current.getBoundingClientRect()
      setDragPos({ bottom: window.innerHeight - sr.bottom, left: sr.left })
    }
    setSpotlight(null)
    setMode('minimized')
  }

  // ── Free chat ──────────────────────────────────────────────────────────
  // Members get a number of free messages a day (more for $VVC holders); past that, one costs credits
  useEffect(() => {
    if (mode !== 'chat' || !gate.wallet) return
    fetchZadQuota().then(setQuota).catch(() => {})
  }, [mode, gate.wallet])
  const outOfFree = !!quota && quota.left <= 0

  const sendMessage = useCallback(async (pay = false) => {
    const text = input.trim()
    if (!text || loading) return
    if (outOfFree && !pay) return
    setInput('')
    setError('')
    setLoading(true)
    const userMsg  = makeUserMsg(text)
    const nextHist = [...history, userMsg]
    try {
      const r = await chatWithZad(nextHist, { pay })
      setHistory([...nextHist, makeModelMsg(r.text)])
      setResponse(r.text)
      if (r.quota) setQuota(r.quota)
      if (r.balance !== undefined) window.dispatchEvent(new CustomEvent('vvc:credits-changed'))
    } catch (e) {
      setInput(cur => cur || text)                 // nothing was answered: keep what they wrote
      const err = e as ApiError
      const q = err.data?.quota as ZadQuota | undefined
      if (q) setQuota(q)
      setError(err.code === 'zad_quota' ? "That's all of today's free messages."
        : err.code === 'insufficient_credits' ? 'Not enough credits for another message.'
        : err.status === 429 ? 'Zad needs a moment. Try again in a few minutes.'
        : 'Signal interference. Try again.')
    }
    finally { setLoading(false) }
  }, [input, loading, history, outOfFree])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(false) }
  }

  // ── Position styles ────────────────────────────────────────────────────
  const activeStyle: React.CSSProperties = dragPos
    ? { bottom: dragPos.bottom, left: dragPos.left, top: 'auto', right: 'auto' }
    : CHAT_POSITIONS[position]

  const tourTransition = 'bottom 0.55s cubic-bezier(0.25,0.46,0.45,0.94), left 0.55s cubic-bezier(0.25,0.46,0.45,0.94)'
  const transitionStyle: React.CSSProperties = (mode === 'tour' && !isDragging)
    ? { transition: tourTransition }
    : { transition: 'none' }

  const isLastStep = tourStep === TOUR_STEPS.length - 1

  // ── Minimized ─────────────────────────────────────────────────────────
  if (mode === 'minimized') {
    return (
      <div
        ref={wrapperRef}
        className="zad-wrapper zad-wrapper--minimized"
        style={{ ...activeStyle, ...transitionStyle, pointerEvents: 'all', cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={startDrag}
        title="Drag to move · Click to open"
      >
        <img src="/assets/chars/zad.png" alt="Zad" className="zad-sprite" draggable={false} />
      </div>
    )
  }

  // ── Tour — sprite LEFT, bubble RIGHT, no input ─────────────────────────
  if (mode === 'tour') {
    return (
      <div ref={wrapperRef} className="zad-wrapper" style={{ ...activeStyle, ...transitionStyle }} onMouseDown={startDrag}>
        <div className="zad-body-row">
          <div className="zad-sprite-wrap">
            <img ref={spriteRef} src="/assets/chars/zad.png" alt="Zad" className="zad-sprite" draggable={false} />
            <button className="zad-minimize-btn" onClick={minimize} title="Minimize">✕</button>
          </div>
          <div ref={bubbleRef} className="zad-bubble zad-bubble--tour">
            <div className="zad-response">{response}</div>
            {error && <div className="zad-error">{error}</div>}
            <div className="zad-tour-controls">
              <button className="zad-btn zad-btn-skip" onClick={skipTour}>Skip tour</button>
              <button className="zad-btn zad-btn-next" onClick={nextStep}>
                {isLastStep ? 'Done' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Chat — bubble LEFT, sprite RIGHT, input below ──────────────────────
  return (
    <div ref={wrapperRef} className="zad-wrapper" style={{ ...activeStyle, ...transitionStyle }} onMouseDown={startDrag}>
      <div className="zad-body-row">
        <div ref={bubbleRef} className="zad-bubble">
          <div className="zad-response">
            {loading
              ? <span className="zad-dots"><span /><span /><span /></span>
              : response || 'Ask.'}
          </div>
          {error && <div className="zad-error">{error}</div>}
        </div>
        <div className="zad-sprite-wrap">
          <img ref={spriteRef} src="/assets/chars/zad.png" alt="Zad" className="zad-sprite" draggable={false} />
          <button className="zad-minimize-btn" onClick={minimize} title="Minimize">✕</button>
        </div>
      </div>
      <MemberGate reason="talk to Zad" className="zad-input-area">
        <textarea
          ref={inputRef}
          className="zad-input"
          placeholder={outOfFree ? 'Free messages used up for today' : 'Ask Zad…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={1}
        />
        {outOfFree
          ? <button className="zad-send zad-send--paid" onClick={() => sendMessage(true)} disabled={loading || !input.trim()}
              title={`Ask anyway for ${quota!.extraCost} credit${quota!.extraCost === 1 ? '' : 's'}`}>⚡{quota!.extraCost}</button>
          : <button className="zad-send" onClick={() => sendMessage(false)} disabled={loading || !input.trim()} title="Send">↑</button>}
      </MemberGate>
      {quota && (
        <div className={`zad-quota${quota.left <= 3 ? ' zad-quota--low' : ''}`}>
          {quota.left > 0
            ? <>{quota.left} of {quota.limit} free messages left today{quota.tier && <> · {quota.tier}</>}</>
            : <>Free messages refill {new Date(quota.resetsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ⚡{quota.extraCost} per message until then{!quota.tier && <> · holders get more</>}</>}
        </div>
      )}
    </div>
  )
}
