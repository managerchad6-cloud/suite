import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import type { SceneData, CutEntry, LayerDef, ExpressionEvent, WiggleAssignment } from '../api/video'
import { getAssetUrl } from '../api/video'

const FPS    = 25
const WIDTH  = 1080
const HEIGHT = 1920

export interface VideoCanvasHandle {
  play:   () => void
  pause:  () => void
  seek:   (frame: number) => void
  getCurrentFrame: () => number
}

interface Props {
  jobId:       string
  sceneData:   SceneData
  sceneIndex:  number
  playing:     boolean
  onFrameChange?: (frame: number) => void
  onEnded?:    () => void
  style?:      React.CSSProperties
}

// ─── Lerp helpers ─────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function evalKeyframes(kfs: Array<{ frame: number; value: number; easing?: string }>, frame: number): number | null {
  if (!kfs.length) return null
  const sorted = [...kfs].sort((a, b) => a.frame - b.frame)
  if (frame <= sorted[0].frame) return sorted[0].value
  if (frame >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value
  for (let i = 0; i < sorted.length - 1; i++) {
    if (frame >= sorted[i].frame && frame <= sorted[i + 1].frame) {
      const t = (frame - sorted[i].frame) / (sorted[i + 1].frame - sorted[i].frame)
      const eased = sorted[i + 1].easing === 'ease_out' ? 1 - Math.pow(1 - t, 2) : t
      return lerp(sorted[i].value, sorted[i + 1].value, eased)
    }
  }
  return sorted[sorted.length - 1].value
}

function evalWiggle(expr: string, frame: number): number {
  const m = expr.match(/wiggle\(([^,]+),\s*([^)]+)\)/)
  if (!m) return 0
  const amplitude = parseFloat(m[1])
  const frequency = parseFloat(m[2])
  return amplitude * Math.sin(2 * Math.PI * frequency * (frame / FPS))
}

// ─── Image cache ──────────────────────────────────────────────────────────────

const imgCache = new Map<string, HTMLImageElement>()
const ckCache  = new Map<string, HTMLCanvasElement>()

function loadImg(url: string): Promise<HTMLImageElement> {
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url)!)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { imgCache.set(url, img); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

// Exact port of pfp.ts removeBackground — 4-pass chroma-key
const MAX_DIST_SQ = 3 * 255 * 255
const INNER_SQ    = 0.0081 * MAX_DIST_SQ
const OUTER_SQ    = 0.0484 * MAX_DIST_SQ
const INNER_CK    = Math.sqrt(INNER_SQ)
const RANGE_CK    = Math.sqrt(OUTER_SQ) - INNER_CK

function applyChromaKey(img: HTMLImageElement): HTMLCanvasElement {
  const offscreen = document.createElement('canvas')
  offscreen.width  = img.width
  offscreen.height = img.height
  const ctx = offscreen.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
  const d = imageData.data
  const W = offscreen.width, H = offscreen.height
  const alphaF = new Float32Array(W * H)

  // Pass 1: alpha key + despill
  // Skip pixels already transparent — server-side chroma key may have already processed them;
  // re-processing would read transparent pixels as black and incorrectly mark them opaque.
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) {
      alphaF[i >> 2] = 0
      d[i + 3] = 0
      continue
    }
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const dSq = (r - 255) ** 2 + g * g + (b - 255) ** 2
    let alpha: number
    if      (dSq <= INNER_SQ) alpha = 0
    else if (dSq >= OUTER_SQ) alpha = 1
    else                       alpha = (Math.sqrt(dSq) - INNER_CK) / RANGE_CK
    if (alpha < 1) {
      const spill = (1 - alpha) * 255
      d[i]     = Math.max(0, r - spill)
      d[i + 2] = Math.max(0, b - spill)
    }
    alphaF[i >> 2] = alpha
    d[i + 3] = Math.round(alpha * 255)
  }

  // Pass 2: alpha erosion (remove 1-px halo)
  const erodedAlpha = new Float32Array(alphaF)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x
      const a = alphaF[idx]
      if (a === 0) continue
      erodedAlpha[idx] = Math.min(a, alphaF[idx-1], alphaF[idx+1], alphaF[idx-W], alphaF[idx+W])
    }
  }

  // Pass 3: hard-edge despill
  for (let i = 0; i < d.length; i += 4) {
    const px = i >> 2
    if (alphaF[px] < 1) continue
    const eroded = erodedAlpha[px]
    if (eroded > 0.999) continue
    const contamination = Math.max(0, Math.min(d[i], d[i+2]) - d[i+1])
    if (contamination < 8) continue
    d[i]     = Math.max(0, d[i]     - contamination)
    d[i + 2] = Math.max(0, d[i + 2] - contamination)
    erodedAlpha[px] = Math.min(eroded, 1 - contamination / 255)
  }

  for (let i = 0; i < d.length; i += 4) d[i + 3] = Math.round(erodedAlpha[i >> 2] * 255)

  // Pass 4: 1px black inner stroke
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4
      if (d[i + 3] === 0) continue
      if (d[i-4+3] < 50 || d[i+4+3] < 50 || d[i-W*4+3] < 50 || d[i+W*4+3] < 50) {
        d[i] = 0; d[i+1] = 0; d[i+2] = 0
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return offscreen
}

function loadImgCK(url: string): Promise<HTMLCanvasElement> {
  if (ckCache.has(url)) return Promise.resolve(ckCache.get(url)!)
  return loadImg(url).then(img => {
    const keyed = applyChromaKey(img)
    ckCache.set(url, keyed)
    return keyed
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export const VideoCanvas = forwardRef<VideoCanvasHandle, Props>(
  function VideoCanvas({ jobId, sceneData, sceneIndex, playing, onFrameChange, onEnded, style }, ref) {
    const canvasRef    = useRef<HTMLCanvasElement>(null)
    const frameRef     = useRef(0)
    const playingRef   = useRef(playing)
    const rafRef       = useRef<number>(0)
    const lastTimeRef  = useRef<number>(0)
    const audioElsRef  = useRef<Map<number, HTMLAudioElement>>(new Map())
    const firedCuesRef = useRef<Set<number>>(new Set())

    playingRef.current = playing

    // Build expression state map: layer_id → file, updated as frames advance
    const exprStateRef = useRef<Record<string, string>>({})

    // Preload images — background via imgCache, all others also via ckCache
    const preloadImages = useCallback(async () => {
      if (!sceneData) return
      const bgUrl  = sceneData.layer_stack.find(l => l.z_index === 0)
        ? getAssetUrl(jobId, sceneIndex, sceneData.layer_stack.find(l => l.z_index === 0)!.file)
        : null

      const jobs: Promise<unknown>[] = []
      for (const layer of sceneData.layer_stack) {
        const url = getAssetUrl(jobId, sceneIndex, layer.file)
        jobs.push(loadImg(url))
        if (url !== bgUrl) jobs.push(loadImgCK(url))
      }
      for (const skin of sceneData.skins ?? []) {
        const url = getAssetUrl(jobId, sceneIndex, skin.file)
        jobs.push(loadImg(url))
        jobs.push(loadImgCK(url))
      }
      for (const shotKey of Object.keys(sceneData.shots ?? {})) {
        jobs.push(loadImg(getAssetUrl(jobId, sceneIndex, sceneData.shots[shotKey].file)))
      }
      await Promise.allSettled(jobs)
    }, [jobId, sceneIndex, sceneData])

    // Preload audio
    const preloadAudio = useCallback(() => {
      if (!sceneData) return
      audioElsRef.current = new Map()
      firedCuesRef.current = new Set()
      for (const cue of sceneData.audio_cues ?? []) {
        const audio = new Audio(getAssetUrl(jobId, sceneIndex, cue.file))
        audio.preload = 'auto'
        audioElsRef.current.set(cue.start_frame, audio)
      }
    }, [jobId, sceneIndex, sceneData])

    useEffect(() => {
      exprStateRef.current = {}
      preloadImages()
      preloadAudio()
    }, [preloadImages, preloadAudio])

    // ─── Draw one frame ───────────────────────────────────────────────────────

    const drawFrame = useCallback((frame: number) => {
      const canvas = canvasRef.current
      if (!canvas || !sceneData) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Apply expression events up to this frame
      const sortedEvents = [...(sceneData.expression_events ?? [])].sort((a, b) => a.frame - b.frame)
      for (const ev of sortedEvents) {
        if (ev.frame <= frame) exprStateRef.current[`char_${ev.character}`] = ev.file
      }

      // Determine active shot from cut list
      const activeCut = sceneData.cut_list.find(c => frame >= c.start_frame && frame < c.end_frame)
        ?? sceneData.cut_list[0]

      ctx.clearRect(0, 0, WIDTH, HEIGHT)

      // Draw layers in z-order
      const sorted = [...sceneData.layer_stack].sort((a, b) => a.z_index - b.z_index)

      for (const layer of sorted) {
        const fileOverride = exprStateRef.current[layer.id]
        const file         = fileOverride ?? layer.file
        const url          = getAssetUrl(jobId, sceneIndex, file)
        // Background (z=0) draws raw; everything else uses chroma-keyed canvas
        const img: HTMLImageElement | HTMLCanvasElement | undefined =
          layer.z_index === 0 ? imgCache.get(url) : (ckCache.get(url) ?? imgCache.get(url))
        if (!img) continue

        // Keyframe position
        const xKfs = (layer.keyframes ?? []).filter(k => k.property === 'x')
        const yKfs = (layer.keyframes ?? []).filter(k => k.property === 'y')
        const x    = (xKfs.length ? evalKeyframes(xKfs, frame) : null) ?? (layer.position?.[0] ?? WIDTH / 2)
        const y    = (yKfs.length ? evalKeyframes(yKfs, frame) : null) ?? (layer.position?.[1] ?? HEIGHT / 2)

        const scaleX = (layer.scale?.[0] ?? 100) / 100
        const scaleY = (layer.scale?.[1] ?? 100) / 100

        // Wiggle rotation
        let rotation = 0
        const wiggle = (sceneData.wiggle_assignments ?? []).find(
          w => w.layer_id === layer.id && frame >= w.start_frame && frame <= w.end_frame
        )
        if (wiggle?.expression) rotation = evalWiggle(wiggle.expression, frame)

        ctx.save()
        ctx.translate(x, y)
        if (rotation) ctx.rotate((rotation * Math.PI) / 180)
        ctx.scale(scaleX, scaleY)
        ctx.drawImage(img, -img.width / 2, -img.height / 2)
        ctx.restore()
      }
    }, [jobId, sceneIndex, sceneData])

    // ─── Tick (rAF loop) ──────────────────────────────────────────────────────

    const tick = useCallback((timestamp: number) => {
      if (!playingRef.current) return

      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const elapsed = timestamp - lastTimeRef.current

      if (elapsed >= 1000 / FPS) {
        lastTimeRef.current = timestamp - (elapsed % (1000 / FPS))

        const frame = frameRef.current
        drawFrame(frame)
        onFrameChange?.(frame)

        // Fire audio cues
        for (const [startFrame, audio] of audioElsRef.current) {
          if (frame >= startFrame && !firedCuesRef.current.has(startFrame)) {
            audio.currentTime = 0
            audio.play().catch(() => {})
            firedCuesRef.current.add(startFrame)
          }
        }

        if (frame >= (sceneData?.total_frames ?? 0) - 1) {
          onEnded?.()
          return
        }

        frameRef.current = frame + 1
      }

      rafRef.current = requestAnimationFrame(tick)
    }, [drawFrame, onFrameChange, onEnded, sceneData])

    // Start/stop loop
    useEffect(() => {
      if (playing) {
        lastTimeRef.current = 0
        rafRef.current = requestAnimationFrame(tick)
      } else {
        cancelAnimationFrame(rafRef.current)
        // Stop all audio
        for (const audio of audioElsRef.current.values()) {
          audio.pause()
        }
      }
      return () => cancelAnimationFrame(rafRef.current)
    }, [playing, tick])

    // Draw when seeking while paused
    useEffect(() => {
      if (!playing) drawFrame(frameRef.current)
    }, [playing, drawFrame])

    // ─── Imperative handle ────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      play:  () => {},
      pause: () => {},
      seek:  (frame: number) => {
        frameRef.current = Math.max(0, Math.min(frame, (sceneData?.total_frames ?? 0) - 1))
        firedCuesRef.current = new Set()
        for (const audio of audioElsRef.current.values()) audio.pause()
        exprStateRef.current = {}
        drawFrame(frameRef.current)
        onFrameChange?.(frameRef.current)
      },
      getCurrentFrame: () => frameRef.current,
    }), [drawFrame, onFrameChange, sceneData])

    return (
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', ...style }}
      />
    )
  }
)
