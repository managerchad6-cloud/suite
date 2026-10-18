import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHARACTERS, EXTENDED_CAST, type CharData } from '../data/characterLore'
import { editCharacter, editLayer, inActionCharacter, reskinCharacterInScene, generativeExpand } from '../api/pfp'
import { publishHandmade, saveDraft, deleteDraftById, type DraftPayload } from '../api/memes'
import { fetchXStatus, postXTweet, X_AUTH_URL } from '../api/twitter'
import { fetchRemixDraft } from '../api/studio'
import { saveSkin, fetchCharSkins, skinImageUrl, type SkinRecord } from '../api/skins'
import { truncateAddress } from '../wallet'
import { useMemberGate } from '../identity/gate'
import { saveSession, loadSession, clearSession, type SessionSnapshot } from '../lib/studioDb'
import { StudioHome } from './StudioHome'
import { deductCredits, type CreditAction } from '../api/credits'
import { hasUserGeminiKey, setAiTicket } from '../api/pfp'
import { generateMemeLabels } from '../api/zad'
import { BuyCreditsModal } from '../components/BuyCreditsModal'
import { GeminiKeyModal } from '../components/GeminiKeyModal'
import { memeLink } from '../lib/links'
import '../studio.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool       = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'grab' | 'text' | 'line' | 'polygon' | 'crop' | 'wand' | 'lasso' | 'marquee' | 'flip'
type BrushShape = 'circle' | 'square' | 'soft'
type GrabHandle = 'move' | 'tl' | 'tr' | 'br' | 'bl' | 'n' | 's' | 'e' | 'w' | 'rotate'
type Mode       = 'art' | 'text'

interface Layer { id: string; name: string; visible: boolean; opacity: number }

interface LayerTransform {
  tx: number; ty: number
  scaleX: number; scaleY: number
  rotation: number
}

interface BBox { x: number; y: number; w: number; h: number }
interface PolygonMeta {
  vertices: [number, number][]
  strokeOn: boolean; strokeColor: string; strokeWidth: number
  fillOn: boolean;   fillColor: string
}
type HistoryEntry =
  | { type: 'pixel'; layerId: string; before: ImageData }
  | { type: 'structure'; layers: Layer[]; transforms: Record<string, LayerTransform>; bboxes: Record<string, BBox>; textLayers: Record<string, TextMeta>; charLayers: Record<string, CharMeta>; polyLayers: Record<string, PolygonMeta> }
interface CharMeta {
  charKey: string; charName: string; charFile: string; charGroup?: string
  dropX?: number; dropY?: number; dropW?: number; dropH?: number
}

const POLY_PRESETS = [
  { label: '▲', sides: 3, angle: -Math.PI / 2 },
  { label: '■', sides: 4, angle: -Math.PI / 4 },
  { label: '⬠', sides: 5, angle: -Math.PI / 2 },
  { label: '⬡', sides: 6, angle: 0 },
  { label: '⬢', sides: 8, angle: -Math.PI / 8 },
] as const

type TextAlign = 'left' | 'center' | 'right' | 'justify'

interface TextMeta {
  text: string
  x: number; y: number
  fontFamily: string; fontSize: number; color: string
  w?: number
  textAlign?: TextAlign
  subtype?: 'title' | 'label'
  linkedCharId?: string
  bgColor?: string
}

interface TextInput {
  x: number; y: number                       // canvas coords (used on commit)
  screenX: number; screenY: number           // overlay top-left in viewport px
  value: string
  w?: number                                 // canvas wrap width
  screenW?: number; screenH?: number         // overlay dimensions in viewport px
  screenRotation?: number                    // CSS rotate in radians
  screenFontSize?: number                    // exact CSS font size to match rendered text
  textAlign?: TextAlign
  subtype?: 'title' | 'label'
  editingLayerId?: string
  linkedCharId?: string
  autoCommitText?: string                    // magic label: skip input overlay, commit directly
}

interface MagicLabelSet {
  labels: string[]
  used: number
}

interface TextDrag { x: number; y: number; x2: number; y2: number }

const ALL_CHARS = [...CHARACTERS, ...EXTENDED_CAST]

function charImgSrc(char: CharData): string {
  const folder = char.group === 'extended' ? '/assets/cast' : '/assets/chars'
  return `${folder}/${char.file}.${char.ext ?? 'png'}`
}

const IDENTITY_TF: LayerTransform = { tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotation: 0 }
const DEFAULT_W = 1200
const DEFAULT_H = 800
const DROP_SIZE  = 400

const TEXT_FONTS = [
  { id: 'Impact',          label: 'Impact'   },
  { id: 'Friendszone',     label: 'FriendZ'  },
  { id: 'Arial',           label: 'Arial'    },
  { id: '"Comic Sans MS"', label: 'Comic'    },
  { id: 'Georgia',         label: 'Georgia'  },
  { id: '"Courier New"',   label: 'Courier'  },
]

// ─── Flood fill ───────────────────────────────────────────────────────────────

function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, fillStr: string, tolerance = 32) {
  const { width: W, height: H } = ctx.canvas
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const i0 = (sy * W + sx) * 4
  const [tR, tG, tB, tA] = [d[i0], d[i0+1], d[i0+2], d[i0+3]]
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = 1
  const tc = tmp.getContext('2d')!
  tc.fillStyle = fillStr; tc.fillRect(0, 0, 1, 1)
  const fc = tc.getImageData(0, 0, 1, 1).data
  const [fR, fG, fB, fA] = [fc[0], fc[1], fc[2], fc[3]]
  if (tR===fR && tG===fG && tB===fB && tA===fA) return
  const T = tolerance
  const match = (i: number) =>
    Math.abs(d[i]-tR)<=T && Math.abs(d[i+1]-tG)<=T &&
    Math.abs(d[i+2]-tB)<=T && Math.abs(d[i+3]-tA)<=T
  const visited = new Uint8Array(W * H)
  const stack = [sx + sy * W]
  while (stack.length) {
    const pos = stack.pop()!
    const x = pos % W, y = (pos / W) | 0
    if (x < 0 || x >= W || y < 0 || y >= H || visited[pos]) continue
    const i = pos * 4
    if (!match(i)) continue
    visited[pos] = 1
    d[i]=fR; d[i+1]=fG; d[i+2]=fB; d[i+3]=fA
    stack.push(pos+1, pos-1, pos+W, pos-W)
  }
  ctx.putImageData(img, 0, 0)
}

function floodFillMask(ctx: CanvasRenderingContext2D, sx: number, sy: number, tolerance: number): HTMLCanvasElement {
  const { width: W, height: H } = ctx.canvas
  const src = ctx.getImageData(0, 0, W, H).data
  const si = (sy * W + sx) * 4
  const [tR, tG, tB, tA] = [src[si], src[si+1], src[si+2], src[si+3]]
  const maskCanvas = makeCanvas(W, H)
  const mctx = maskCanvas.getContext('2d')!
  const mdata = mctx.createImageData(W, H)
  const d = mdata.data
  const visited = new Uint8Array(W * H)
  const stack = [sx + sy * W]
  while (stack.length) {
    const pos = stack.pop()!
    const px = pos % W, py = (pos / W) | 0
    if (px < 0 || px >= W || py < 0 || py >= H || visited[pos]) continue
    const i = pos * 4
    if (Math.abs(src[i]-tR) > tolerance || Math.abs(src[i+1]-tG) > tolerance ||
        Math.abs(src[i+2]-tB) > tolerance || Math.abs(src[i+3]-tA) > tolerance) continue
    visited[pos] = 1
    d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 255
    stack.push(pos+1, pos-1, pos+W, pos-W)
  }
  mctx.putImageData(mdata, 0, 0)
  return maskCanvas
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function computeBBox(canvas: HTMLCanvasElement): BBox | null {
  const { width: W, height: H } = canvas
  if (!W || !H) return null
  const d = canvas.getContext('2d')!.getImageData(0, 0, W, H).data
  let minX = W, minY = H, maxX = -1, maxY = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 4) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

function inverseTransformPt(mx: number, my: number, bbox: BBox, tf: LayerTransform) {
  const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
  const dx = mx - (cx + tf.tx), dy = my - (cy + tf.ty)
  const r = -tf.rotation
  const rx = dx * Math.cos(r) - dy * Math.sin(r)
  const ry = dx * Math.sin(r) + dy * Math.cos(r)
  return {
    x: tf.scaleX === 0 ? cx : rx / tf.scaleX + cx,
    y: tf.scaleY === 0 ? cy : ry / tf.scaleY + cy,
  }
}

function bboxCorners(bbox: BBox, tf: LayerTransform): [number, number][] {
  const cx = bbox.x + bbox.w / 2 + tf.tx
  const cy = bbox.y + bbox.h / 2 + tf.ty
  const hw = bbox.w / 2 * tf.scaleX
  const hh = bbox.h / 2 * tf.scaleY
  const cos = Math.cos(tf.rotation), sin = Math.sin(tf.rotation)
  const rp = (lx: number, ly: number): [number, number] => [
    cx + lx * cos - ly * sin,
    cy + lx * sin + ly * cos,
  ]
  return [rp(-hw,-hh), rp(hw,-hh), rp(hw,hh), rp(-hw,hh)]
}

function rotateHandlePt(corners: [number, number][]): [number, number] {
  const [tl, tr, br, bl] = corners
  const tcx = (tl[0]+tr[0])/2, tcy = (tl[1]+tr[1])/2
  const cx = (tl[0]+tr[0]+br[0]+bl[0])/4
  const cy = (tl[1]+tr[1]+br[1]+bl[1])/4
  const dx = tcx-cx, dy = tcy-cy
  const len = Math.sqrt(dx*dx+dy*dy) || 1
  return [tcx + dx/len * 28, tcy + dy/len * 28]
}

function ptInPoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length-1; i < poly.length; j = i++) {
    const [xi,yi] = poly[i], [xj,yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) inside = !inside
  }
  return inside
}

// ─── Canvas / color helpers ───────────────────────────────────────────────────

function hexAlpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}
function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('')
}
function logSliderToValue(t: number, min: number, max: number) {
  return Math.round(min * Math.exp(t * Math.log(max / min)))
}
function valueToLogSlider(v: number, min: number, max: number) {
  return Math.log(Math.max(v, min) / min) / Math.log(max / min)
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}

// ─── CRC-32 + minimal STORE-method zip builder (no dependency needed) ─────────
function _crc32(data: Uint8Array): number {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) crc = t[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function buildZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let pos = 0
  for (const { name, data } of files) {
    const nb = enc.encode(name); const crc = _crc32(data)
    const lh = new DataView(new ArrayBuffer(30 + nb.length))
    const lw32 = (o: number, v: number) => lh.setUint32(o, v, true)
    const lw16 = (o: number, v: number) => lh.setUint16(o, v, true)
    lw32(0, 0x04034B50); lw16(4, 20); lw16(6, 0); lw16(8, 0); lw16(10, 0); lw16(12, 0)
    lw32(14, crc); lw32(18, data.length); lw32(22, data.length); lw16(26, nb.length); lw16(28, 0)
    const lb = new Uint8Array(lh.buffer); lb.set(nb, 30)
    const ch = new DataView(new ArrayBuffer(46 + nb.length))
    const cw32 = (o: number, v: number) => ch.setUint32(o, v, true)
    const cw16 = (o: number, v: number) => ch.setUint16(o, v, true)
    cw32(0, 0x02014B50); cw16(4, 20); cw16(6, 20); cw16(8, 0); cw16(10, 0); cw16(12, 0); cw16(14, 0)
    cw32(16, crc); cw32(20, data.length); cw32(24, data.length); cw16(28, nb.length); cw16(30, 0)
    cw16(32, 0); cw16(34, 0); cw16(36, 0); cw32(38, 0); cw32(42, pos)
    const cb = new Uint8Array(ch.buffer); cb.set(nb, 46)
    locals.push(lb, data); central.push(cb)
    pos += 30 + nb.length + data.length
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054B50, true); eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true); eocd.setUint32(12, cdSize, true); eocd.setUint32(16, pos, true)
  return new Blob([...locals, ...central, new Uint8Array(eocd.buffer)], { type: 'application/zip' })
}
function _triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildSelectionDisplays(mask: HTMLCanvasElement) {
  const displayBlue = makeCanvas(mask.width, mask.height)
  const db = displayBlue.getContext('2d')!
  db.fillStyle = '#3a9fff'; db.fillRect(0, 0, mask.width, mask.height)
  db.globalCompositeOperation = 'destination-in'; db.drawImage(mask, 0, 0)
  const outline = makeCanvas(mask.width, mask.height)
  const oc = outline.getContext('2d')!
  oc.drawImage(mask, -1, 0); oc.drawImage(mask, 1, 0)
  oc.drawImage(mask, 0, -1); oc.drawImage(mask, 0, 1)
  oc.globalCompositeOperation = 'destination-out'; oc.drawImage(mask, 0, 0)
  const makeOutline = (color: string) => {
    const co = makeCanvas(mask.width, mask.height)
    const coc = co.getContext('2d')!
    coc.fillStyle = color; coc.fillRect(0, 0, mask.width, mask.height)
    coc.globalCompositeOperation = 'destination-in'; coc.drawImage(outline, 0, 0)
    return co
  }
  return { displayBlue, outline, outlineWhite: makeOutline('#ffffff'), outlineBlack: makeOutline('#1a1a1a') }
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => res(img); img.onerror = rej; img.src = src
  })
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word }
      else line = test
    }
    lines.push(line)
  }
  return lines
}

function renderTextLayer(ctx: CanvasRenderingContext2D, meta: TextMeta) {
  if (!meta.text) return
  ctx.save()
  ctx.font = `bold ${meta.fontSize}px ${meta.fontFamily}`
  ctx.textBaseline = 'top'
  const lum = parseInt(meta.color.slice(1,3),16)*0.299 +
              parseInt(meta.color.slice(3,5),16)*0.587 +
              parseInt(meta.color.slice(5,7),16)*0.114
  ctx.strokeStyle = lum > 128 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'
  ctx.lineWidth = Math.max(2, meta.fontSize * 0.06)
  ctx.lineJoin = 'round'
  ctx.fillStyle = meta.color
  const lineH = meta.fontSize * 1.25
  const lines = meta.w ? wrapText(ctx, meta.text, meta.w) : [meta.text]
  const align = meta.textAlign ?? 'left'
  const maxW  = meta.w ?? 0
  const pad   = meta.fontSize * 0.15

  if (meta.bgColor) {
    ctx.fillStyle = meta.bgColor
    lines.forEach((line, i) => {
      const lw = ctx.measureText(line).width
      const xAnchor = align === 'center' ? meta.x + maxW / 2 - lw / 2
                    : align === 'right'  ? meta.x + maxW - lw
                    : meta.x
      ctx.fillRect(xAnchor - pad, meta.y + i * lineH - pad, lw + pad * 2, lineH + pad * 2)
    })
    ctx.fillStyle = meta.color
  }

  function drawLine(line: string, y: number, isLast: boolean) {
    if (align === 'justify' && meta.w && !isLast) {
      const words = line.split(' ')
      if (words.length > 1) {
        const totalW = words.reduce((s, w) => s + ctx.measureText(w).width, 0)
        const gap = (maxW - totalW) / (words.length - 1)
        let cx = meta.x
        for (const word of words) {
          ctx.strokeText(word, cx, y); ctx.fillText(word, cx, y)
          cx += ctx.measureText(word).width + gap
        }
        return
      }
    }
    const xAnchor = align === 'center' ? meta.x + maxW / 2
                  : align === 'right'  ? meta.x + maxW
                  : meta.x
    ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
    ctx.strokeText(line, xAnchor, y)
    ctx.fillText(line, xAnchor, y)
  }

  lines.forEach((line, i) => drawLine(line, meta.y + i * lineH, i === lines.length - 1))
  ctx.restore()
}

// ─── Joystick Controls ────────────────────────────────────────────────────────

const ZOOM_SENS = 0.0004
const PAN_SENS  = 0.5

function StudioJoysticks({ onZoomDelta, onPanDelta }: { onZoomDelta: (d: number) => void; onPanDelta: (dx: number, dy: number) => void }) {
  const zoomKnobRef = useRef<HTMLDivElement>(null)
  const zoomBaseRef = useRef<HTMLDivElement>(null)
  const zoomDispRef = useRef(0)
  const zoomRafRef  = useRef(0)
  const panKnobRef  = useRef<HTMLDivElement>(null)
  const panBaseRef  = useRef<HTMLDivElement>(null)
  const panDispRef  = useRef({ x: 0, y: 0 })
  const panRafRef   = useRef(0)

  function startZoomDrag(e: React.PointerEvent) {
    e.preventDefault()
    const knob = zoomKnobRef.current!, base = zoomBaseRef.current!
    const r = base.getBoundingClientRect()
    const cY = r.top + r.height / 2
    const maxD = r.height / 2 - 6
    let lastT = performance.now()
    const tick = (now: number) => {
      const dt = now - lastT; lastT = now
      if (Math.abs(zoomDispRef.current) > 0.02) onZoomDelta(-zoomDispRef.current * ZOOM_SENS * dt)
      zoomRafRef.current = requestAnimationFrame(tick)
    }
    zoomRafRef.current = requestAnimationFrame(tick)
    const onMove = (ev: PointerEvent) => {
      const dy = Math.max(-maxD, Math.min(maxD, ev.clientY - cY))
      zoomDispRef.current = dy / maxD
      knob.style.transform = `translateY(${dy}px)`
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      cancelAnimationFrame(zoomRafRef.current); zoomRafRef.current = 0
      zoomDispRef.current = 0; knob.style.transform = 'translateY(0)'
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startPanDrag(e: React.PointerEvent) {
    e.preventDefault()
    const knob = panKnobRef.current!, base = panBaseRef.current!
    const r = base.getBoundingClientRect()
    const cX = r.left + r.width / 2, cY = r.top + r.height / 2
    const maxR = Math.min(r.width, r.height) / 2 - 6
    let lastT = performance.now()
    const tick = (now: number) => {
      const dt = now - lastT; lastT = now
      const { x, y } = panDispRef.current
      if (Math.hypot(x, y) > 0.02) onPanDelta(x * PAN_SENS * dt, y * PAN_SENS * dt)
      panRafRef.current = requestAnimationFrame(tick)
    }
    panRafRef.current = requestAnimationFrame(tick)
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - cX, dy = ev.clientY - cY
      const dist = Math.hypot(dx, dy)
      const cl = Math.min(dist, maxR)
      const nx = dist > 0 ? (dx / dist) * cl : 0, ny = dist > 0 ? (dy / dist) * cl : 0
      panDispRef.current = { x: nx / maxR, y: ny / maxR }
      knob.style.transform = `translate(${nx}px,${ny}px)`
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      cancelAnimationFrame(panRafRef.current); panRafRef.current = 0
      panDispRef.current = { x: 0, y: 0 }; knob.style.transform = 'translate(0,0)'
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="mst-joysticks">
      <div className="mst-joystick-wrap">
        <div className="mst-joystick-base mst-joystick-base--vertical" ref={zoomBaseRef}>
          <div className="mst-joystick-knob" ref={zoomKnobRef} onPointerDown={startZoomDrag} />
        </div>
        <span className="mst-joystick-label">ZOOM</span>
      </div>
      <div className="mst-joystick-wrap">
        <div className="mst-joystick-base" ref={panBaseRef}>
          <div className="mst-joystick-knob" ref={panKnobRef} onPointerDown={startPanDrag} />
        </div>
        <span className="mst-joystick-label">PAN</span>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * `view` comes from the URL (/studio = home, /studio/canvas = the editor), so a reload or a shared link
 * lands on the same screen; `onViewChange` moves the URL. Without them the studio keeps its own view.
 */
export function MemeStudio({ onPublished, remixSourceId, view, onViewChange }: {
  onPublished?: (id: string) => void
  remixSourceId?: string
  view?: 'home' | 'editor'
  onViewChange?: (view: 'home' | 'editor') => void
}) {
  // The editor opens only from StudioHome's New/Open, which are member-only, so inside it
  // there is always a member. '' just keeps the guest-visible home from doing member work.
  const memberWallet = useMemberGate().wallet
  const address = memberWallet ?? ''
  const displayRef = useRef<HTMLCanvasElement>(null)
  const offscreen  = useRef<Record<string, HTMLCanvasElement>>({})
  const maskCanvas = useRef<Record<string, HTMLCanvasElement>>({})

  const [canvasW, setCanvasW] = useState(DEFAULT_W)
  const [canvasH, setCanvasH] = useState(DEFAULT_H)
  const dimsRef = useRef({ w: DEFAULT_W, h: DEFAULT_H })

  const [layers, setLayers] = useState<Layer[]>([
    { id: 'bg', name: 'Background', visible: true, opacity: 100 }
  ])
  const layersRef = useRef<Layer[]>(layers)
  useEffect(() => { layersRef.current = layers }, [layers])

  const [activeId, setActiveId] = useState('bg')
  const activeIdRef = useRef('bg')
  useEffect(() => {
    // Save outgoing char's prompts
    const prev = activeIdRef.current
    if (charLayersRef.current[prev]) {
      charPromptMemory.current[prev] = {
        reskin: reskinPromptRef.current, edit: editPromptRef.current, artAi: artAiPromptRef.current,
        inAction: inActionPromptRef.current, inActionSubMode: inActionSubModeRef.current,
        inActionLevel: inActionLevelRef.current, inActionCount: inActionCountRef.current,
      }
    }
    activeIdRef.current = activeId
    setCharAction(null)
    // Restore new char's prompts
    const mem = charLayersRef.current[activeId] ? charPromptMemory.current[activeId] : undefined
    if (mem) {
      setReskinPrompt(mem.reskin);       reskinPromptRef.current = mem.reskin
      setEditPrompt(mem.edit);           editPromptRef.current = mem.edit
      setArtAiPrompt(mem.artAi);         artAiPromptRef.current = mem.artAi
      setInActionPrompt(mem.inAction);   inActionPromptRef.current = mem.inAction
      setInActionSubMode(mem.inActionSubMode); inActionSubModeRef.current = mem.inActionSubMode
      setInActionLevel(mem.inActionLevel);     inActionLevelRef.current = mem.inActionLevel
      setInActionCount(mem.inActionCount);     inActionCountRef.current = mem.inActionCount
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const [maskedIds, setMaskedIds] = useState<Set<string>>(new Set())

  const [transforms, setTransforms] = useState<Record<string, LayerTransform>>({})
  const transformsRef = useRef<Record<string, LayerTransform>>({})
  useEffect(() => { transformsRef.current = transforms }, [transforms])
  const prevCharTransformsRef = useRef<Record<string, LayerTransform>>({})

  const [bboxes, setBboxes] = useState<Record<string, BBox>>({})
  const bboxesRef = useRef<Record<string, BBox>>({})
  useEffect(() => { bboxesRef.current = bboxes }, [bboxes])

  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  const [charLayers, setCharLayers] = useState<Record<string, CharMeta>>({})
  const charLayersRef = useRef<Record<string, CharMeta>>({})
  useEffect(() => { charLayersRef.current = charLayers }, [charLayers])

  const [textLayers, setTextLayers] = useState<Record<string, TextMeta>>({})
  const textLayersRef = useRef<Record<string, TextMeta>>({})
  useEffect(() => { textLayersRef.current = textLayers }, [textLayers])

  // Drawing
  const drawing  = useRef(false)
  const lastPos  = useRef<{ x: number; y: number } | null>(null)

  // Tool state
  const [mode,         setMode]         = useState<Mode>('art')
  const modeRef = useRef<Mode>('art')
  useEffect(() => { modeRef.current = mode }, [mode])

  const [tool,         setTool]         = useState<Tool>('grab')
  const [brushShape,   setBrushShape]   = useState<BrushShape>('circle')
  const [brushSize,    setBrushSize]    = useState(12)
  const [paintOpacity, setPaintOpacity] = useState(100)
  const [color,        setColor]        = useState('#000000')
  const toolRef         = useRef<Tool>('brush')
  const brushShapeRef   = useRef<BrushShape>('circle')
  const brushSizeRef    = useRef(12)
  const paintOpacityRef = useRef(100)
  const colorRef        = useRef('#000000')
  useEffect(() => { toolRef.current         = tool         }, [tool])
  useEffect(() => { brushShapeRef.current   = brushShape   }, [brushShape])
  useEffect(() => { brushSizeRef.current    = brushSize    }, [brushSize])
  useEffect(() => { paintOpacityRef.current = paintOpacity }, [paintOpacity])
  useEffect(() => { colorRef.current        = color        }, [color])

  const [smoothing, setSmoothing] = useState(0)
  const smoothingRef = useRef(0)
  useEffect(() => { smoothingRef.current = smoothing }, [smoothing])

  const [fillTolerance, setFillTolerance] = useState(32)
  const fillToleranceRef = useRef(32)
  useEffect(() => { fillToleranceRef.current = fillTolerance }, [fillTolerance])

  // Shape tool (line / polygon) settings
  const [polyPresetIdx,    setPolyPresetIdx]    = useState(3)  // hexagon default
  const [shapeStrokeOn,    setShapeStrokeOn]    = useState(true)
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#000000')
  const [shapeStrokeW,     setShapeStrokeW]     = useState(3)
  const [shapeFillOn,      setShapeFillOn]      = useState(false)
  const [shapeFillColor,   setShapeFillColor]   = useState('#ffffff')
  const polyPresetRef       = useRef<typeof POLY_PRESETS[number]>(POLY_PRESETS[3])
  const shapeStrokeOnRef    = useRef(true)
  const shapeStrokeColorRef = useRef('#000000')
  const shapeStrokeWRef     = useRef(3)
  const shapeFillOnRef      = useRef(false)
  const shapeFillColorRef   = useRef('#ffffff')
  useEffect(() => { polyPresetRef.current       = POLY_PRESETS[polyPresetIdx] }, [polyPresetIdx])
  useEffect(() => { shapeStrokeOnRef.current    = shapeStrokeOn    }, [shapeStrokeOn])
  useEffect(() => { shapeStrokeColorRef.current = shapeStrokeColor }, [shapeStrokeColor])
  useEffect(() => { shapeStrokeWRef.current     = shapeStrokeW     }, [shapeStrokeW])
  useEffect(() => { shapeFillOnRef.current      = shapeFillOn      }, [shapeFillOn])
  useEffect(() => { shapeFillColorRef.current   = shapeFillColor   }, [shapeFillColor])
  // In-progress shape drag (canvas coords)
  const shapeDrawRef = useRef<{ startX: number; startY: number; currX: number; currY: number } | null>(null)
  // Hovered vertex index (-1 = none)
  const hoveredVertIdxRef = useRef(-1)

  // Polygon vector layers
  const [polyLayers, setPolyLayers] = useState<Record<string, PolygonMeta>>({})
  const polyLayersRef = useRef<Record<string, PolygonMeta>>({})
  useEffect(() => { polyLayersRef.current = polyLayers }, [polyLayers])

  // Text tool state
  const [fontSize,       setFontSize]       = useState(72)
  const [fontFamily,     setFontFamily]     = useState('Impact')
  const [textInput,      setTextInput]      = useState<TextInput | null>(null)
  const [textDragPreview, setTextDragPreview] = useState<TextDrag | null>(null)
  const [magicLabelSets,       setMagicLabelSets]       = useState<Record<string, MagicLabelSet>>({})
  const [magicLabelGenerating, setMagicLabelGenerating] = useState<Set<string>>(new Set())
  const [magicLabelPicker, setMagicLabelPicker] = useState<{ cx: number; cy: number; canvasX: number; canvasY: number; charId: string; labels: string[] } | null>(null)
  const fontSizeRef      = useRef(72)
  const fontFamilyRef    = useRef('Impact')
  // Default style for newly created titles (persists across creations)
  const [titleDefFontFamily, setTitleDefFontFamily] = useState('Impact')
  const [titleDefFontSize,   setTitleDefFontSize]   = useState(56)
  const [titleDefColor,      setTitleDefColor]      = useState('#000000')
  const [titleDefTextAlign,  setTitleDefTextAlign]  = useState<TextAlign>('left')
  const [titleDefBgColor,    setTitleDefBgColor]    = useState('')
  const titleDefFontFamilyRef = useRef('Impact')
  const titleDefFontSizeRef   = useRef(56)
  const titleDefColorRef      = useRef('#000000')
  const titleDefTextAlignRef  = useRef<TextAlign>('left')
  const titleDefBgColorRef    = useRef('')
  // Default style for newly created labels (persists across creations)
  const [labelDefFontFamily, setLabelDefFontFamily] = useState('Arial')
  const [labelDefFontSize,   setLabelDefFontSize]   = useState(22)
  const [labelDefColor,      setLabelDefColor]      = useState('#000000')
  const [labelDefTextAlign,  setLabelDefTextAlign]  = useState<TextAlign>('left')
  const [labelDefBgColor,    setLabelDefBgColor]    = useState('')
  const labelDefFontFamilyRef = useRef('Arial')
  const labelDefFontSizeRef   = useRef(22)
  const labelDefColorRef      = useRef('#000000')
  const labelDefTextAlignRef  = useRef<TextAlign>('left')
  const labelDefBgColorRef    = useRef('')
  // Active text alignment
  const [textAlign,    setTextAlign]    = useState<TextAlign>('left')
  const [textBgColor,  setTextBgColor]  = useState('')
  const textAlignRef = useRef<TextAlign>('left')
  const textInputRef     = useRef<HTMLInputElement>(null)
  const textDragStartRef = useRef<{ startX: number; startY: number; startClientX: number; startClientY: number } | null>(null)
  const editingTextLayerRef = useRef<string | null>(null)
  const [inlineEditingTextId, setInlineEditingTextId] = useState<string | null>(null)
  const [inlineEditText, setInlineEditText] = useState('')
  // Hovered text layer while in text mode with a char layer active
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null)
  const hoveredTextIdRef = useRef<string | null>(null)
  // Hovered unlinked text label (for the link-to-char handle)
  const [hoveredUnlinkedId, setHoveredUnlinkedId] = useState<string | null>(null)
  const hoveredUnlinkedIdRef = useRef<string | null>(null)
  // Active link drag state
  type LinkDragState = { textId: string; x: number; y: number; overCharId: string | null }
  const [linkDrag, setLinkDrag] = useState<LinkDragState | null>(null)
  const linkDragRef = useRef<LinkDragState | null>(null)
  useEffect(() => { fontSizeRef.current   = fontSize   }, [fontSize])
  useEffect(() => { fontFamilyRef.current = fontFamily }, [fontFamily])
  useEffect(() => { labelDefFontFamilyRef.current = labelDefFontFamily }, [labelDefFontFamily])
  useEffect(() => { labelDefFontSizeRef.current   = labelDefFontSize   }, [labelDefFontSize])

  // When a label layer's scale changes (grab-resize), update the label font-size default
  useEffect(() => {
    const meta = textLayersRef.current[activeId]
    if (!meta || meta.subtype !== 'label') return
    const tf = transformsRef.current[activeId]
    if (!tf || (tf.scaleX === 1 && tf.scaleY === 1)) return
    const effective = Math.max(6, Math.round(meta.fontSize * Math.abs(tf.scaleX)))
    setLabelDefFontSize(effective); labelDefFontSizeRef.current = effective
  }, [transforms, activeId])

  // When char transforms change, move all linked text layers proportionally
  useEffect(() => {
    const charIds = Object.keys(charLayersRef.current)
    const prevTfs = prevCharTransformsRef.current
    let didUpdate = false
    const newTransforms = { ...transformsRef.current }

    for (const charId of charIds) {
      const newTf = transformsRef.current[charId]
      const oldTf = prevTfs[charId]
      if (!newTf || !oldTf) continue
      if (newTf.tx === oldTf.tx && newTf.ty === oldTf.ty &&
          newTf.scaleX === oldTf.scaleX && newTf.scaleY === oldTf.scaleY &&
          newTf.rotation === oldTf.rotation) continue

      const charBbox = bboxesRef.current[charId]
      if (!charBbox) continue

      const oldCharCX = charBbox.x + charBbox.w / 2 + oldTf.tx
      const oldCharCY = charBbox.y + charBbox.h / 2 + oldTf.ty
      const newCharCX = charBbox.x + charBbox.w / 2 + newTf.tx
      const newCharCY = charBbox.y + charBbox.h / 2 + newTf.ty

      for (const [textId, textMeta] of Object.entries(textLayersRef.current)) {
        if (textMeta.linkedCharId !== charId) continue
        const textTf = transformsRef.current[textId] ?? IDENTITY_TF
        const textEffX = textMeta.x + textTf.tx
        const textEffY = textMeta.y + textTf.ty
        const offX = textEffX - oldCharCX
        const offY = textEffY - oldCharCY
        const scaleRatioX = oldTf.scaleX !== 0 ? newTf.scaleX / oldTf.scaleX : 1
        const scaleRatioY = oldTf.scaleY !== 0 ? newTf.scaleY / oldTf.scaleY : 1
        const newTextEffX = newCharCX + offX * scaleRatioX
        const newTextEffY = newCharCY + offY * scaleRatioY
        newTransforms[textId] = { ...textTf, tx: newTextEffX - textMeta.x, ty: newTextEffY - textMeta.y }
        didUpdate = true
      }
    }

    if (didUpdate) {
      transformsRef.current = newTransforms
      setTransforms(newTransforms)
      composite()
    }

    const newPrev: Record<string, LayerTransform> = {}
    for (const charId of charIds) {
      const tf = transformsRef.current[charId]
      if (tf) newPrev[charId] = { ...tf }
    }
    prevCharTransformsRef.current = newPrev
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transforms])

  // Sync shape controls when the active layer is (or becomes) a polygon layer
  useEffect(() => {
    const meta = polyLayersRef.current[activeId]
    if (!meta) return
    setShapeStrokeOn(meta.strokeOn);    shapeStrokeOnRef.current    = meta.strokeOn
    setShapeStrokeColor(meta.strokeColor); shapeStrokeColorRef.current = meta.strokeColor
    setShapeStrokeW(meta.strokeWidth);  shapeStrokeWRef.current     = meta.strokeWidth
    setShapeFillOn(meta.fillOn);        shapeFillOnRef.current       = meta.fillOn
    setShapeFillColor(meta.fillColor);  shapeFillColorRef.current    = meta.fillColor
  }, [activeId])

  const targetPosRef = useRef<{ x: number; y: number } | null>(null)
  const smoothPosRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef       = useRef<number | null>(null)

  const [brushMenu, setBrushMenu] = useState<{ x: number; y: number } | null>(null)
  const brushMenuRef = useRef<HTMLDivElement>(null)

  const [grabMenu, setGrabMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null)
  const [charPicker, setCharPicker] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0, on: false })

  const historyStack = useRef<HistoryEntry[]>([])
  const redoStack    = useRef<HistoryEntry[]>([])

  const [resizePreview, setResizePreview] = useState<{ w: number; h: number } | null>(null)
  const resizingRef = useRef<{
    handle: string; startX: number; startY: number; startW: number; startH: number
  } | null>(null)

  const grabDragRef = useRef<{
    handle: GrabHandle; layerId: string
    startMx: number; startMy: number
    initTf: LayerTransform
    initTfsMap: Record<string, LayerTransform>
    displayCx: number; displayCy: number
    initAngle: number
    bboxW: number; bboxH: number
  } | null>(null)
  const [grabHover, setGrabHover] = useState<GrabHandle | null>(null)

  // ── Grab settings: snap, multi-select ─────────────────────────────────────
  const [snapEnabled, setSnapEnabled] = useState(true)
  const snapEnabledRef = useRef(true)
  useEffect(() => { snapEnabledRef.current = snapEnabled }, [snapEnabled])
  const [snapLines, setSnapLines] = useState<{ axis: 'h'|'v'; pos: number }[]>([])
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const multiSelectModeRef = useRef(false)
  useEffect(() => { multiSelectModeRef.current = multiSelectMode }, [multiSelectMode])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectedIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
  const ctrlDownRef = useRef(false)

  // Zoom & pan
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // Re-render on scroll so getBoundingClientRect() stays fresh for action-bar positioning
  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setScrollTick(t => t + 1))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  const [spaceDown, setSpaceDown] = useState(false)
  const spaceDownRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Tick incremented on every scroll frame so action-bar position recomputes
  const [scrollTick, setScrollTick] = useState(0)
  const pendingScrollAdj = useRef<{ pixelX: number; pixelY: number; cursorX: number; cursorY: number } | null>(null)

  // Inline re-skin / edit state
  const [reskinPrompt,  setReskinPrompt]  = useState('')
  const reskinPromptRef = useRef('')
  // Per-layer loading set — allows parallel ops on different characters
  const [loadingLayerIds, setLoadingLayerIds] = useState<Set<string>>(new Set())
  function setLayerLoading(id: string, on: boolean) {
    setLoadingLayerIds(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n })
  }
  const [showBuyModal,    setShowBuyModal]    = useState<{ required: number; balance?: number } | null>(null)
  const [showKeyModal,    setShowKeyModal]    = useState(false)
  const [ownKeyActive,    setOwnKeyActive]    = useState(() => hasUserGeminiKey())
  const creditBalanceRefreshRef = useRef<(() => void) | null>(null)
  async function withCredits(action: CreditAction, fn: () => Promise<void>): Promise<void> {
    // If user has their own Gemini key, skip credit deduction entirely
    if (hasUserGeminiKey()) { await fn(); return }
    let ticket: string | undefined
    try {
      ticket = (await deductCredits(action)).ai_ticket
    } catch (e: any) {
      if (e?.status === 402) { setShowBuyModal({ required: e.data?.required ?? 1, balance: e.data?.balance }); return }
      throw e
    }
    // The image calls inside fn() spend this ticket on the server
    setAiTicket(ticket ?? null)
    try { await fn() } finally { setAiTicket(null) }
    creditBalanceRefreshRef.current?.()
    window.dispatchEvent(new CustomEvent('vvc:credits-changed'))
  }
  const [editPrompt,    setEditPrompt]    = useState('')
  const editPromptRef = useRef('')
  const [charAction,      setCharAction]      = useState<null | 'reskin' | 'edit' | 'ai-edit' | 'in-action' | 'skins' | 'gen-expand'>(null)
  const [expandOffsets,   setExpandOffsets]   = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  const expandDragRef = useRef<{ handle: string; startX: number; startY: number; startOffsets: { top: number; right: number; bottom: number; left: number } } | null>(null)
  useEffect(() => { if (charAction !== 'gen-expand') setExpandOffsets({ top: 0, right: 0, bottom: 0, left: 0 }) }, [charAction])
  useEffect(() => { charActionRef.current = charAction }, [charAction])
  const [artAiPrompt,     setArtAiPrompt]     = useState('')
  const artAiPromptRef = useRef('')
  const [inActionPrompt,      setInActionPrompt]      = useState('')
  const inActionPromptRef = useRef('')
  const [inActionSubMode,     setInActionSubMode]     = useState<'scene' | 'modify'>('scene')
  const inActionSubModeRef = useRef<'scene' | 'modify'>('scene')
  const [inActionLevel,       setInActionLevel]       = useState<1 | 2 | 3>(3)
  const inActionLevelRef = useRef<1 | 2 | 3>(3)
  const [inActionCount,       setInActionCount]       = useState<1 | 2 | 3>(1)
  const inActionCountRef = useRef<1 | 2 | 3>(1)

  // Per-character prompt memory — restored when switching to that character
  type CharPromptMemory = { reskin: string; edit: string; artAi: string; inAction: string; inActionSubMode: 'scene' | 'modify'; inActionLevel: 1 | 2 | 3; inActionCount: 1 | 2 | 3 }
  const charPromptMemory = useRef<Record<string, CharPromptMemory>>({})

  // Per-layer: locked base character snapshot — set on first Generate or after explicit reskin/edit
  const [inActionHasSnapshot, setInActionHasSnapshot] = useState<Record<string, boolean>>({})
  const inActionCharSnapshotRef = useRef<Record<string, string>>({})

  // Per-layer: pending batch of options (shown when count > 1)
  const [inActionPendingBatch, setInActionPendingBatch] = useState<Record<string, string[]>>({})
  const inActionPendingBatchRef = useRef<Record<string, string[]>>({})
  // Hover preview state for in-action result picker
  const [hoveredInActionUrl, setHoveredInActionUrl] = useState<string | null>(null)
  const hoverPreSnapshotRef = useRef<HTMLCanvasElement | null>(null)
  // Level tooltip (cursor-following gif)
  const [levelTooltip, setLevelTooltip] = useState<{ gif: string; desc: string; x: number; y: number } | null>(null)

  // Per-layer: previous accepted images (max 2) for going back
  const [inActionPrevImages, setInActionPrevImages] = useState<Record<string, string[]>>({})
  const inActionPrevImagesRef = useRef<Record<string, string[]>>({})

  // Crop tool
  const cropDragRef = useRef<{ startX: number; startY: number; currX: number; currY: number } | null>(null)

  // Magic wand
  const [wandTolerance,    setWandTolerance]    = useState(32)
  const wandToleranceRef = useRef(32)
  const [hasSelection, setHasSelection] = useState(false)
  const hasSelectionRef = useRef(false)
  type SelectionData = { layerId: string; mask: HTMLCanvasElement; displayBlue: HTMLCanvasElement; outline: HTMLCanvasElement; outlineWhite: HTMLCanvasElement; outlineBlack: HTMLCanvasElement }
  const selectionRef = useRef<SelectionData | null>(null)
  const [selectionMode, setSelectionMode] = useState<'replace'|'add'|'subtract'>('replace')
  const selectionModeRef = useRef<'replace'|'add'|'subtract'>('replace')
  const lassoDrawingRef = useRef(false)
  const lassoPtsRef = useRef<{x: number; y: number}[]>([])
  const marqueeDragRef = useRef<{startX: number; startY: number; currX: number; currY: number} | null>(null)
  const strokePreRef = useRef<HTMLCanvasElement | null>(null)

  // Studio routing: the URL owns the view when the route passes one
  const [localView, setLocalView] = useState<'home' | 'editor'>('home')
  const studioView = view ?? localView
  const setStudioView = (v: 'home' | 'editor') => { if (onViewChange) { if (v !== view) onViewChange(v) } else setLocalView(v) }
  // Work in progress kept in this browser (IndexedDB), offered on the home screen as "Continue"
  const [sessionWaiting, setSessionWaiting] = useState<SessionSnapshot | null>(null)

  // Draft state
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const currentDraftIdRef = useRef<string | null>(null)
  // Keep ref in sync so autosave closures always read the latest ID
  useEffect(() => { currentDraftIdRef.current = currentDraftId }, [currentDraftId])
  const [savingDraft, setSavingDraft] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [vvcMenuOpen, setVvcMenuOpen] = useState(false)
  const [exportingVvc, setExportingVvc] = useState(false)
  // Auto-save
  type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle')
  const autoSaveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idbSaveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveMsgTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks which layers have been painted on by the user (need full canvas data on server)
  const dirtyLayerIdsRef  = useRef<Set<string>>(new Set())

  // Publish state
  const [publishing,      setPublishing]      = useState(false)
  const [publishMsg,      setPublishMsg]      = useState<{ ok: boolean; text: string } | null>(null)
  const [publishedMemeId, setPublishedMemeId] = useState<string | null>(null)
  // Post-publish X share state
  const [pubShareStage,   setPubShareStage]   = useState<null | 'compose' | 'posting' | 'done'>(null)
  const [pubTweetText,    setPubTweetText]     = useState('')
  const [pubTweetUrl,     setPubTweetUrl]      = useState('')
  const [pubXHandle,      setPubXHandle]       = useState('')
  const [pubShareInCommunity, setPubShareInCommunity] = useState(false)
  // Remix state
  const [remixChanged,    setRemixChanged]    = useState(false)
  const remixChangedRef = useRef(false)

  // Skin databank state
  const [skins,        setSkins]        = useState<SkinRecord[]>([])
  const [skinsLoading, setSkinsLoading] = useState(false)
  const [skinsHasMore, setSkinsHasMore] = useState(false)
  const [skinsOffset,  setSkinsOffset]  = useState(0)
  const [skinSearch,   setSkinSearch]   = useState('')
  const skinSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const charActionRef   = useRef<string | null>(null)

  function markRemixChanged() {
    if (remixSourceId && !remixChangedRef.current) {
      remixChangedRef.current = true
      setRemixChanged(true)
    }
  }

  function saveSkinToDatabank(blobUrl: string, charKey: string, charName: string, prompt: string, skinType: SkinRecord['skin_type']) {
    void (async () => {
      try {
        console.log('[skin] saving', { charKey, skinType, prompt, wallet: address || 'anonymous' })
        const blob = await fetch(blobUrl).then(r => r.blob())
        console.log('[skin] blob ok, size:', blob.size, 'type:', blob.type)
        const dataUrl: string = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob)
        })
        console.log('[skin] dataUrl length:', dataUrl.length, 'prefix:', dataUrl.slice(0, 30))
        const id = await saveSkin({ char_key: charKey, char_name: charName, prompt, skin_type: skinType, imageDataUrl: dataUrl })
        console.log('[skin] server returned id:', id)
        if (id && charActionRef.current === 'skins') {
          const currentMeta = charLayersRef.current[activeIdRef.current]
          if (currentMeta?.charKey === charKey) {
            const newSkin: SkinRecord = { id, wallet: address || 'anonymous', char_key: charKey, char_name: charName, prompt, skin_type: skinType, created_at: new Date().toISOString() }
            setSkins(prev => [newSkin, ...prev])
          }
        }
      } catch (e) { console.warn('[skin databank]', e) }
    })()
  }

  async function loadSkins(charKey: string, search: string, offset: number) {
    setSkinsLoading(true)
    try {
      const data = await fetchCharSkins(charKey, search, offset, 40)
      setSkins(prev => offset === 0 ? data.items : [...prev, ...data.items])
      setSkinsHasMore(data.has_more)
      setSkinsOffset(offset + data.items.length)
    } finally {
      setSkinsLoading(false)
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const c = makeCanvas(DEFAULT_W, DEFAULT_H)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, DEFAULT_W, DEFAULT_H)
    offscreen.current['bg'] = c
    composite()
    const TMAX = 220
    const s = Math.min(TMAX / DEFAULT_W, TMAX / DEFAULT_H, 1)
    const tw = Math.round(DEFAULT_W * s), th = Math.round(DEFAULT_H * s)
    const thumb = makeCanvas(tw, th); const tc = thumb.getContext('2d')!
    tc.fillStyle = '#fff'; tc.fillRect(0, 0, tw, th)
    tc.drawImage(c, 0, 0, tw, th)
    setThumbs({ bg: thumb.toDataURL() })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back on the home screen (the Studio Home button, or the browser's back): offer the work in progress
  useEffect(() => {
    if (studioView !== 'home' || !address || remixSourceId) return
    loadSession(address).then(snap => setSessionWaiting(snap ?? null)).catch(() => {})
  }, [studioView, address, remixSourceId])

  // ─── Auto-restore from IndexedDB on mount ──────────────────────────────────
  useEffect(() => {
    if (!address) return
    // Remix mode: load source meme draft instead of personal session
    if (remixSourceId) {
      fetchRemixDraft(remixSourceId).then(data => {
        if (data?.payload) {
          void handleLoadDraft(data.payload as DraftPayload)
          setStudioView('editor')
          setCurrentDraftId(null)  // fresh — not the original draft
          currentDraftIdRef.current = null
          remixChangedRef.current = false
          setRemixChanged(false)
        }
      }).catch(() => {})
      return
    }
    // On the canvas (also after a reload) the work in progress comes back; on the home screen it's offered
    loadSession(address).then(snapshot => {
      if (!snapshot) return
      if (studioView === 'editor') void handleLoadDraft(snapshot)
      else setSessionWaiting(snapshot)
    }).catch(() => { /* no stored session */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, remixSourceId])

  // Load skins when Skins panel opens
  useEffect(() => {
    if (charAction !== 'skins') return
    const meta = charLayersRef.current[activeId]
    if (!meta) return
    setSkins([])
    setSkinsOffset(0)
    setSkinSearch('')
    void loadSkins(meta.charKey, '', 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charAction, activeId])

  // ─── Marching ants animation ────────────────────────────────────────────────
  useEffect(() => {
    if (!hasSelection) return
    let rafId = 0; let last = 0
    const tick = (now: number) => {
      if (now - last > 100) { composite(); last = now }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSelection])

  // ─── Pulsing glow animation for pending IN ACTION batches ──────────────────
  const hasPendingBatches = Object.keys(inActionPendingBatch).length > 0
  useEffect(() => {
    if (!hasPendingBatches) return
    let rafId = 0; let last = 0
    const tick = (now: number) => {
      if (now - last > 50) { composite(); last = now }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingBatches])

  // ─── Composite ─────────────────────────────────────────────────────────────

  const composite = useCallback(() => {
    const display = displayRef.current; if (!display) return
    const ctx = display.getContext('2d')!
    const W = display.width, H = display.height
    ctx.clearRect(0, 0, W, H)

    const ch = makeCanvas(16, 16); const cc = ch.getContext('2d')!
    cc.fillStyle = '#aaa'; cc.fillRect(0, 0, 16, 16)
    cc.fillStyle = '#888'; cc.fillRect(0, 0, 8, 8); cc.fillRect(8, 8, 8, 8)
    ctx.fillStyle = ctx.createPattern(ch, 'repeat')!
    ctx.fillRect(0, 0, W, H)

    const drawLayerSrc = (target: CanvasRenderingContext2D, id: string, src: HTMLCanvasElement) => {
      const mc = maskCanvas.current[id]
      if (mc) {
        const tmp = makeCanvas(W, H); const tc = tmp.getContext('2d')!
        tc.drawImage(src, 0, 0)
        tc.globalCompositeOperation = 'destination-in'
        tc.drawImage(mc, 0, 0)
        target.drawImage(tmp, 0, 0)
      } else {
        target.drawImage(src, 0, 0)
      }
    }

    for (const layer of layersRef.current) {
      if (!layer.visible) continue
      const loadingDim = loadingLayerIds.has(layer.id) ? 0.25 : 1
      ctx.globalAlpha = (layer.opacity / 100) * loadingDim
      const tf   = transformsRef.current[layer.id]
      const bbox = bboxesRef.current[layer.id]

      // Vector text layer — render from metadata, skip if currently being edited
      // Polygon vector layer
      const polyMeta = polyLayersRef.current[layer.id]
      if (polyMeta) {
        const { vertices, strokeOn, strokeColor, strokeWidth, fillOn, fillColor } = polyMeta
        ctx.beginPath()
        vertices.forEach(([vx, vy], i) => i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy))
        ctx.closePath()
        if (fillOn) { ctx.fillStyle = fillColor; ctx.fill() }
        if (strokeOn) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.lineJoin = 'round'; ctx.stroke() }
        ctx.globalAlpha = layer.opacity / 100
        continue
      }

      const textMeta = textLayersRef.current[layer.id]
      if (textMeta) {
        if (editingTextLayerRef.current === layer.id) continue
        if (tf && bbox) {
          const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
          ctx.save()
          ctx.translate(cx + tf.tx, cy + tf.ty)
          ctx.rotate(tf.rotation)
          ctx.scale(tf.scaleX, tf.scaleY)
          ctx.translate(-cx, -cy)
          renderTextLayer(ctx, textMeta)
          ctx.restore()
        } else {
          renderTextLayer(ctx, textMeta)
        }
        continue
      }

      const lc = offscreen.current[layer.id]; if (!lc) continue
      const hasBatch = (inActionPendingBatchRef.current[layer.id]?.length ?? 0) > 0
      if (hasBatch) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300)
        ctx.shadowColor = '#ff9900'
        ctx.shadowBlur = 6 + 16 * pulse
      }
      if (tf && bbox) {
        const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
        ctx.save()
        ctx.translate(cx + tf.tx, cy + tf.ty)
        ctx.rotate(tf.rotation)
        ctx.scale(tf.scaleX, tf.scaleY)
        ctx.translate(-cx, -cy)
        drawLayerSrc(ctx, layer.id, lc)
        ctx.restore()
      } else {
        drawLayerSrc(ctx, layer.id, lc)
      }
      if (hasBatch) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent' }
    }
    ctx.globalAlpha = 1

    // Shape tool preview
    const sd = shapeDrawRef.current
    if (sd) {
      const t = toolRef.current
      const hasStroke = shapeStrokeOnRef.current
      const hasFill   = shapeFillOnRef.current && t === 'polygon'
      if (hasStroke || hasFill) {
        ctx.save()
        ctx.beginPath()
        if (t === 'line') {
          ctx.moveTo(sd.startX, sd.startY)
          ctx.lineTo(sd.currX, sd.currY)
        } else {
          const cx = (sd.startX + sd.currX) / 2, cy = (sd.startY + sd.currY) / 2
          const r = Math.hypot(sd.currX - sd.startX, sd.currY - sd.startY) / 2
          const preset = polyPresetRef.current
          for (let i = 0; i < preset.sides; i++) {
            const a = preset.angle + (2 * Math.PI * i) / preset.sides
            const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a)
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
          }
          ctx.closePath()
        }
        if (hasFill) { ctx.fillStyle = shapeFillColorRef.current; ctx.fill() }
        if (hasStroke) { ctx.strokeStyle = shapeStrokeColorRef.current; ctx.lineWidth = shapeStrokeWRef.current; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke() }
        ctx.restore()
      }
    }
    // Crop tool drag overlay
    const cd = cropDragRef.current
    if (cd && toolRef.current === 'crop') {
      const rx = Math.min(cd.startX, cd.currX), ry = Math.min(cd.startY, cd.currY)
      const rw = Math.abs(cd.currX - cd.startX), rh = Math.abs(cd.currY - cd.startY)
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, W, H)
      ctx.clearRect(rx, ry, rw, rh)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 3])
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh)
      ctx.restore()
    }

    // Selection overlay (wand / lasso / marquee)
    if (hasSelectionRef.current && selectionRef.current) {
      const sel = selectionRef.current
      const tf   = transformsRef.current[sel.layerId]
      const bbox = bboxesRef.current[sel.layerId]
      ctx.save()
      if (tf && bbox) {
        const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
        ctx.translate(cx + tf.tx, cy + tf.ty)
        ctx.rotate(tf.rotation)
        ctx.scale(tf.scaleX, tf.scaleY)
        ctx.translate(-cx, -cy)
      }
      ctx.globalAlpha = 0.28
      ctx.drawImage(sel.displayBlue, 0, 0)
      const phase = Math.floor(Date.now() / 150) % 2
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(phase === 0 ? sel.outlineWhite : sel.outlineBlack, 0, 0)
      ctx.restore()
    }
    // Lasso preview
    if (lassoDrawingRef.current && lassoPtsRef.current.length > 1) {
      ctx.save()
      ctx.strokeStyle = '#3a9fff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(lassoPtsRef.current[0].x, lassoPtsRef.current[0].y)
      for (const pt of lassoPtsRef.current.slice(1)) ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
      ctx.restore()
    }
    // Marquee preview
    if (marqueeDragRef.current) {
      const md = marqueeDragRef.current
      ctx.save()
      ctx.strokeStyle = '#3a9fff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
      ctx.strokeRect(Math.min(md.startX, md.currX), Math.min(md.startY, md.currY), Math.abs(md.currX - md.startX), Math.abs(md.currY - md.startY))
      ctx.restore()
    }

    // Polygon vertex handles (grab tool or polygon tool + active polygon layer)
    if (toolRef.current === 'grab' || toolRef.current === 'polygon') {
      const pid = activeIdRef.current
      const pmeta = polyLayersRef.current[pid]
      if (pmeta) {
        ctx.save()
        pmeta.vertices.forEach(([vx, vy], i) => {
          const hov = i === hoveredVertIdxRef.current
          ctx.beginPath()
          ctx.arc(vx, vy, hov ? 8 : 6, 0, Math.PI * 2)
          ctx.fillStyle = hov ? '#ffffff' : '#F0A020'
          ctx.fill()
          ctx.strokeStyle = hov ? '#F0A020' : '#fff'
          ctx.lineWidth = hov ? 2 : 1.5
          ctx.stroke()
        })
        ctx.restore()
      }
    }
  }, [])

  useEffect(() => { composite() }, [layers, canvasW, canvasH, studioView, composite])

  // ─── Refresh layer ─────────────────────────────────────────────────────────

  const refreshLayer = useCallback((id: string) => {
    const c = offscreen.current[id]; if (!c) return
    const bbox = computeBBox(c)
    setBboxes(prev => {
      const n = { ...prev }
      if (bbox) n[id] = bbox; else delete n[id]
      return n
    })
    if (bbox) bboxesRef.current = { ...bboxesRef.current, [id]: bbox }
    else { const n = { ...bboxesRef.current }; delete n[id]; bboxesRef.current = n }

    const TMAX = 220
    if (bbox) {
      const scale = Math.min(TMAX / bbox.w, TMAX / bbox.h, 1)
      const tw = Math.round(bbox.w * scale), th = Math.round(bbox.h * scale)
      const thumb = makeCanvas(tw, th); const tc = thumb.getContext('2d')!
      tc.drawImage(c, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, tw, th)
      setThumbs(prev => ({ ...prev, [id]: thumb.toDataURL() }))
    } else if (c.width > 0 && c.height > 0) {
      const scale = Math.min(TMAX / c.width, TMAX / c.height, 1)
      const tw = Math.round(c.width * scale), th = Math.round(c.height * scale)
      const thumb = makeCanvas(tw, th); const tc = thumb.getContext('2d')!
      tc.drawImage(c, 0, 0, tw, th)
      setThumbs(prev => ({ ...prev, [id]: thumb.toDataURL() }))
    }
  }, [])

  // Compute bbox from font metrics and update thumbnail for a vector text layer
  const refreshTextLayer = useCallback((id: string, meta: TextMeta) => {
    const tmp = makeCanvas(1, 1); const tc = tmp.getContext('2d')!
    tc.font = `bold ${meta.fontSize}px ${meta.fontFamily}`
    const lineH = meta.fontSize * 1.25
    const lines = meta.w ? wrapText(tc, meta.text, meta.w) : [meta.text]
    const maxW = meta.w ?? Math.max(...lines.map(l => tc.measureText(l).width))
    const totalH = lines.length * lineH
    const bbox: BBox = { x: meta.x, y: meta.y, w: Math.ceil(maxW) || 1, h: Math.ceil(totalH) || 1 }
    setBboxes(prev => ({ ...prev, [id]: bbox }))
    bboxesRef.current = { ...bboxesRef.current, [id]: bbox }

    const { w: cw, h: ch } = dimsRef.current
    const TMAX = 220
    const scale = Math.min(TMAX / bbox.w, TMAX / bbox.h, 1)
    const tw = Math.round(bbox.w * scale), th = Math.round(bbox.h * scale)
    const tmpFull = makeCanvas(cw, ch)
    renderTextLayer(tmpFull.getContext('2d')!, meta)
    const thumbCanvas = makeCanvas(tw, th)
    thumbCanvas.getContext('2d')!.drawImage(tmpFull, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, tw, th)
    setThumbs(prev => ({ ...prev, [id]: thumbCanvas.toDataURL() }))
  }, [])

  // ─── Drawing helpers ───────────────────────────────────────────────────────

  function activeCtx() {
    const c = offscreen.current[activeIdRef.current]
    return c?.getContext('2d') ?? null
  }

  function canvasCoords(e: React.MouseEvent<HTMLElement> | React.DragEvent<HTMLElement>) {
    const el = displayRef.current!
    const r  = el.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (el.width  / r.width),
      y: (e.clientY - r.top)  * (el.height / r.height),
    }
  }

  function canvasCoordsFromClient(cx: number, cy: number) {
    const el = displayRef.current!
    const r  = el.getBoundingClientRect()
    return {
      x: (cx - r.left) * (el.width  / r.width),
      y: (cy - r.top)  * (el.height / r.height),
    }
  }

  function layerCoords(mx: number, my: number, id: string) {
    const bbox = bboxesRef.current[id]
    const tf   = transformsRef.current[id]
    if (!bbox || !tf) return { x: mx, y: my }
    return inverseTransformPt(mx, my, bbox, tf)
  }

  function stamp(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const t = toolRef.current, shape = brushShapeRef.current
    const size = brushSizeRef.current, r = size / 2
    ctx.save()
    if (t === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      if (shape === 'soft') {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, hexAlpha(colorRef.current, paintOpacityRef.current / 100))
        g.addColorStop(1, hexAlpha(colorRef.current, 0))
        ctx.fillStyle = g
      } else {
        ctx.fillStyle = hexAlpha(colorRef.current, paintOpacityRef.current / 100)
      }
    }
    if (shape === 'square') ctx.fillRect(x - r, y - r, size, size)
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  }

  function segment(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const dx = x1-x0, dy = y1-y0
    const dist = Math.sqrt(dx*dx + dy*dy)
    const step = Math.max(0.5, brushSizeRef.current * 0.2)
    const n = Math.ceil(dist / step)
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n
      stamp(ctx, x0 + dx*t, y0 + dy*t)
    }
  }

  function startSmoothRAF() {
    if (rafRef.current !== null) return
    const tick = () => {
      if (!drawing.current) { rafRef.current = null; return }
      const tgt = targetPosRef.current, cur = smoothPosRef.current
      if (tgt && cur) {
        const s = smoothingRef.current / 100
        const factor = 1 - s * 0.94
        const nx = cur.x + (tgt.x - cur.x) * factor
        const ny = cur.y + (tgt.y - cur.y) * factor
        const ctx = activeCtx()
        if (ctx) {
          const id = activeIdRef.current
          const lc = layerCoords(cur.x, cur.y, id)
          const ln = layerCoords(nx, ny, id)
          segment(ctx, lc.x, lc.y, ln.x, ln.y)
          composite()
        }
        smoothPosRef.current = { x: nx, y: ny }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function saveHistory() {
    const id = activeIdRef.current
    const c = offscreen.current[id]; if (!c) return
    const before = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
    historyStack.current.push({ type: 'pixel', layerId: id, before })
    if (historyStack.current.length > 40) historyStack.current.shift()
    redoStack.current = []
    dirtyLayerIdsRef.current.add(id)
    scheduleAutoSave()
  }

  function saveStructure() {
    historyStack.current.push({
      type: 'structure',
      layers: [...layersRef.current],
      transforms: { ...transformsRef.current },
      bboxes: { ...bboxesRef.current },
      textLayers: { ...textLayersRef.current },
      charLayers: { ...charLayersRef.current },
      polyLayers: { ...polyLayersRef.current },
    })
    if (historyStack.current.length > 40) historyStack.current.shift()
    redoStack.current = []
    scheduleAutoSave()
  }

  // Mark a layer's canvas as user-modified (needs full pixel data in server saves)
  function markLayerDirty(id: string) {
    dirtyLayerIdsRef.current.add(id)
  }

  // ─── Auto-save ─────────────────────────────────────────────────────────────

  const lastServerSaveAt = useRef(0)

  function scheduleAutoSave() {
    // Tier 1: IndexedDB after 5s of inactivity
    if (idbSaveTimerRef.current) clearTimeout(idbSaveTimerRef.current)
    idbSaveTimerRef.current = setTimeout(() => { void saveToIndexedDB() }, 5000)
    // Tier 2: server after 15s of inactivity, max once per 30s
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      if (Date.now() - lastServerSaveAt.current < 30_000) return
      void handleSaveDraftSilent()
    }, 15000)
  }

  async function saveToIndexedDB() {
    if (!address) return
    const display = displayRef.current; if (!display) return
    composite()
    const thumbW = 400, thumbH = Math.round(400 * dimsRef.current.h / dimsRef.current.w)
    const thumbCanvas = makeCanvas(thumbW, thumbH)
    thumbCanvas.getContext('2d')!.drawImage(display, 0, 0, thumbW, thumbH)
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.75)
    const canvasData: Record<string, string> = {}
    const yieldToIdle = () => new Promise<void>(r => {
      if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(() => r())
      else setTimeout(r, 0)
    })
    for (const [id, c] of Object.entries(offscreen.current)) {
      await yieldToIdle()
      canvasData[id] = c.toDataURL('image/png')
    }
    const snapshot: SessionSnapshot = {
      id: currentDraftId ?? '',
      wallet: address,
      title: `Autosave ${new Date().toISOString()}`,
      thumbnail,
      updatedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      canvasW: dimsRef.current.w,
      canvasH: dimsRef.current.h,
      layers: layersRef.current,
      transforms: transformsRef.current,
      bboxes: bboxesRef.current,
      textLayers: textLayersRef.current,
      charLayers: charLayersRef.current,
      polyLayers: polyLayersRef.current,
      canvasData,
      inActionSnapshots: { ...inActionCharSnapshotRef.current },
      inActionHasSnapshot: { ...inActionHasSnapshot },
    }
    await saveSession(snapshot)
  }

  async function handleSaveDraftSilent() {
    if (savingDraft) return
    setSavingDraft(true)
    setAutoSaveStatus('saving')
    if (autoSaveMsgTimer.current) clearTimeout(autoSaveMsgTimer.current)
    try {
      await _doSaveDraft()
      lastServerSaveAt.current = Date.now()
      setAutoSaveStatus('saved')
    } catch {
      setAutoSaveStatus('error')
    } finally {
      setSavingDraft(false)
      autoSaveMsgTimer.current = setTimeout(() => setAutoSaveStatus('idle'), 3000)
    }
  }

  // Re-measure textarea height whenever the box width or value changes
  useEffect(() => {
    if (textAreaFrameRef.current) autoResizeTextArea(textAreaFrameRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput?.screenW, textInput?.value])

  // Auto-commit magic label text without user typing
  useEffect(() => {
    if (textInput?.autoCommitText !== undefined) {
      // Sync value into ref then commit on next tick so canvas state is ready
      const t = setTimeout(() => commitText(), 0)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput?.autoCommitText])

  // ─── Magic Labels ────────────────────────────────────────────────────────────

  async function generateMagicLabels(charKey: string, title: string): Promise<string[]> {
    const lore: CharData | undefined = ALL_CHARS.find(c => c.key === charKey)
    const charName = lore?.name ?? charKey
    return generateMemeLabels(
      { name: charName, tagline: lore?.tagline, lore: lore?.lore, traits: lore?.traits },
      title,
    )
  }

  function triggerMagicLabels(charId: string, charKey: string, title: string) {
    // Don't re-generate if already in progress for this exact title
    if (magicLabelGenerating.has(charId)) return
    setMagicLabelGenerating(prev => new Set([...prev, charId]))
    // Reset any previous set so the button shows loading state
    setMagicLabelSets(prev => { const n = { ...prev }; delete n[charId]; return n })
    generateMagicLabels(charKey, title)
      .then(labels => setMagicLabelSets(prev => ({ ...prev, [charId]: { labels, used: 0 } })))
      .catch(() => {/* silent — button just won't appear */})
      .finally(() => setMagicLabelGenerating(prev => { const n = new Set(prev); n.delete(charId); return n }))
  }

  function handleMagicLabelDragStart(e: React.DragEvent, charId: string) {
    const set = magicLabelSets[charId]
    if (!set || set.labels.length === 0) return
    e.dataTransfer.setData('application/vvc-magic-label', JSON.stringify({ labels: set.labels, linkedCharId: charId }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // ─── Text tool ─────────────────────────────────────────────────────────────

  function openTextEdit(layerId: string) {
    const meta = textLayersRef.current[layerId]; if (!meta) return
    setFontFamily(meta.fontFamily); fontFamilyRef.current = meta.fontFamily
    setFontSize(meta.fontSize);     fontSizeRef.current   = meta.fontSize
    setColor(meta.color);           colorRef.current      = meta.color
    const ta = meta.textAlign ?? 'left'
    setTextAlign(ta);               textAlignRef.current  = ta
    setTextBgColor(meta.bgColor ?? '')
    setActiveId(layerId);           activeIdRef.current   = layerId
    editingTextLayerRef.current = layerId
    composite() // hide text while the overlay is open
    const el = displayRef.current!
    const rect = el.getBoundingClientRect()
    const ratio = rect.width / el.width
    const tf = transformsRef.current[layerId] ?? IDENTITY_TF
    const bbox = bboxesRef.current[layerId] ?? { x: meta.x, y: meta.y, w: 120, h: meta.fontSize * 1.25 }
    const corners = bboxCorners(bbox, tf)
    const [tl, tr, , bl] = corners
    const scX = rect.left + tl[0] * ratio
    const scY = rect.top  + tl[1] * ratio
    const scW = Math.hypot((tr[0] - tl[0]) * ratio, (tr[1] - tl[1]) * ratio)
    const scH = Math.hypot((bl[0] - tl[0]) * ratio, (bl[1] - tl[1]) * ratio)
    // Always give a wrap width so we always use the textarea+handles branch.
    // For layers that were single-line (no meta.w), use bbox width as the initial wrap width.
    const effectiveW = meta.w ?? bbox.w
    const effectiveScW = meta.w ? scW : Math.max(scW, 60)
    setTextInput({
      x: meta.x, y: meta.y,
      screenX: scX, screenY: scY,
      value: meta.text,
      w: effectiveW,
      screenW: effectiveScW, screenH: scH,
      screenRotation: tf.rotation,
      screenFontSize: meta.fontSize * ratio * Math.abs(tf.scaleY),
      textAlign: meta.textAlign ?? 'left',
      editingLayerId: layerId,
    })
  }

  function cancelTextEdit() {
    editingTextLayerRef.current = null
    setTextInput(null)
    composite()
  }

  const textAreaFrameRef = useRef<HTMLTextAreaElement>(null)

  function autoResizeTextArea(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  function startTextResize(e: React.MouseEvent, side: 'l' | 'r') {
    e.preventDefault()
    e.stopPropagation()
    const init = textInput!
    const startClientX = e.clientX
    const canvasEl = displayRef.current!
    const ratio = canvasEl.getBoundingClientRect().width / canvasEl.width
    const tf = init.editingLayerId ? (transformsRef.current[init.editingLayerId] ?? IDENTITY_TF) : IDENTITY_TF
    const scaleX = Math.abs(tf.scaleX || 1)
    const MIN_SCREEN_W = 40

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startClientX
      let newScreenW: number, newScreenX: number, newX: number

      if (side === 'r') {
        newScreenW = Math.max(MIN_SCREEN_W, init.screenW! + dx)
        newScreenX = init.screenX
        newX = init.x
      } else {
        newScreenW = Math.max(MIN_SCREEN_W, init.screenW! - dx)
        newScreenX = init.screenX + init.screenW! - newScreenW
        newX = init.x + (newScreenX - init.screenX) / ratio
      }

      const newW = newScreenW / ratio / scaleX
      setTextInput(prev => prev ? { ...prev, screenX: newScreenX, screenW: newScreenW, x: newX, w: newW } : null)
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startLinkDrag(e: React.MouseEvent, textId: string) {
    e.preventDefault()
    e.stopPropagation()
    const canvasEl = displayRef.current!
    const rect = canvasEl.getBoundingClientRect()

    const update = (clientX: number, clientY: number) => {
      const x = clientX - rect.left
      const y = clientY - rect.top
      const ratio = rect.width / canvasEl.width
      const cx = (clientX - rect.left) / ratio
      const cy = (clientY - rect.top)  / ratio
      let overCharId: string | null = null
      for (const layer of [...layersRef.current].reverse()) {
        if (!layer.visible || !charLayersRef.current[layer.id]) continue
        if (grabHitTest(cx, cy, layer.id)) { overCharId = layer.id; break }
      }
      const next: LinkDragState = { textId, x, y, overCharId }
      linkDragRef.current = next
      setLinkDrag(next)
    }

    update(e.clientX, e.clientY)

    const onMove = (ev: MouseEvent) => update(ev.clientX, ev.clientY)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const state = linkDragRef.current
      if (state?.overCharId) {
        const charId = state.overCharId
        setTextLayers(prev => ({ ...prev, [state.textId]: { ...prev[state.textId], linkedCharId: charId } }))
        textLayersRef.current = { ...textLayersRef.current, [state.textId]: { ...textLayersRef.current[state.textId], linkedCharId: charId } }
        composite()
      }
      linkDragRef.current = null
      setLinkDrag(null)
      hoveredUnlinkedIdRef.current = null
      setHoveredUnlinkedId(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function commitText() {
    if (!textInput) return
    markRemixChanged()
    const text   = textInput.value.trim()
    const editId = textInput.editingLayerId
    editingTextLayerRef.current = null

    if (!text) {
      // Empty input: close overlay; existing layer keeps its previous text
      setTextInput(null)
      composite()
      return
    }

    saveStructure()

    const targetId = editId ?? `text_${Date.now()}`

    if (!editId) {
      const { w, h } = dimsRef.current
      const c = makeCanvas(w, h)
      offscreen.current[targetId] = c
      const layerName = textInput.subtype === 'title' ? 'Title'
        : textInput.subtype === 'label' ? 'Label' : 'Text'
      const newLayer: Layer = { id: targetId, name: layerName, visible: true, opacity: 100 }
      layersRef.current = [...layersRef.current, newLayer]
      setLayers(prev => [...prev, newLayer])
      setActiveId(targetId)
      activeIdRef.current = targetId
    }

    const _sub = textInput.subtype ?? textLayersRef.current[targetId ?? '']?.subtype
    const _defBg = _sub === 'title' ? titleDefBgColorRef.current : _sub === 'label' ? labelDefBgColorRef.current : textBgColor
    const meta: TextMeta = {
      text, x: textInput.x, y: textInput.y,
      fontFamily: fontFamilyRef.current,
      fontSize:   fontSizeRef.current,
      color:      colorRef.current,
      w: textInput.w,
      textAlign: textAlignRef.current,
      subtype: _sub,
      linkedCharId: textInput.linkedCharId ?? textLayersRef.current[targetId ?? '']?.linkedCharId,
      bgColor: _defBg || undefined,
    }
    setTextLayers(prev => ({ ...prev, [targetId]: meta }))
    textLayersRef.current = { ...textLayersRef.current, [targetId]: meta }
    refreshTextLayer(targetId, meta)
    composite()
    setTextInput(null)

    // Auto-select linked character so user can keep dragging & dropping labels
    if (meta.linkedCharId && charLayersRef.current[meta.linkedCharId]) {
      setActiveId(meta.linkedCharId)
      activeIdRef.current = meta.linkedCharId
    }

    // Auto-generate magic labels when a title is committed for a character
    if (meta.subtype === 'title' && meta.linkedCharId && text) {
      const charMeta = charLayersRef.current[meta.linkedCharId]
      if (charMeta) triggerMagicLabels(meta.linkedCharId, charMeta.charKey, text)
    }
  }

  // Sync toolbar controls to a text layer's stored meta (called on selection)
  function syncTextControls(id: string) {
    const meta = textLayersRef.current[id]; if (!meta) return
    setFontFamily(meta.fontFamily); fontFamilyRef.current = meta.fontFamily
    setFontSize(meta.fontSize);     fontSizeRef.current   = meta.fontSize
    setColor(meta.color);           colorRef.current      = meta.color
    const ta = meta.textAlign ?? 'left'
    setTextAlign(ta);               textAlignRef.current  = ta
    setTextBgColor(meta.bgColor ?? '')
  }

  // Live-update a text layer's style from the toolbar without opening the edit overlay
  function updateTextStyle(patch: Partial<Pick<TextMeta, 'fontFamily' | 'fontSize' | 'color' | 'textAlign' | 'bgColor'>>) {
    const id = activeIdRef.current
    const meta = textLayersRef.current[id]; if (!meta) return
    saveStructure()
    const newMeta = { ...meta, ...patch }
    setTextLayers(prev => ({ ...prev, [id]: newMeta }))
    textLayersRef.current = { ...textLayersRef.current, [id]: newMeta }
    refreshTextLayer(id, newMeta)
    composite()
    // Persist all style settings as per-subtype defaults
    const isTitleOrLabel = meta.subtype === 'title' || meta.subtype === 'label'
    if (isTitleOrLabel) {
      const setter = meta.subtype === 'title'
        ? { ff: setTitleDefFontFamily, ffr: titleDefFontFamilyRef, fs: setTitleDefFontSize, fsr: titleDefFontSizeRef, fc: setTitleDefColor, fcr: titleDefColorRef, fa: setTitleDefTextAlign, far: titleDefTextAlignRef, fb: setTitleDefBgColor, fbr: titleDefBgColorRef }
        : { ff: setLabelDefFontFamily, ffr: labelDefFontFamilyRef, fs: setLabelDefFontSize, fsr: labelDefFontSizeRef, fc: setLabelDefColor, fcr: labelDefColorRef, fa: setLabelDefTextAlign, far: labelDefTextAlignRef, fb: setLabelDefBgColor, fbr: labelDefBgColorRef }
      if (patch.fontFamily  !== undefined) { setter.ff(patch.fontFamily);  setter.ffr.current = patch.fontFamily }
      if (patch.fontSize    !== undefined) { setter.fs(patch.fontSize);    setter.fsr.current = patch.fontSize }
      if (patch.color       !== undefined) { setter.fc(patch.color);       setter.fcr.current = patch.color }
      if (patch.textAlign   !== undefined) { setter.fa(patch.textAlign);   setter.far.current = patch.textAlign }
      if (patch.bgColor     !== undefined) { setter.fb(patch.bgColor);     setter.fbr.current = patch.bgColor }
    }
  }

  function commitInlineTextEdit(id: string, val: string) {
    const meta = textLayersRef.current[id]; if (!meta) return
    const newMeta = { ...meta, text: val }
    setTextLayers(prev => ({ ...prev, [id]: newMeta }))
    textLayersRef.current = { ...textLayersRef.current, [id]: newMeta }
    refreshTextLayer(id, newMeta)
    composite()
    setInlineEditingTextId(null)
    // Re-generate magic labels when a title is edited
    if (newMeta.subtype === 'title' && newMeta.linkedCharId && val.trim()) {
      const charMeta = charLayersRef.current[newMeta.linkedCharId]
      if (charMeta) triggerMagicLabels(newMeta.linkedCharId, charMeta.charKey, val.trim())
    }
  }

  function addTextAt(cx: number, cy: number, subtype: 'title' | 'label', linkedCharId?: string, prefillText?: string, centered?: boolean, overrideW?: number) {
    setGrabMenu(null)
    const ff = subtype === 'title' ? titleDefFontFamilyRef.current : labelDefFontFamilyRef.current
    const fs = subtype === 'title' ? titleDefFontSizeRef.current   : labelDefFontSizeRef.current
    const fc = subtype === 'title' ? titleDefColorRef.current      : labelDefColorRef.current
    const fa = centered ? 'center' : (subtype === 'title' ? titleDefTextAlignRef.current  : labelDefTextAlignRef.current)
    const fb = subtype === 'title' ? titleDefBgColorRef.current    : labelDefBgColorRef.current
    fontFamilyRef.current = ff; fontSizeRef.current = fs; colorRef.current = fc; textAlignRef.current = fa
    setFontFamily(ff); setFontSize(fs); setColor(fc); setTextAlign(fa); setTextBgColor(fb)
    const el = displayRef.current!
    const rect = el.getBoundingClientRect()
    const ratio = rect.width / el.width
    const w = overrideW ?? fs * 12
    const { w: canvasW } = dimsRef.current
    const xLeft = Math.max(0, Math.min(canvasW - w, centered ? cx - w / 2 : cx))
    const oneLineH = fs * 1.3
    setTextInput({
      x: xLeft, y: cy,
      screenX: rect.left + xLeft * ratio,
      screenY: rect.top  + cy * ratio,
      value: prefillText ?? '',
      w,
      screenW: w * ratio,
      screenH: centered ? oneLineH * ratio : undefined,
      screenFontSize: fs * ratio,
      textAlign: fa,
      subtype,
      linkedCharId,
      ...(prefillText !== undefined ? { autoCommitText: prefillText } : {}),
    })
  }

  // Click "Add Title / Add Label" button above selected character
  function handleAddTextForChar(subtype: 'title' | 'label') {
    const charId = activeIdRef.current
    const bbox = bboxesRef.current[charId]; if (!bbox) return
    const tf = transformsRef.current[charId] ?? IDENTITY_TF
    const corners = bboxCorners(bbox, tf)
    const [tl, tr, br, bl] = corners
    if (subtype === 'title') {
      const cx    = (tl[0] + tr[0]) / 2
      const fs    = titleDefFontSizeRef.current
      const titleW = fs * 12                          // ~4 words at default size
      const topY  = Math.min(...corners.map(p => p[1]))
      const cy    = topY - fs * 2.5                   // one line height + gap above character
      addTextAt(cx, cy, 'title', charId, undefined, true, titleW)
    } else {
      const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4
      const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4
      addTextAt(cx, cy, 'label', charId)
    }
  }

  function handleTextBtnDragStart(e: React.DragEvent, subtype: 'title' | 'label') {
    e.dataTransfer.setData('application/vvc-text-btn', JSON.stringify({
      subtype, linkedCharId: activeIdRef.current,
    }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // ─── Grab hit test ─────────────────────────────────────────────────────────

  function grabHitTest(mx: number, my: number, id: string): GrabHandle | null {
    const bbox = bboxesRef.current[id]; if (!bbox) return null
    const tf = transformsRef.current[id] ?? IDENTITY_TF
    const corners = bboxCorners(bbox, tf)
    const rhPt = rotateHandlePt(corners)
    const CR = 10, RR = 10
    if (Math.hypot(mx - rhPt[0], my - rhPt[1]) < RR) return 'rotate'
    const [tl, tr, br, bl] = corners
    const CHK: [GrabHandle, number][] = [['tl',0],['tr',1],['br',2],['bl',3]]
    for (const [h, i] of CHK) {
      const [cx, cy] = corners[i]
      if (Math.hypot(mx - cx, my - cy) < CR) return h
    }
    const MIDS: [GrabHandle, [number,number]][] = [
      ['n', [(tl[0]+tr[0])/2, (tl[1]+tr[1])/2]],
      ['e', [(tr[0]+br[0])/2, (tr[1]+br[1])/2]],
      ['s', [(br[0]+bl[0])/2, (br[1]+bl[1])/2]],
      ['w', [(bl[0]+tl[0])/2, (bl[1]+tl[1])/2]],
    ]
    for (const [h, [px, py]] of MIDS) {
      if (Math.hypot(mx - px, my - py) < CR) return h
    }
    if (ptInPoly(mx, my, corners)) return 'move'
    return null
  }

  // ─── Snap computation ─────────────────────────────────────────────────────
  function computeSnap(
    layerId: string,
    rawTx: number, rawTy: number,
  ): { tx: number; ty: number; lines: { axis: 'h'|'v'; pos: number }[] } {
    const THRESHOLD = 6
    const bbox = bboxesRef.current[layerId]
    if (!bbox) return { tx: rawTx, ty: rawTy, lines: [] }
    const tf = transformsRef.current[layerId] ?? IDENTITY_TF
    const cx  = bbox.x + bbox.w / 2 + rawTx
    const cy  = bbox.y + bbox.h / 2 + rawTy
    const hw  = (bbox.w / 2) * Math.abs(tf.scaleX)
    const hh  = (bbox.h / 2) * Math.abs(tf.scaleY)
    const candX = [cx - hw, cx, cx + hw]
    const candY = [cy - hh, cy, cy + hh]
    const { w: cW, h: cH } = dimsRef.current
    const targX = [0, cW / 2, cW]
    const targY = [0, cH / 2, cH]
    for (const layer of layersRef.current) {
      if (layer.id === layerId || layer.id === 'bg' || !layer.visible) continue
      if (selectedIdsRef.current.has(layer.id)) continue
      const ob = bboxesRef.current[layer.id]; if (!ob) continue
      const otf = transformsRef.current[layer.id] ?? IDENTITY_TF
      const ocx = ob.x + ob.w / 2 + otf.tx, ocy = ob.y + ob.h / 2 + otf.ty
      const ohw = (ob.w / 2) * Math.abs(otf.scaleX), ohh = (ob.h / 2) * Math.abs(otf.scaleY)
      targX.push(ocx - ohw, ocx, ocx + ohw)
      targY.push(ocy - ohh, ocy, ocy + ohh)
    }
    const lines: { axis: 'h'|'v'; pos: number }[] = []
    let snappedTx = rawTx, snappedTy = rawTy
    let bestDx = THRESHOLD + 1, snapTX: number | null = null, snapCX: number | null = null
    for (const c of candX) for (const t of targX) { const d = Math.abs(c - t); if (d < bestDx) { bestDx = d; snapTX = t; snapCX = c } }
    if (snapTX !== null && snapCX !== null) { snappedTx = rawTx + (snapTX - snapCX); lines.push({ axis: 'v', pos: snapTX }) }
    let bestDy = THRESHOLD + 1, snapTY: number | null = null, snapCY: number | null = null
    for (const c of candY) for (const t of targY) { const d = Math.abs(c - t); if (d < bestDy) { bestDy = d; snapTY = t; snapCY = c } }
    if (snapTY !== null && snapCY !== null) { snappedTy = rawTy + (snapTY - snapCY); lines.push({ axis: 'h', pos: snapTY }) }
    return { tx: snappedTx, ty: snappedTy, lines }
  }

  // ─── Alignment helpers ────────────────────────────────────────────────────
  function alignToCanvas(edge: 'left'|'centerH'|'right'|'top'|'centerV'|'bottom') {
    const id = activeIdRef.current; if (id === 'bg') return
    saveStructure()
    const bbox = bboxesRef.current[id]; if (!bbox) return
    const tf = transformsRef.current[id] ?? IDENTITY_TF
    const { w: cW, h: cH } = dimsRef.current
    const rawCx = bbox.x + bbox.w / 2, rawCy = bbox.y + bbox.h / 2
    const hw = (bbox.w / 2) * Math.abs(tf.scaleX), hh = (bbox.h / 2) * Math.abs(tf.scaleY)
    const newTf = { ...tf }
    if (edge === 'left')    newTf.tx = -rawCx + hw
    if (edge === 'centerH') newTf.tx = cW / 2 - rawCx
    if (edge === 'right')   newTf.tx = cW - rawCx - hw
    if (edge === 'top')     newTf.ty = -rawCy + hh
    if (edge === 'centerV') newTf.ty = cH / 2 - rawCy
    if (edge === 'bottom')  newTf.ty = cH - rawCy - hh
    setTransforms(prev => ({ ...prev, [id]: newTf }))
    transformsRef.current = { ...transformsRef.current, [id]: newTf }
    composite()
  }

  function alignSelection(alignment: 'left'|'centerH'|'right'|'top'|'centerV'|'bottom'|'distH'|'distV') {
    const ids = [...selectedIdsRef.current].filter(id => id !== 'bg' && bboxesRef.current[id])
    if (ids.length < 2) return
    saveStructure()
    const bounds = ids.map(id => {
      const bbox = bboxesRef.current[id]!
      const tf = transformsRef.current[id] ?? IDENTITY_TF
      const rawCx = bbox.x + bbox.w / 2, rawCy = bbox.y + bbox.h / 2
      const eCx = rawCx + tf.tx, eCy = rawCy + tf.ty
      const hw = (bbox.w / 2) * Math.abs(tf.scaleX), hh = (bbox.h / 2) * Math.abs(tf.scaleY)
      return { id, tf, rawCx, rawCy, eCx, eCy, hw, hh,
        left: eCx - hw, right: eCx + hw, top: eCy - hh, bottom: eCy + hh }
    })
    const newTfs: Record<string, LayerTransform> = {}
    if (alignment === 'left') {
      const t = Math.min(...bounds.map(b => b.left))
      bounds.forEach(b => { newTfs[b.id] = { ...b.tf, tx: t + b.hw - b.rawCx } })
    } else if (alignment === 'centerH') {
      const t = (Math.min(...bounds.map(b => b.left)) + Math.max(...bounds.map(b => b.right))) / 2
      bounds.forEach(b => { newTfs[b.id] = { ...b.tf, tx: t - b.rawCx } })
    } else if (alignment === 'right') {
      const t = Math.max(...bounds.map(b => b.right))
      bounds.forEach(b => { newTfs[b.id] = { ...b.tf, tx: t - b.hw - b.rawCx } })
    } else if (alignment === 'top') {
      const t = Math.min(...bounds.map(b => b.top))
      bounds.forEach(b => { newTfs[b.id] = { ...b.tf, ty: t + b.hh - b.rawCy } })
    } else if (alignment === 'centerV') {
      const t = (Math.min(...bounds.map(b => b.top)) + Math.max(...bounds.map(b => b.bottom))) / 2
      bounds.forEach(b => { newTfs[b.id] = { ...b.tf, ty: t - b.rawCy } })
    } else if (alignment === 'bottom') {
      const t = Math.max(...bounds.map(b => b.bottom))
      bounds.forEach(b => { newTfs[b.id] = { ...b.tf, ty: t - b.hh - b.rawCy } })
    } else if (alignment === 'distH' && ids.length >= 3) {
      const sorted = [...bounds].sort((a, b) => a.eCx - b.eCx)
      const step = (sorted[sorted.length-1].eCx - sorted[0].eCx) / (sorted.length - 1)
      sorted.forEach((b, i) => { newTfs[b.id] = { ...b.tf, tx: sorted[0].eCx + i * step - b.rawCx } })
    } else if (alignment === 'distV' && ids.length >= 3) {
      const sorted = [...bounds].sort((a, b) => a.eCy - b.eCy)
      const step = (sorted[sorted.length-1].eCy - sorted[0].eCy) / (sorted.length - 1)
      sorted.forEach((b, i) => { newTfs[b.id] = { ...b.tf, ty: sorted[0].eCy + i * step - b.rawCy } })
    }
    setTransforms(prev => ({ ...prev, ...newTfs }))
    transformsRef.current = { ...transformsRef.current, ...newTfs }
    composite()
  }

  // ─── Character drop ────────────────────────────────────────────────────────

  async function dropCharacter(charKey: string, charName: string, charFile: string, cx: number, cy: number, charGroup?: string) {
    saveStructure()
    const id = `char_${charKey}_${Date.now()}`
    const { w, h } = dimsRef.current
    const c = makeCanvas(w, h)
    offscreen.current[id] = c

    const layer: Layer = { id, name: charName, visible: true, opacity: 100 }
    setLayers(prev => [...prev, layer])
    setActiveId(id)
    activeIdRef.current = id
    let dropX = 0, dropY = 0, dropW = DROP_SIZE, dropH = DROP_SIZE
    try {
      const charData = ALL_CHARS.find(ch => ch.key === charKey)
      const folder = (charGroup === 'extended' || charData?.group === 'extended') ? '/assets/cast' : '/assets/chars'
      const ext = charData?.ext ?? 'png'
      const img = await loadImage(`${folder}/${charFile}.${ext}`)
      const scale = Math.min(DROP_SIZE / img.width, DROP_SIZE / img.height, 1)
      dropW = img.width * scale; dropH = img.height * scale
      dropX = cx - dropW / 2;   dropY  = cy - dropH / 2
      c.getContext('2d')!.drawImage(img, dropX, dropY, dropW, dropH)
    } catch { /* leave blank */ }
    const meta: CharMeta = { charKey, charName, charFile, charGroup, dropX, dropY, dropW, dropH }
    setCharLayers(prev => ({ ...prev, [id]: meta }))
    charLayersRef.current = { ...charLayersRef.current, [id]: meta }

    refreshLayer(id)
    composite()
  }

  // ─── Draft / New Document ──────────────────────────────────────────────────

  function handleNewDocument() {
    // A new document replaces the work in progress kept for "Continue" / reload
    if (address) void clearSession(address)
    setSessionWaiting(null)
    const c = makeCanvas(DEFAULT_W, DEFAULT_H)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, DEFAULT_W, DEFAULT_H)
    const bgLayer = { id: 'bg', name: 'Background', visible: true, opacity: 100 }
    setLayers([bgLayer]);         layersRef.current       = [bgLayer]
    setActiveId('bg');            activeIdRef.current     = 'bg'
    setCanvasW(DEFAULT_W);        dimsRef.current.w       = DEFAULT_W
    setCanvasH(DEFAULT_H);        dimsRef.current.h       = DEFAULT_H
    setTransforms({});            transformsRef.current   = {}
    setBboxes({});                bboxesRef.current       = {}
    setTextLayers({});            textLayersRef.current   = {}
    setCharLayers({});            charLayersRef.current   = {}
    setPolyLayers({});            polyLayersRef.current   = {}
    offscreen.current             = { bg: c }
    inActionCharSnapshotRef.current = {}
    setInActionHasSnapshot({})
    inActionPendingBatchRef.current = {}
    setInActionPendingBatch({})
    inActionPrevImagesRef.current   = {}
    setInActionPrevImages({})
    historyStack.current = []; redoStack.current = []
    setCurrentDraftId(null)
    const TMAX = 220
    const s = Math.min(TMAX / DEFAULT_W, TMAX / DEFAULT_H, 1)
    const thumb = makeCanvas(Math.round(DEFAULT_W * s), Math.round(DEFAULT_H * s))
    const tc = thumb.getContext('2d')!
    tc.fillStyle = '#fff'; tc.fillRect(0, 0, thumb.width, thumb.height)
    tc.drawImage(c, 0, 0, thumb.width, thumb.height)
    setThumbs({ bg: thumb.toDataURL() })
    setStudioView('editor')
    setTimeout(() => composite(), 0)
  }

  // Core save logic — shared by manual save and auto-save
  async function _doSaveDraft() {
    const display = displayRef.current; if (!display) throw new Error('No canvas')
    composite()
    const thumbW = 400, thumbH = Math.round(400 * dimsRef.current.h / dimsRef.current.w)
    const thumbCanvas = makeCanvas(thumbW, thumbH)
    thumbCanvas.getContext('2d')!.drawImage(display, 0, 0, thumbW, thumbH)
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.75)

    // Smart serialization: skip text layers (reconstructed from textMeta),
    // skip clean char layers (re-drawn from /assets/chars/ on load),
    // always PNG — JPEG drops alpha channel, transparent areas go black on reload.
    const canvasData: Record<string, string> = {}
    const dirty = dirtyLayerIdsRef.current
    for (const [id, c] of Object.entries(offscreen.current)) {
      if (textLayersRef.current[id]) continue          // text: skip entirely
      const isChar = !!charLayersRef.current[id]
      if (isChar && !dirty.has(id)) continue           // clean char: skip, re-draw on load
      canvasData[id] = c.toDataURL('image/png')
    }

    const title = `Draft – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    const payload: DraftPayload = {
      id: currentDraftIdRef.current ?? '',
      wallet: address,
      title,
      thumbnail,
      updatedAt: new Date().toISOString(),
      canvasW: dimsRef.current.w,
      canvasH: dimsRef.current.h,
      layers: layersRef.current,
      transforms: transformsRef.current,
      bboxes: bboxesRef.current,
      textLayers: textLayersRef.current,
      charLayers: charLayersRef.current,
      polyLayers: polyLayersRef.current,
      canvasData,
      inActionSnapshots: { ...inActionCharSnapshotRef.current },
      inActionHasSnapshot: { ...inActionHasSnapshot },
    }

    const { id } = await saveDraft(payload)
    currentDraftIdRef.current = id
    setCurrentDraftId(id)
    // Server draft saved — clear the pending IDB session
    if (address) void clearSession(address)
  }

  async function handleSaveDraft() {
    if (savingDraft) return
    setSavingDraft(true)
    setSavedMsg(null)
    try {
      await _doSaveDraft()
      setSavedMsg('Saved!')
    } catch (err) {
      console.error('Save draft failed:', err)
      setSavedMsg('Failed')
    } finally {
      setSavingDraft(false)
      setTimeout(() => setSavedMsg(null), 2500)
    }
  }

  async function handleLoadDraft(payload: DraftPayload) {
    const w = payload.canvasW, h = payload.canvasH
    setCanvasW(w);  dimsRef.current.w = w
    setCanvasH(h);  dimsRef.current.h = h

    const restoredLayers = payload.layers
    setLayers(restoredLayers);          layersRef.current     = restoredLayers
    setTransforms(payload.transforms);  transformsRef.current = payload.transforms
    setBboxes(payload.bboxes);          bboxesRef.current     = payload.bboxes
    setTextLayers(payload.textLayers);  textLayersRef.current = payload.textLayers
    setCharLayers(payload.charLayers);  charLayersRef.current = payload.charLayers
    setPolyLayers(payload.polyLayers);  polyLayersRef.current = payload.polyLayers

    // Restore offscreen canvases
    offscreen.current = {}
    // Ensure every layer has a canvas, even if not in canvasData
    for (const layer of restoredLayers) {
      offscreen.current[layer.id] = makeCanvas(w, h)
    }
    // Load pixel data where present
    for (const [id, dataUrl] of Object.entries(payload.canvasData)) {
      const c = offscreen.current[id] ?? makeCanvas(w, h)
      offscreen.current[id] = c
      if (dataUrl) {
        try {
          const img = await loadImage(dataUrl)
          c.getContext('2d')!.drawImage(img, 0, 0)
        } catch { /* blank canvas fallback */ }
      }
    }
    // Re-draw clean char layers from source PNG (skipped in smart serialization)
    for (const [id, charMeta] of Object.entries(payload.charLayers as Record<string, CharMeta>)) {
      if (payload.canvasData[id]) continue  // already restored above
      const c = offscreen.current[id]
      if (!c) continue
      try {
        const img = await loadImage(`/assets/chars/${(charMeta as CharMeta).charFile}.png`)
        const ctx = c.getContext('2d')!
        if ((charMeta as CharMeta).dropX !== undefined) {
          const cm = charMeta as CharMeta
          ctx.drawImage(img, cm.dropX!, cm.dropY!, cm.dropW!, cm.dropH!)
        } else {
          const scale = Math.min(DROP_SIZE / img.width, DROP_SIZE / img.height, 1)
          const dw = img.width * scale, dh = img.height * scale
          ctx.drawImage(img, w / 2 - dw / 2, h / 2 - dh / 2, dw, dh)
        }
        dirtyLayerIdsRef.current.delete(id)  // clean — sourced from asset
      } catch { /* leave blank */ }
    }

    inActionCharSnapshotRef.current = { ...payload.inActionSnapshots }
    setInActionHasSnapshot({ ...payload.inActionHasSnapshot })
    inActionPendingBatchRef.current = {}
    setInActionPendingBatch({})
    inActionPrevImagesRef.current   = {}
    setInActionPrevImages({})

    const topLayerId = restoredLayers[restoredLayers.length - 1]?.id ?? 'bg'
    setActiveId(topLayerId); activeIdRef.current = topLayerId

    historyStack.current = []; redoStack.current = []
    setCurrentDraftId(payload.id)
    setStudioView('editor')

    setTimeout(() => {
      for (const id of Object.keys(offscreen.current)) {
        if (!textLayersRef.current[id]) refreshLayer(id)
      }
      for (const [tid, meta] of Object.entries(textLayersRef.current as Record<string, TextMeta>)) {
        refreshTextLayer(tid, meta)
      }
      composite()
    }, 0)
  }

  // ─── Re-skin ───────────────────────────────────────────────────────────────

  async function doGenExpand() {
    const id   = activeIdRef.current
    const c    = offscreen.current[id]
    const bbox = bboxesRef.current[id]
    if (!c || !bbox || loadingLayerIds.has(id)) return
    const { top, right, bottom, left } = expandOffsets
    if (top === 0 && right === 0 && bottom === 0 && left === 0) return

    const newX = bbox.x - left
    const newY = bbox.y - top
    const newW = bbox.w + left + right
    const newH = bbox.h + top + bottom

    const origDataUrl = extractCharacterCrop(id)

    // Detect transparent background by sampling the full perimeter of the bbox
    // (every 10% along each edge). Corner-only checks miss transparency when the
    // character (e.g. motorcycle wheels) happens to reach the exact bbox corners.
    const hasTransp = (() => {
      const ctx = c.getContext('2d')!
      const { x, y, w, h } = bbox
      for (let t = 0; t <= 10; t++) {
        const fx = Math.floor(w * t / 10)
        const fy = Math.floor(h * t / 10)
        if (ctx.getImageData(x + fx,     y,         1, 1).data[3] < 100) return true
        if (ctx.getImageData(x + fx,     y + h - 1, 1, 1).data[3] < 100) return true
        if (ctx.getImageData(x,          y + fy,    1, 1).data[3] < 100) return true
        if (ctx.getImageData(x + w - 1,  y + fy,    1, 1).data[3] < 100) return true
      }
      return false
    })()

    await withCredits('studio_reskin', async () => {
      setLayerLoading(id, true)
      try {
        const resultUrl = await generativeExpand(origDataUrl, newW, newH, left, top, hasTransp)
        const ctx = c.getContext('2d')!
        // Clear the full expanded area (not just the old bbox)
        ctx.clearRect(newX - 2, newY - 2, newW + 4, newH + 4)
        const img = await loadImage(resultUrl)
        ctx.drawImage(img, newX, newY, newW, newH)
        const newBbox = { x: newX, y: newY, w: newW, h: newH }
        setBboxes(prev => ({ ...prev, [id]: newBbox }))
        bboxesRef.current = { ...bboxesRef.current, [id]: newBbox }
        markLayerDirty(id)
        refreshLayer(id)
        composite()
        setExpandOffsets({ top: 0, right: 0, bottom: 0, left: 0 })
        setCharAction(null)
      } finally {
        setLayerLoading(id, false)
      }
    })
  }

  async function doReskin() {
    const id = activeIdRef.current
    const meta = charLayersRef.current[id]
    if (!meta || !reskinPrompt.trim() || loadingLayerIds.has(id)) return
    await withCredits('studio_reskin', async () => {
    setLayerLoading(id, true)
    composite()
    try {
      const isScene = !!inActionCharSnapshotRef.current[id]
      const capturedPrompt = reskinPromptRef.current
      if (isScene) {
        // Scene-aware path: reskin the scene + base snapshot in parallel
        const sceneDataUrl = extractCharacterCrop(id)
        const oldSnap = inActionCharSnapshotRef.current[id]
        const [sceneBlobUrl, snapBlobUrl] = await Promise.all([
          reskinCharacterInScene(sceneDataUrl, meta.charName, capturedPrompt),
          editCharacter(oldSnap, capturedPrompt),
        ])
        const c = offscreen.current[id]
        if (c) {
          const ctx = c.getContext('2d')!
          ctx.clearRect(0, 0, c.width, c.height)
          const img = await loadImage(sceneBlobUrl)
          const scale = Math.min(c.width / img.width, c.height / img.height)
          const dw = img.width * scale, dh = img.height * scale
          ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh)
          markLayerDirty(id)
          refreshLayer(id)
          composite()
        }
        saveSkinToDatabank(sceneBlobUrl, meta.charKey, meta.charName, capturedPrompt, 'reskin')
        // Convert blob URL to data URL so the snapshot stays compatible with inActionCharacter
        const snapBlob = await fetch(snapBlobUrl).then(r => r.blob())
        const snapDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(snapBlob)
        })
        inActionCharSnapshotRef.current[id] = snapDataUrl
        setInActionHasSnapshot(prev => ({ ...prev, [id]: true }))
      } else {
        // Base character path: reskin the cropped character
        const imageDataUrl = extractCharacterCrop(id)
        const blobUrl = await editCharacter(imageDataUrl, capturedPrompt)
        const c = offscreen.current[id]
        if (c) {
          const ctx = c.getContext('2d')!
          const bbox = bboxesRef.current[id]
          ctx.clearRect(0, 0, c.width, c.height)
          const img = await loadImage(blobUrl)
          if (bbox) {
            ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h)
          } else {
            ctx.drawImage(img, 0, 0, c.width, c.height)
          }
          markLayerDirty(id)
          refreshLayer(id)
        }
        saveSkinToDatabank(blobUrl, meta.charKey, meta.charName, capturedPrompt, 'reskin')
        const newSnap = extractCharacterCrop(id)
        if (newSnap) {
          inActionCharSnapshotRef.current[id] = newSnap
          setInActionHasSnapshot(prev => ({ ...prev, [id]: true }))
        }
      }
      setReskinPrompt('')
      markRemixChanged()
    } catch (err) {
      console.error('Re-skin failed:', err)
    } finally {
      composite()
      setLayerLoading(id, false)
      scheduleAutoSave()
    }
    })
  }

  // ─── Edit character (current canvas pixels → Gemini) ───────────────────────

  function clearInActionSnapshot(id: string) {
    delete inActionCharSnapshotRef.current[id]
    setInActionHasSnapshot(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function extractCharacterCrop(id: string): string {
    const c = offscreen.current[id]; if (!c) return ''
    const bbox = bboxesRef.current[id]
    if (!bbox) return c.toDataURL('image/png')
    const crop = makeCanvas(bbox.w, bbox.h)
    crop.getContext('2d')!.drawImage(c, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h)
    return crop.toDataURL('image/png')
  }

  async function doEdit() {
    const id = activeIdRef.current
    const meta = charLayersRef.current[id]
    if (!meta || !editPrompt.trim() || loadingLayerIds.has(id)) return
    await withCredits('studio_reskin', async () => {
    setLayerLoading(id, true)
    composite()
    try {
      const capturedPrompt = editPromptRef.current
      const imageDataUrl = extractCharacterCrop(id)
      const blobUrl = await editCharacter(imageDataUrl, capturedPrompt)
      const c = offscreen.current[id]
      if (c) {
        const ctx = c.getContext('2d')!
        const bbox = bboxesRef.current[id]
        ctx.clearRect(0, 0, c.width, c.height)
        const img = await loadImage(blobUrl)
        if (bbox) {
          ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h)
        } else {
          ctx.drawImage(img, 0, 0, c.width, c.height)
        }
        markLayerDirty(id)
        refreshLayer(id)
      }
      saveSkinToDatabank(blobUrl, meta.charKey, meta.charName, capturedPrompt, 'edit')
      // Update In Action base snapshot to this edited character state
      const newSnap = extractCharacterCrop(id)
      if (newSnap) {
        inActionCharSnapshotRef.current[id] = newSnap
        setInActionHasSnapshot(prev => ({ ...prev, [id]: true }))
      }
      setEditPrompt('')
      setCharAction(null)
    } catch (err) {
      console.error('Edit failed:', err)
    } finally {
      composite()
      setLayerLoading(id, false)
      scheduleAutoSave()
    }
    })
  }

  function applyToSelection(newMask: HTMLCanvasElement, layerId: string) {
    const mode = selectionModeRef.current
    let finalMask = newMask
    if (mode !== 'replace' && selectionRef.current?.layerId === layerId) {
      const existing = selectionRef.current.mask
      const combined = makeCanvas(existing.width, existing.height)
      const cc = combined.getContext('2d')!
      cc.drawImage(existing, 0, 0)
      cc.globalCompositeOperation = mode === 'add' ? 'source-over' : 'destination-out'
      cc.drawImage(newMask, 0, 0)
      cc.globalCompositeOperation = 'source-over'
      finalMask = combined
    }
    selectionRef.current = { layerId, mask: finalMask, ...buildSelectionDisplays(finalMask) }
    hasSelectionRef.current = true
    setHasSelection(true)
    composite()
  }

  function clearSelection() {
    selectionRef.current = null
    hasSelectionRef.current = false
    setHasSelection(false)
    composite()
  }

  function applyWandErase() {
    const wm = selectionRef.current; if (!wm) return
    const c = offscreen.current[wm.layerId]; if (!c) return
    saveHistory()
    const ctx2 = c.getContext('2d')!
    ctx2.globalCompositeOperation = 'destination-out'
    ctx2.drawImage(wm.mask, 0, 0)
    ctx2.globalCompositeOperation = 'source-over'
    refreshLayer(wm.layerId)
    clearSelection()
  }

  function applyWandFill() {
    const wm = selectionRef.current; if (!wm) return
    const c = offscreen.current[wm.layerId]; if (!c) return
    saveHistory()
    const ctx2 = c.getContext('2d')!
    const tmp = makeCanvas(c.width, c.height)
    const tc = tmp.getContext('2d')!
    tc.fillStyle = colorRef.current
    tc.fillRect(0, 0, tmp.width, tmp.height)
    tc.globalCompositeOperation = 'destination-in'
    tc.drawImage(wm.mask, 0, 0)
    ctx2.drawImage(tmp, 0, 0)
    refreshLayer(wm.layerId)
    clearSelection()
  }

  // ─── In Action ─────────────────────────────────────────────────────────────

  async function applySkin(skin: SkinRecord) {
    await placeInActionResult(skinImageUrl(skin.id), activeId)
    markRemixChanged()
  }

  async function placeInActionResult(blobUrl: string, id: string) {
    const c = offscreen.current[id]
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    const img = await loadImage(blobUrl)
    const scale = Math.min(c.width / img.width, c.height / img.height)
    const dw = img.width * scale, dh = img.height * scale
    ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh)
    markLayerDirty(id)
    refreshLayer(id)
    composite()
    scheduleAutoSave()
  }

  // Commit a chosen result: saves current canvas to history (max 2), applies new result, clears batch
  async function commitInActionResult(blobUrl: string, id: string) {
    markRemixChanged()
    const c = offscreen.current[id]
    if (c && bboxesRef.current[id]) {
      const prev = inActionPrevImagesRef.current[id] ?? []
      const newPrev = [c.toDataURL('image/png'), ...prev].slice(0, 2)
      inActionPrevImagesRef.current[id] = newPrev
      setInActionPrevImages(p => ({ ...p, [id]: newPrev }))
    }
    await placeInActionResult(blobUrl, id)
    const batch = { ...inActionPendingBatchRef.current }
    delete batch[id]
    inActionPendingBatchRef.current = batch
    setInActionPendingBatch(batch)
  }

  async function doInActionGoBack() {
    const id = activeIdRef.current
    const prev = inActionPrevImagesRef.current[id]
    if (!prev?.length || loadingLayerIds.has(id)) return
    const [mostRecent, ...remaining] = prev
    inActionPrevImagesRef.current[id] = remaining
    setInActionPrevImages(p => ({ ...p, [id]: remaining }))
    const c = offscreen.current[id]; if (!c) return
    const ctx = c.getContext('2d')!
    const img = await loadImage(mostRecent)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0)
    markLayerDirty(id)
    refreshLayer(id)
    composite()
    scheduleAutoSave()
  }

  function lockInActionSnapshot(id: string) {
    if (!inActionCharSnapshotRef.current[id]) {
      inActionCharSnapshotRef.current[id] = extractCharacterCrop(id)
      setInActionHasSnapshot(prev => ({ ...prev, [id]: true }))
    }
  }

  async function runInActionGenerate(charSnap: string, id: string) {
    const count = inActionCount
    const capturedPrompt = inActionPromptRef.current
    const capturedLevel  = inActionLevelRef.current
    const meta = charLayersRef.current[id]
    const skinType = capturedLevel === 1 ? 'inaction_prop' : capturedLevel === 2 ? 'inaction_context' : 'inaction_scene'
    const promises = Array.from({ length: count }, () =>
      inActionCharacter(charSnap, capturedPrompt, capturedLevel)
    )
    const blobUrls = await Promise.all(promises)
    // Save every generated result to the public databank
    if (meta) {
      for (const url of blobUrls) {
        saveSkinToDatabank(url, meta.charKey, meta.charName, capturedPrompt, skinType as SkinRecord['skin_type'])
      }
    }
    if (count === 1) {
      await commitInActionResult(blobUrls[0], id)
    } else {
      const batch = { ...inActionPendingBatchRef.current, [id]: blobUrls }
      inActionPendingBatchRef.current = batch
      setInActionPendingBatch(batch)
      // Auto-paint first result for non-active layers so canvas shows something immediately
      if (id !== activeIdRef.current) {
        await placeInActionResult(blobUrls[0], id)
      }
    }
  }

  async function doInAction() {
    const id = activeIdRef.current
    const meta = charLayersRef.current[id]
    if (!meta || !inActionPrompt.trim() || loadingLayerIds.has(id)) return
    lockInActionSnapshot(id)
    const charSnap = inActionCharSnapshotRef.current[id]
    await withCredits(`studio_inaction${inActionCount}` as CreditAction, async () => {
    setLayerLoading(id, true)
    composite()
    try {
      await runInActionGenerate(charSnap, id)
    } catch (err) {
      console.error('In Action failed:', err)
    } finally {
      composite()
      setLayerLoading(id, false)
    }
    })
  }

  async function doInActionRegenerate() {
    const id = activeIdRef.current
    const snap = inActionCharSnapshotRef.current[id]
    if (!snap || !inActionPrompt.trim() || loadingLayerIds.has(id)) return
    await withCredits(`studio_inaction${inActionCount}` as CreditAction, async () => {
    setLayerLoading(id, true)
    composite()
    try {
      await runInActionGenerate(snap, id)
    } catch (err) {
      console.error('In Action re-generate failed:', err)
    } finally {
      composite()
      setLayerLoading(id, false)
    }
    })
  }

  async function doInActionModify() {
    const id = activeIdRef.current
    const snap = inActionCharSnapshotRef.current[id]
    if (!snap || !inActionPrompt.trim() || loadingLayerIds.has(id)) return
    await withCredits('studio_inaction1', async () => {
    setLayerLoading(id, true)
    composite()
    try {
      const blobUrl = await inActionCharacter(snap, inActionPrompt, inActionLevel)
      await commitInActionResult(blobUrl, id)
    } catch (err) {
      console.error('In Action modify failed:', err)
    } finally {
      composite()
      setLayerLoading(id, false)
      scheduleAutoSave()
    }
    })
  }

  // ─── Art-mode AI edit ──────────────────────────────────────────────────────

  function layerToImageData(id: string): string | null {
    const { w, h } = dimsRef.current
    const tf   = transformsRef.current[id]
    const bbox = bboxesRef.current[id]
    const textMeta = textLayersRef.current[id]

    const out = makeCanvas(w, h)
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    if (textMeta) {
      // render text with its transform the same way composite() does
      const ff = textMeta.fontFamily
      const fs = textMeta.fontSize
      ctx.font = `${fs}px ${ff}`
      ctx.fillStyle = textMeta.color
      ctx.textBaseline = 'top'
      const lines = textMeta.text.split('\n')
      if (tf && bbox) {
        const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
        ctx.save()
        ctx.translate(cx + tf.tx, cy + tf.ty)
        ctx.rotate(tf.rotation)
        ctx.scale(tf.scaleX, tf.scaleY)
        ctx.translate(-cx, -cy)
      }
      if (textMeta.w) {
        let lineY = textMeta.y
        for (const line of lines) {
          const words = line.split(' '); let row = ''
          for (const word of words) {
            const test = row ? row + ' ' + word : word
            if (ctx.measureText(test).width > textMeta.w && row) { ctx.fillText(row, textMeta.x, lineY); row = word; lineY += fs * 1.25 }
            else row = test
          }
          ctx.fillText(row, textMeta.x, lineY); lineY += fs * 1.25
        }
      } else {
        lines.forEach((line, i) => ctx.fillText(line, textMeta.x, textMeta.y + i * fs * 1.25))
      }
      if (tf && bbox) ctx.restore()
    } else {
      const lc = offscreen.current[id]
      // bg layer with no image yet: use full white canvas as base for generation
      if (!lc && id === 'bg') {
        const { w, h } = dimsRef.current
        const blank = makeCanvas(w, h)
        blank.getContext('2d')!.fillStyle = '#ffffff'
        blank.getContext('2d')!.fillRect(0, 0, w, h)
        return blank.toDataURL('image/png')
      }
      if (!lc) return null
      if (tf && bbox) {
        const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
        ctx.save()
        ctx.translate(cx + tf.tx, cy + tf.ty)
        ctx.rotate(tf.rotation)
        ctx.scale(tf.scaleX, tf.scaleY)
        ctx.translate(-cx, -cy)
        ctx.drawImage(lc, 0, 0)
        ctx.restore()
      } else {
        ctx.drawImage(lc, 0, 0)
      }
    }

    // crop to bbox if available
    if (bbox) {
      const crop = makeCanvas(bbox.w, bbox.h)
      crop.getContext('2d')!.drawImage(out, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h)
      return crop.toDataURL('image/png')
    }
    return out.toDataURL('image/png')
  }

  async function doArtAi() {
    const id = activeIdRef.current
    if (!artAiPrompt.trim() || loadingLayerIds.has(id)) return
    await withCredits('studio_art', async () => {
    setLayerLoading(id, true)
    composite()
    try {
      const imageDataUrl = layerToImageData(id)
      if (!imageDataUrl) throw new Error('Could not extract layer image')
      const blobUrl = await editLayer(imageDataUrl, artAiPrompt)
      const c = offscreen.current[id]

      // if it was a text layer, convert it to raster first
      const wasText = !!textLayersRef.current[id]
      if (wasText) {
        const newTextLayers = { ...textLayersRef.current }
        delete newTextLayers[id]
        textLayersRef.current = newTextLayers
        setTextLayers(newTextLayers)
        const newCharLayers = { ...charLayersRef.current }
        delete newCharLayers[id]
        charLayersRef.current = newCharLayers
        setCharLayers(newCharLayers)
        if (!c) {
          const { w, h } = dimsRef.current
          offscreen.current[id] = makeCanvas(w, h)
        }
      }

      // Ensure bg layer has an offscreen canvas to receive the result
      if (!offscreen.current[id] && id === 'bg') {
        const { w, h } = dimsRef.current
        offscreen.current[id] = makeCanvas(w, h)
      }
      const canvas = offscreen.current[id]
      if (canvas) {
        const ctx = canvas.getContext('2d')!
        const bbox = bboxesRef.current[id]
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const img = await loadImage(blobUrl)
        if (bbox) {
          ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h)
        } else {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
        refreshLayer(id)
      }
      setArtAiPrompt('')
    } catch (err) {
      console.error('Art AI edit failed:', err)
    } finally {
      composite()
      setLayerLoading(id, false)
    }
    })
  }

  // ─── Polygon helpers ───────────────────────────────────────────────────────

  function isPointInPolygon(px: number, py: number, verts: [number, number][]): boolean {
    let inside = false
    const n = verts.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = verts[i], [xj, yj] = verts[j]
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
        inside = !inside
    }
    return inside
  }

  function polyBBox(verts: [number, number][]): BBox {
    const xs = verts.map(v => v[0]), ys = verts.map(v => v[1])
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }

  function updatePolyVerts(id: string, vertices: [number, number][]) {
    const meta = polyLayersRef.current[id]; if (!meta) return
    const newMeta = { ...meta, vertices }
    polyLayersRef.current = { ...polyLayersRef.current, [id]: newMeta }
    setPolyLayers(prev => ({ ...prev, [id]: newMeta }))
    const bbox = polyBBox(vertices)
    bboxesRef.current = { ...bboxesRef.current, [id]: bbox }
    setBboxes(prev => ({ ...prev, [id]: bbox }))
    updatePolyThumb(id, newMeta)
    composite()
  }

  function updatePolyStyle(id: string, patch: Partial<PolygonMeta>) {
    const meta = polyLayersRef.current[id]; if (!meta) return
    const newMeta = { ...meta, ...patch }
    polyLayersRef.current = { ...polyLayersRef.current, [id]: newMeta }
    setPolyLayers(prev => ({ ...prev, [id]: newMeta }))
    updatePolyThumb(id, newMeta)
    composite()
  }

  function updatePolyThumb(id: string, meta: PolygonMeta) {
    const bbox = polyBBox(meta.vertices)
    if (bbox.w < 1 || bbox.h < 1) return
    const TMAX = 220
    const scale = Math.min(TMAX / bbox.w, TMAX / bbox.h, 1)
    const tw = Math.round(bbox.w * scale), th = Math.round(bbox.h * scale)
    const tmp = makeCanvas(tw, th); const ctx = tmp.getContext('2d')!
    ctx.translate(-bbox.x * scale, -bbox.y * scale)
    ctx.scale(scale, scale)
    ctx.beginPath()
    meta.vertices.forEach(([vx, vy], i) => i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy))
    ctx.closePath()
    if (meta.fillOn) { ctx.fillStyle = meta.fillColor; ctx.fill() }
    if (meta.strokeOn) { ctx.strokeStyle = meta.strokeColor; ctx.lineWidth = meta.strokeWidth; ctx.lineJoin = 'round'; ctx.stroke() }
    setThumbs(prev => ({ ...prev, [id]: tmp.toDataURL() }))
  }

  function addPolygonLayer(centerX: number, centerY: number, radius: number) {
    saveStructure()
    const preset = polyPresetRef.current
    const vertices: [number, number][] = Array.from({ length: preset.sides }, (_, i) => {
      const a = preset.angle + (2 * Math.PI * i) / preset.sides
      return [centerX + radius * Math.cos(a), centerY + radius * Math.sin(a)]
    })
    const meta: PolygonMeta = {
      vertices,
      strokeOn: shapeStrokeOnRef.current, strokeColor: shapeStrokeColorRef.current, strokeWidth: shapeStrokeWRef.current,
      fillOn: shapeFillOnRef.current, fillColor: shapeFillColorRef.current,
    }
    const id = `poly_${Date.now()}`
    const { w, h } = dimsRef.current
    offscreen.current[id] = makeCanvas(w, h)
    const bbox = polyBBox(vertices)
    bboxesRef.current = { ...bboxesRef.current, [id]: bbox }
    setBboxes(prev => ({ ...prev, [id]: bbox }))
    transformsRef.current = { ...transformsRef.current, [id]: IDENTITY_TF }
    setTransforms(prev => ({ ...prev, [id]: IDENTITY_TF }))
    polyLayersRef.current = { ...polyLayersRef.current, [id]: meta }
    setPolyLayers(prev => ({ ...prev, [id]: meta }))
    const newLayer: Layer = { id, name: 'Polygon', visible: true, opacity: 100 }
    const newLayers = [...layersRef.current, newLayer]
    layersRef.current = newLayers; setLayers(newLayers)
    setActiveId(id); activeIdRef.current = id
    setCharAction(null)
    updatePolyThumb(id, meta)
    composite()
  }

  function flipLayer(dir: 'h' | 'v') {
    const id = activeIdRef.current
    const c = offscreen.current[id]
    if (!c) return
    saveStructure()
    const tmp = makeCanvas(c.width, c.height)
    const tc = tmp.getContext('2d')!
    tc.save()
    if (dir === 'h') { tc.scale(-1, 1);  tc.drawImage(c, -c.width, 0) }
    else             { tc.scale(1, -1);  tc.drawImage(c, 0, -c.height) }
    tc.restore()
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(tmp, 0, 0)
    markLayerDirty(id)
    refreshLayer(id)
    composite()
    scheduleAutoSave()
    markRemixChanged()
  }

  function rasterizePolygon(id: string) {
    const meta = polyLayersRef.current[id]; if (!meta) return
    saveStructure()
    const c = offscreen.current[id]; if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.beginPath()
    meta.vertices.forEach(([vx, vy], i) => i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy))
    ctx.closePath()
    if (meta.fillOn) { ctx.fillStyle = meta.fillColor; ctx.fill() }
    if (meta.strokeOn) { ctx.strokeStyle = meta.strokeColor; ctx.lineWidth = meta.strokeWidth; ctx.lineJoin = 'round'; ctx.stroke() }
    const newPolyLayers = { ...polyLayersRef.current }
    delete newPolyLayers[id]
    polyLayersRef.current = newPolyLayers; setPolyLayers(newPolyLayers)
    refreshLayer(id)
    composite()
  }

  function startLineDrag(startX: number, startY: number) {
    saveHistory()
    shapeDrawRef.current = { startX, startY, currX: startX, currY: startY }
    const onMove = (ev: MouseEvent) => {
      const p = canvasCoordsFromClient(ev.clientX, ev.clientY)
      if (shapeDrawRef.current) { shapeDrawRef.current.currX = p.x; shapeDrawRef.current.currY = p.y }
      composite()
    }
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const p = canvasCoordsFromClient(ev.clientX, ev.clientY)
      const sd = shapeDrawRef.current; shapeDrawRef.current = null
      if (!sd || !shapeStrokeOnRef.current) { composite(); return }
      const id = activeIdRef.current
      const c = offscreen.current[id]; if (!c) { composite(); return }
      const ctx = c.getContext('2d')!
      const ls = layerCoords(sd.startX, sd.startY, id)
      const le = layerCoords(p.x, p.y, id)
      ctx.save()
      ctx.beginPath(); ctx.moveTo(ls.x, ls.y); ctx.lineTo(le.x, le.y)
      ctx.strokeStyle = shapeStrokeColorRef.current; ctx.lineWidth = shapeStrokeWRef.current
      ctx.lineCap = 'round'; ctx.stroke()
      ctx.restore()
      refreshLayer(id); composite()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Canvas events ─────────────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent<HTMLElement>) {
    // Space + left-click = pan
    if (e.button === 0 && spaceDownRef.current) {
      e.preventDefault()
      const scrollEl = scrollRef.current!
      const sx = e.clientX, sy = e.clientY
      const ssl = scrollEl.scrollLeft, sst = scrollEl.scrollTop
      const onMove = (ev: MouseEvent) => {
        scrollEl.scrollLeft = ssl - (ev.clientX - sx)
        scrollEl.scrollTop  = sst - (ev.clientY - sy)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }
    if (e.button !== 0) return
    setBrushMenu(null)
    const { x, y } = canvasCoords(e)
    const t = toolRef.current

    // ── Text mode + char active: drag text labels without changing selection ──
    if (toolRef.current === 'grab' && charLayersRef.current[activeIdRef.current]) {
      for (const layer of [...layersRef.current].reverse()) {
        if (!layer.visible || !textLayersRef.current[layer.id]) continue
        if (!grabHitTest(x, y, layer.id)) continue
        const textId = layer.id
        const bbox = bboxesRef.current[textId]!
        const initTf = transformsRef.current[textId] ?? IDENTITY_TF
        const startMx = x, startMy = y
        let moved = false
        const onMove = (ev: MouseEvent) => {
          const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
          const dx = pos.x - startMx, dy = pos.y - startMy
          if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true
          if (moved) {
            const newTf = { ...initTf, tx: initTf.tx + dx, ty: initTf.ty + dy }
            transformsRef.current = { ...transformsRef.current, [textId]: newTf }
            setTransforms(prev => ({ ...prev, [textId]: newTf }))
            composite()
          }
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          if (!moved) {
            // Plain click → select the text layer
            setActiveId(textId)
            activeIdRef.current = textId
            syncTextControls(textId)
          }
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return
      }
    }

    // ── Text tool ──
    if (t === 'text') {
      commitText()
      // Click on existing text layer → edit it
      for (const layer of [...layersRef.current].reverse()) {
        if (layer.id === 'bg' || !layer.visible || !textLayersRef.current[layer.id]) continue
        const h = grabHitTest(x, y, layer.id)
        if (h && h !== 'rotate') { openTextEdit(layer.id); return }
      }
      // Otherwise start a new text drag
      textDragStartRef.current = { startX: x, startY: y, startClientX: e.clientX, startClientY: e.clientY }
      return
    }

    // ── Grab tool ──
    if (t === 'grab') {
      const id = activeIdRef.current
      const isMulti = e.ctrlKey || e.metaKey || multiSelectModeRef.current

      // Polygon vertex / body drag — handled before grabHitTest
      const polyMeta = polyLayersRef.current[id]
      if (polyMeta) {
        const VR = 10
        const vertIdx = polyMeta.vertices.findIndex(([vx, vy]) => Math.hypot(x - vx, y - vy) < VR)
        if (vertIdx >= 0) {
          saveStructure()
          const initVerts = polyMeta.vertices.map(v => [...v] as [number, number])
          const onMove = (ev: MouseEvent) => {
            const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
            const nv = initVerts.map((v, i) => i === vertIdx ? [pos.x, pos.y] as [number, number] : v)
            updatePolyVerts(id, nv)
          }
          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
          window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
          return
        }
        if (isPointInPolygon(x, y, polyMeta.vertices)) {
          saveStructure()
          const initVerts = polyMeta.vertices.map(v => [...v] as [number, number])
          const initX = x, initY = y
          const onMove = (ev: MouseEvent) => {
            const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
            const dx = pos.x - initX, dy = pos.y - initY
            updatePolyVerts(id, initVerts.map(([vx, vy]) => [vx + dx, vy + dy] as [number, number]))
          }
          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
          window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
          return
        }
        // Click outside polygon — try to select a different layer
        const reversed2 = [...layersRef.current].reverse()
        for (const layer of reversed2) {
          if (layer.id === id || layer.id === 'bg' || !layer.visible) continue
          if (grabHitTest(x, y, layer.id)) {
            setActiveId(layer.id); activeIdRef.current = layer.id
            syncTextControls(layer.id)
            return
          }
        }
        setActiveId('bg'); activeIdRef.current = 'bg'
        return
      }

      // Shared grab drag starter (used for both group and single layer)
      const startGrabDrag = (dragId: string, h: GrabHandle) => {
        saveStructure()
        const bb = bboxesRef.current[dragId]!
        const tf2 = transformsRef.current[dragId] ?? IDENTITY_TF
        const dcx = bb.x + bb.w / 2 + tf2.tx
        const dcy = bb.y + bb.h / 2 + tf2.ty
        const curSel = selectedIdsRef.current
        const initTfsMap: Record<string, LayerTransform> = {}
        if (curSel.size >= 2) {
          for (const sid of curSel) initTfsMap[sid] = { ...(transformsRef.current[sid] ?? IDENTITY_TF) }
        } else {
          initTfsMap[dragId] = { ...tf2 }
        }
        grabDragRef.current = {
          handle: h, layerId: dragId, startMx: x, startMy: y,
          initTf: { ...tf2 }, initTfsMap,
          displayCx: dcx, displayCy: dcy,
          initAngle: Math.atan2(y - dcy, x - dcx),
          bboxW: bb.w, bboxH: bb.h,
        }
        const onMove = (ev: MouseEvent) => {
          if (!grabDragRef.current) return
          const { handle: hh, layerId: lid, startMx: sx, startMy: sy, initTf: itf,
                  initTfsMap: tfMap, displayCx: dc_x, displayCy: dc_y,
                  initAngle: ia, bboxW: bw, bboxH: bh } = grabDragRef.current
          const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
          const mx2 = pos.x, my2 = pos.y
          if (hh === 'move') {
            let dx = mx2 - sx, dy = my2 - sy
            if (snapEnabledRef.current) {
              const snap = computeSnap(lid, tfMap[lid].tx + dx, tfMap[lid].ty + dy)
              dx = snap.tx - tfMap[lid].tx; dy = snap.ty - tfMap[lid].ty
              setSnapLines(snap.lines)
            } else {
              setSnapLines([])
            }
            const newTfs: Record<string, LayerTransform> = {}
            for (const [sid2, stf] of Object.entries(tfMap)) newTfs[sid2] = { ...stf, tx: stf.tx + dx, ty: stf.ty + dy }
            setTransforms(prev => ({ ...prev, ...newTfs }))
            transformsRef.current = { ...transformsRef.current, ...newTfs }
          } else if (hh === 'rotate') {
            const ca = Math.atan2(my2 - dc_y, mx2 - dc_x)
            const nt = { ...itf, rotation: itf.rotation + (ca - ia) }
            setTransforms(prev => ({ ...prev, [lid]: nt })); transformsRef.current = { ...transformsRef.current, [lid]: nt }
          } else if (hh === 'n' || hh === 's') {
            const r = itf.rotation
            const proj = (mx2 - dc_x) * Math.sin(r) - (my2 - dc_y) * Math.cos(r)
            const nt = { ...itf, scaleY: Math.max(0.05, hh === 'n' ? proj / (bh / 2) : -proj / (bh / 2)) }
            setTransforms(prev => ({ ...prev, [lid]: nt })); transformsRef.current = { ...transformsRef.current, [lid]: nt }
          } else if (hh === 'e' || hh === 'w') {
            const r = itf.rotation
            const proj = (mx2 - dc_x) * Math.cos(r) + (my2 - dc_y) * Math.sin(r)
            const nt = { ...itf, scaleX: Math.max(0.05, hh === 'e' ? proj / (bw / 2) : -proj / (bw / 2)) }
            setTransforms(prev => ({ ...prev, [lid]: nt })); transformsRef.current = { ...transformsRef.current, [lid]: nt }
          } else {
            const sd = Math.hypot(sx - dc_x, sy - dc_y), cd = Math.hypot(mx2 - dc_x, my2 - dc_y)
            const sc = sd === 0 ? 1 : cd / sd
            const nt = { ...itf, scaleX: Math.max(0.05, itf.scaleX * sc), scaleY: Math.max(0.05, itf.scaleY * sc) }
            setTransforms(prev => ({ ...prev, [lid]: nt })); transformsRef.current = { ...transformsRef.current, [lid]: nt }
          }
          composite()
        }
        const onUp = () => {
          grabDragRef.current = null; setSnapLines([])
          window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
      }

      // If a multi-selection is active, check if cursor hits any selected layer first
      const curSel = selectedIdsRef.current
      if (curSel.size >= 2) {
        const orderedSel = [...layersRef.current].reverse()
          .map(l => l.id).filter(lid => curSel.has(lid) && layersRef.current.find(l => l.id === lid)?.visible)
        for (const selId of orderedSel) {
          const h = grabHitTest(x, y, selId)
          if (h) {
            setActiveId(selId); activeIdRef.current = selId
            startGrabDrag(selId, h)
            return
          }
        }
        // Cursor missed all selected layers
        if (!isMulti) { setSelectedIds(new Set()); selectedIdsRef.current = new Set() }
      }

      const handle = id !== 'bg' ? grabHitTest(x, y, id) : null

      if (!handle) {
        // Try to select a different visible layer (topmost first = reversed array)
        const reversed = [...layersRef.current].reverse()
        for (const layer of reversed) {
          if (layer.id === id || layer.id === 'bg' || !layer.visible) continue
          if (grabHitTest(x, y, layer.id)) {
            if (isMulti) {
              const nxt = new Set(selectedIdsRef.current); nxt.add(layer.id)
              setSelectedIds(nxt); selectedIdsRef.current = nxt
            } else {
              setSelectedIds(new Set()); selectedIdsRef.current = new Set()
            }
            setActiveId(layer.id); activeIdRef.current = layer.id
            syncTextControls(layer.id)
            return
          }
        }
        // No layer hit — deselect
        if (!isMulti) { setSelectedIds(new Set()); selectedIdsRef.current = new Set() }
        setActiveId('bg'); activeIdRef.current = 'bg'
        return
      }

      // Start drag on the active layer
      if (isMulti) {
        // Ctrl+click on active layer: add to selection but don't drag
        const nxt = new Set(selectedIdsRef.current); nxt.add(id)
        setSelectedIds(nxt); selectedIdsRef.current = nxt
      }
      startGrabDrag(id, handle)
      return
    }

    // ── Fill ──
    if (t === 'fill') {
      const ctx = activeCtx(); if (!ctx) return
      saveHistory()
      const id = activeIdRef.current
      const lc = layerCoords(x, y, id)
      floodFill(ctx, Math.round(lc.x), Math.round(lc.y), colorRef.current, fillToleranceRef.current)
      composite(); refreshLayer(id); return
    }

    // ── Eyedropper ──
    if (t === 'eyedropper') {
      const px = displayRef.current!.getContext('2d')!.getImageData(Math.round(x), Math.round(y), 1, 1).data
      const hex = rgbToHex(px[0], px[1], px[2])
      setColor(hex); colorRef.current = hex; setTool('brush'); return
    }

    // ── Line ──
    if (t === 'line') {
      startLineDrag(x, y)
      return
    }

    // ── Polygon ──
    if (t === 'polygon') {
      // Vertex drag — if active layer is a polygon and user clicked near a vertex
      const activePoly = polyLayersRef.current[activeIdRef.current]
      if (activePoly) {
        const VR = 12
        const vertIdx = activePoly.vertices.findIndex(([vx, vy]) => Math.hypot(x - vx, y - vy) < VR)
        if (vertIdx >= 0) {
          saveStructure()
          const polyId = activeIdRef.current
          const initVerts = activePoly.vertices.map(v => [...v] as [number, number])
          const onMove = (ev: MouseEvent) => {
            const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
            updatePolyVerts(polyId, initVerts.map((v, i) => i === vertIdx ? [pos.x, pos.y] as [number, number] : v))
          }
          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
          window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
          return
        }
      }
      // Draw a new polygon — drag from top-left corner to bottom-right corner
      shapeDrawRef.current = { startX: x, startY: y, currX: x, currY: y }
      const onMove = (ev: MouseEvent) => {
        const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
        if (shapeDrawRef.current) { shapeDrawRef.current.currX = pos.x; shapeDrawRef.current.currY = pos.y }
        composite()
      }
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
        const sd = shapeDrawRef.current; shapeDrawRef.current = null
        if (!sd) { composite(); return }
        const hasStroke = shapeStrokeOnRef.current
        const hasFill   = shapeFillOnRef.current
        if (!hasStroke && !hasFill) { composite(); return }
        const radius = Math.hypot(pos.x - sd.startX, pos.y - sd.startY) / 2
        if (radius < 3) { composite(); return }
        const cx = (sd.startX + pos.x) / 2, cy = (sd.startY + pos.y) / 2
        addPolygonLayer(cx, cy, radius)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    // ── Crop ──
    if (t === 'crop') {
      cropDragRef.current = { startX: x, startY: y, currX: x, currY: y }
      const onMove = (ev: MouseEvent) => {
        const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
        if (cropDragRef.current) { cropDragRef.current.currX = pos.x; cropDragRef.current.currY = pos.y }
        composite()
      }
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        const cd = cropDragRef.current; cropDragRef.current = null
        if (!cd) { composite(); return }
        const rw = Math.abs(cd.currX - cd.startX), rh = Math.abs(cd.currY - cd.startY)
        if (rw < 4 || rh < 4) { composite(); return }
        // Apply crop to active layer
        const id = activeIdRef.current
        const c = offscreen.current[id]; if (!c) { composite(); return }
        const ctx2 = c.getContext('2d')!
        saveHistory()
        const tmp = makeCanvas(c.width, c.height)
        const tc = tmp.getContext('2d')!
        // Build mask in layer-local space by inverse-transforming the 4 rect corners
        const corners: [number, number][] = [
          [cd.startX, cd.startY], [cd.currX, cd.startY],
          [cd.currX, cd.currY],   [cd.startX, cd.currY],
        ].map(([px, py]) => { const lc = layerCoords(px, py, id); return [lc.x, lc.y] }) as [number,number][]
        tc.fillStyle = '#fff'
        tc.beginPath()
        tc.moveTo(corners[0][0], corners[0][1])
        for (let i = 1; i < 4; i++) tc.lineTo(corners[i][0], corners[i][1])
        tc.closePath()
        tc.fill()
        ctx2.globalCompositeOperation = 'destination-in'
        ctx2.drawImage(tmp, 0, 0)
        ctx2.globalCompositeOperation = 'source-over'
        refreshLayer(id)
        composite()
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    // ── Magic Wand ──
    if (t === 'wand') {
      const id = activeIdRef.current
      const c = offscreen.current[id]; if (!c) return
      const ctx2 = c.getContext('2d')!
      const lc = layerCoords(x, y, id)
      const mask = floodFillMask(ctx2, Math.round(lc.x), Math.round(lc.y), wandToleranceRef.current)
      const origMode = selectionModeRef.current
      if (e.shiftKey) selectionModeRef.current = 'add'
      else if (e.altKey) selectionModeRef.current = 'subtract'
      applyToSelection(mask, id)
      selectionModeRef.current = origMode
      return
    }

    // ── Lasso ──
    if (t === 'lasso') {
      const id = activeIdRef.current
      if (!offscreen.current[id]) return
      const effMode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : selectionModeRef.current
      lassoDrawingRef.current = true
      lassoPtsRef.current = [{ x, y }]
      const onMove = (ev: MouseEvent) => {
        lassoPtsRef.current.push(canvasCoordsFromClient(ev.clientX, ev.clientY))
        composite()
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        lassoDrawingRef.current = false
        const pts = lassoPtsRef.current
        lassoPtsRef.current = []
        if (pts.length < 3) { composite(); return }
        const layerId = activeIdRef.current
        const offC = offscreen.current[layerId]; if (!offC) { composite(); return }
        const mask = makeCanvas(offC.width, offC.height)
        const mc = mask.getContext('2d')!
        mc.fillStyle = '#fff'; mc.beginPath()
        const fp = layerCoords(pts[0].x, pts[0].y, layerId)
        mc.moveTo(fp.x, fp.y)
        for (let i = 1; i < pts.length; i++) {
          const lc = layerCoords(pts[i].x, pts[i].y, layerId)
          mc.lineTo(lc.x, lc.y)
        }
        mc.closePath(); mc.fill()
        const origMode = selectionModeRef.current
        selectionModeRef.current = effMode
        applyToSelection(mask, layerId)
        selectionModeRef.current = origMode
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    // ── Marquee ──
    if (t === 'marquee') {
      const id = activeIdRef.current
      if (!offscreen.current[id]) return
      const effMode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : selectionModeRef.current
      marqueeDragRef.current = { startX: x, startY: y, currX: x, currY: y }
      const onMove = (ev: MouseEvent) => {
        const pos = canvasCoordsFromClient(ev.clientX, ev.clientY)
        if (marqueeDragRef.current) { marqueeDragRef.current.currX = pos.x; marqueeDragRef.current.currY = pos.y }
        composite()
      }
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        const md = marqueeDragRef.current; marqueeDragRef.current = null
        if (!md) { composite(); return }
        const rw = Math.abs(md.currX - md.startX), rh = Math.abs(md.currY - md.startY)
        if (rw < 4 || rh < 4) { composite(); return }
        const layerId = activeIdRef.current
        const offC = offscreen.current[layerId]; if (!offC) { composite(); return }
        const mask = makeCanvas(offC.width, offC.height)
        const mc = mask.getContext('2d')!
        mc.fillStyle = '#fff'
        const corners: [number,number][] = [
          [md.startX, md.startY], [md.currX, md.startY],
          [md.currX, md.currY],   [md.startX, md.currY],
        ].map(([px, py]) => { const lc = layerCoords(px, py, layerId); return [lc.x, lc.y] }) as [number,number][]
        mc.beginPath()
        mc.moveTo(corners[0][0], corners[0][1])
        for (let i = 1; i < 4; i++) mc.lineTo(corners[i][0], corners[i][1])
        mc.closePath(); mc.fill()
        const origMode = selectionModeRef.current
        selectionModeRef.current = effMode
        applyToSelection(mask, layerId)
        selectionModeRef.current = origMode
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    // ── Brush / Eraser ──
    saveHistory()
    drawing.current = true
    lastPos.current = { x, y }
    targetPosRef.current = { x, y }
    smoothPosRef.current = { x, y }
    // Snapshot pre-stroke state for selection-clipped compositing
    if (hasSelectionRef.current && selectionRef.current?.layerId === activeIdRef.current) {
      const offC = offscreen.current[activeIdRef.current]
      if (offC) {
        strokePreRef.current = makeCanvas(offC.width, offC.height)
        strokePreRef.current.getContext('2d')!.drawImage(offC, 0, 0)
      }
    }
    const ctx = activeCtx()
    if (ctx) {
      const id = activeIdRef.current
      const lc = layerCoords(x, y, id)
      stamp(ctx, lc.x, lc.y); composite()
    }
    if (smoothingRef.current > 0) startSmoothRAF()
  }

  function onDoubleClick(e: React.MouseEvent<HTMLElement>) {
    if (toolRef.current !== 'grab') return
    const { x, y } = canvasCoords(e)
    for (const layer of [...layersRef.current].reverse()) {
      if (layer.id === 'bg' || !layer.visible || !textLayersRef.current[layer.id]) continue
      const h = grabHitTest(x, y, layer.id)
      if (h && h !== 'rotate') {
        setTool('text'); toolRef.current = 'text'
        openTextEdit(layer.id)
        return
      }
    }
  }

  function onContextMenu(e: React.MouseEvent<HTMLElement>) {
    e.preventDefault()
    if (spaceDownRef.current) return
    if (toolRef.current === 'grab') {
      const m = modeRef.current
      if (m === 'art' || m === 'text') {
        const { x, y } = canvasCoords(e)
        setGrabMenu({ x: e.clientX, y: e.clientY, canvasX: x, canvasY: y })
      }
    } else if (toolRef.current !== 'text') {
      setBrushMenu({ x: e.clientX, y: e.clientY })
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLElement>) {
    setCursorPos({ x: e.clientX, y: e.clientY, on: true })

    // Text mode + char active: detect which text layer the cursor is over (for glow)
    if (toolRef.current === 'grab' && charLayersRef.current[activeIdRef.current]) {
      const { x, y } = canvasCoords(e)
      let newHov: string | null = null
      for (const layer of [...layersRef.current].reverse()) {
        if (!layer.visible || !textLayersRef.current[layer.id]) continue
        if (grabHitTest(x, y, layer.id)) { newHov = layer.id; break }
      }
      if (newHov !== hoveredTextIdRef.current) {
        hoveredTextIdRef.current = newHov
        setHoveredTextId(newHov)
      }
    } else if (hoveredTextIdRef.current !== null) {
      hoveredTextIdRef.current = null
      setHoveredTextId(null)
    }

    // Text mode: detect hover over unlinked text labels for the link handle
    if (toolRef.current === 'grab' && !linkDragRef.current && !textInput) {
      const { x, y } = canvasCoords(e)
      let newHovUnlinked: string | null = null
      for (const layer of [...layersRef.current].reverse()) {
        if (!layer.visible) continue
        const tm = textLayersRef.current[layer.id]
        if (!tm || tm.linkedCharId) continue
        if (grabHitTest(x, y, layer.id)) { newHovUnlinked = layer.id; break }
      }
      if (newHovUnlinked !== hoveredUnlinkedIdRef.current) {
        hoveredUnlinkedIdRef.current = newHovUnlinked
        setHoveredUnlinkedId(newHovUnlinked)
      }
    } else if (hoveredUnlinkedIdRef.current !== null && !linkDragRef.current) {
      hoveredUnlinkedIdRef.current = null
      setHoveredUnlinkedId(null)
    }

    if (toolRef.current === 'text') {
      if (textDragStartRef.current) {
        const { x, y } = canvasCoords(e)
        setTextDragPreview({ x: textDragStartRef.current.startX, y: textDragStartRef.current.startY, x2: x, y2: y })
      }
      return
    }

    if (toolRef.current === 'grab') {
      const id = activeIdRef.current
      if (id !== 'bg') setGrabHover(grabHitTest(canvasCoords(e).x, canvasCoords(e).y, id))
      else setGrabHover(null)
      // Also track vertex hover for polygon layers in grab mode
      const pm = polyLayersRef.current[id]
      if (pm) {
        const { x: cx, y: cy } = canvasCoords(e)
        const idx = pm.vertices.findIndex(([vx, vy]) => Math.hypot(cx - vx, cy - vy) < 12)
        if (idx !== hoveredVertIdxRef.current) { hoveredVertIdxRef.current = idx; composite() }
      }
      return
    }

    if (toolRef.current === 'polygon') {
      const pm = polyLayersRef.current[activeIdRef.current]
      if (pm) {
        const { x: cx, y: cy } = canvasCoords(e)
        const idx = pm.vertices.findIndex(([vx, vy]) => Math.hypot(cx - vx, cy - vy) < 12)
        if (idx !== hoveredVertIdxRef.current) { hoveredVertIdxRef.current = idx; composite() }
      } else if (hoveredVertIdxRef.current >= 0) {
        hoveredVertIdxRef.current = -1; composite()
      }
      return
    }

    if (!drawing.current) return
    const { x, y } = canvasCoords(e)
    targetPosRef.current = { x, y }
    if (smoothingRef.current === 0) {
      const ctx = activeCtx()
      if (ctx && lastPos.current) {
        const id = activeIdRef.current
        const ll = layerCoords(lastPos.current.x, lastPos.current.y, id)
        const lc = layerCoords(x, y, id)
        segment(ctx, ll.x, ll.y, lc.x, lc.y); composite()
      }
      lastPos.current = { x, y }
    }
  }

  function stopDrawing() {
    if (drawing.current) {
      drawing.current = false
      // Apply selection clipping: pixels outside the selection are restored from pre-stroke
      const pre = strokePreRef.current
      strokePreRef.current = null
      const sel = selectionRef.current
      const id = activeIdRef.current
      if (pre && hasSelectionRef.current && sel?.layerId === id) {
        const offC = offscreen.current[id]
        if (offC) {
          const ctx2 = offC.getContext('2d')!
          const postClipped = makeCanvas(offC.width, offC.height)
          const pc = postClipped.getContext('2d')!
          pc.drawImage(offC, 0, 0)
          pc.globalCompositeOperation = 'destination-in'
          pc.drawImage(sel.mask, 0, 0)
          ctx2.clearRect(0, 0, offC.width, offC.height)
          ctx2.drawImage(pre, 0, 0)
          ctx2.drawImage(postClipped, 0, 0)
        }
      }
      refreshLayer(activeIdRef.current)
    }
    lastPos.current = null
    targetPosRef.current = null
    smoothPosRef.current = null
  }

  function onMouseUp(e: React.MouseEvent<HTMLElement>) {
    if (textDragStartRef.current) {
      const drag = textDragStartRef.current
      textDragStartRef.current = null
      setTextDragPreview(null)
      const { x, y } = canvasCoords(e)
      const dx = Math.abs(x - drag.startX), dy = Math.abs(y - drag.startY)
      if (dx > 10 || dy > 10) {
        const bx = Math.min(drag.startX, x), by = Math.min(drag.startY, y)
        const bw = Math.abs(x - drag.startX), bh = Math.abs(y - drag.startY)
        const el = displayRef.current!
        const rect = el.getBoundingClientRect()
        const ratio = rect.width / el.width
        setTextInput({ x: bx, y: by, screenX: rect.left + bx * ratio, screenY: rect.top + by * ratio, value: '', w: bw, screenW: bw * ratio, screenH: Math.max(bh * ratio, fontSizeRef.current * ratio * 1.25), screenFontSize: fontSizeRef.current * ratio })
      } else {
        const el2 = displayRef.current!
        const r2 = el2.getBoundingClientRect()
        const ratio2 = r2.width / el2.width
        setTextInput({ x: drag.startX, y: drag.startY, screenX: drag.startClientX, screenY: drag.startClientY, value: '', screenFontSize: fontSizeRef.current * ratio2 })
      }
      return
    }
    stopDrawing()
  }
  function onMouseLeave() {
    if (textDragStartRef.current) { textDragStartRef.current = null; setTextDragPreview(null) }
    if (hoveredVertIdxRef.current >= 0) { hoveredVertIdxRef.current = -1; composite() }
    if (hoveredTextIdRef.current !== null) { hoveredTextIdRef.current = null; setHoveredTextId(null) }
    stopDrawing()
    setCursorPos(p => ({ ...p, on: false }))
  }

  // ─── Drag & drop characters ────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent<HTMLElement>) {
    if (e.dataTransfer.types.includes('application/vvc-char') ||
        e.dataTransfer.types.includes('application/vvc-text-btn') ||
        e.dataTransfer.types.includes('application/vvc-magic-label')) {
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
    }
  }

  function onDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault()
    const magicLabelRaw = e.dataTransfer.getData('application/vvc-magic-label')
    if (magicLabelRaw) {
      const { labels, linkedCharId } = JSON.parse(magicLabelRaw) as { labels: string[]; linkedCharId: string }
      const { x, y } = canvasCoords(e)
      setMagicLabelPicker({ cx: e.clientX, cy: e.clientY, canvasX: x, canvasY: y, charId: linkedCharId, labels })
      return
    }
    const textBtnRaw = e.dataTransfer.getData('application/vvc-text-btn')
    if (textBtnRaw) {
      const { subtype, linkedCharId } = JSON.parse(textBtnRaw) as { subtype: 'title' | 'label'; linkedCharId: string }
      const { x, y } = canvasCoords(e)
      addTextAt(x, y, subtype, linkedCharId)
      return
    }
    const raw = e.dataTransfer.getData('application/vvc-char')
    if (!raw) return
    const { charKey, charName, charFile, charGroup } = JSON.parse(raw) as CharMeta
    const { x, y } = canvasCoords(e)
    dropCharacter(charKey, charName, charFile, x, y, charGroup)
  }

  // ─── Undo / Redo ───────────────────────────────────────────────────────────

  function captureStructure(): Extract<HistoryEntry, { type: 'structure' }> {
    return {
      type: 'structure',
      layers: [...layersRef.current],
      transforms: { ...transformsRef.current },
      bboxes: { ...bboxesRef.current },
      textLayers: { ...textLayersRef.current },
      charLayers: { ...charLayersRef.current },
      polyLayers: { ...polyLayersRef.current },
    }
  }

  function applyStructure(e: Extract<HistoryEntry, { type: 'structure' }>) {
    layersRef.current = e.layers;         setLayers(e.layers)
    transformsRef.current = e.transforms; setTransforms(e.transforms)
    bboxesRef.current = e.bboxes;         setBboxes(e.bboxes)
    textLayersRef.current = e.textLayers; setTextLayers(e.textLayers)
    charLayersRef.current = e.charLayers; setCharLayers(e.charLayers)
    polyLayersRef.current = e.polyLayers; setPolyLayers(e.polyLayers)
    composite()
  }

  function undo() {
    const e = historyStack.current.pop(); if (!e) return
    if (e.type === 'pixel') {
      const c = offscreen.current[e.layerId]; if (!c) return
      const ctx = c.getContext('2d')!
      redoStack.current.push({ type: 'pixel', layerId: e.layerId, before: ctx.getImageData(0, 0, c.width, c.height) })
      ctx.putImageData(e.before, 0, 0)
      composite(); refreshLayer(e.layerId)
    } else {
      redoStack.current.push(captureStructure())
      applyStructure(e)
    }
  }
  function redo() {
    const e = redoStack.current.pop(); if (!e) return
    if (e.type === 'pixel') {
      const c = offscreen.current[e.layerId]; if (!c) return
      historyStack.current.push({ type: 'pixel', layerId: e.layerId, before: c.getContext('2d')!.getImageData(0, 0, c.width, c.height) })
      c.getContext('2d')!.putImageData(e.before, 0, 0)
      composite(); refreshLayer(e.layerId)
    } else {
      historyStack.current.push(captureStructure())
      applyStructure(e)
    }
  }

  useEffect(() => {
    if (!brushMenu) return
    function onDown(e: MouseEvent) {
      if (!brushMenuRef.current?.contains(e.target as Node)) setBrushMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [brushMenu])

  // Pinch-to-zoom via window-level wheel listener (ctrlKey = pinch on all platforms).
  // Registered on window so the scroll container's native scroll is completely untouched.
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      if (!scrollRef.current?.contains(e.target as Node)) return
      e.preventDefault()
      const oldZoom = zoomRef.current
      const newZoom = Math.max(0.1, Math.min(8, oldZoom * (e.deltaY < 0 ? 1.03 : 0.97)))
      const scrollEl  = scrollRef.current
      const canvasEl  = displayRef.current; if (!canvasEl) return
      const sr = scrollEl.getBoundingClientRect()
      const cr = canvasEl.getBoundingClientRect()
      pendingScrollAdj.current = {
        pixelX:  (e.clientX - cr.left) / oldZoom,
        pixelY:  (e.clientY - cr.top)  / oldZoom,
        cursorX: e.clientX - sr.left,
        cursorY: e.clientY - sr.top,
      }
      zoomRef.current = newZoom
      setZoom(newZoom)
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [])

  // After zoom state settles, adjust scroll so cursor stays over same canvas pixel
  useEffect(() => {
    const adj = pendingScrollAdj.current; if (!adj) return
    pendingScrollAdj.current = null
    const scrollEl = scrollRef.current; if (!scrollEl) return
    const canvasEl = displayRef.current; if (!canvasEl) return
    const sr = scrollEl.getBoundingClientRect()
    const cr = canvasEl.getBoundingClientRect()
    const canvasInScrollX = cr.left - sr.left + scrollEl.scrollLeft
    const canvasInScrollY = cr.top  - sr.top  + scrollEl.scrollTop
    scrollEl.scrollLeft = adj.pixelX * zoom + canvasInScrollX - adj.cursorX
    scrollEl.scrollTop  = adj.pixelY * zoom + canvasInScrollY - adj.cursorY
  }, [zoom])

  function switchMode(m: Mode) {
    if (modeRef.current === m) return
    modeRef.current = m
    setMode(m)
    if (m === 'art') {
      toolRef.current = 'grab'; setTool('grab')
    } else {
      toolRef.current = 'text'; setTool('text')
    }
  }

  const actionsRef = useRef({ undo, redo, switchMode, deleteLayer, clearSelection })
  useEffect(() => { actionsRef.current = { undo, redo, switchMode, deleteLayer, clearSelection } })

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') { spaceDownRef.current = true; setSpaceDown(true); e.preventDefault(); return }
      if (e.key === 'Control' || e.key === 'Meta') ctrlDownRef.current = true
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); actionsRef.current.undo(); return }
      if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); actionsRef.current.redo(); return }
      if (mod && e.key === 'd') { e.preventDefault(); actionsRef.current.clearSelection(); return }
      if (!mod) {
        if (e.key === 'Escape') {
          setBrushMenu(null)
          setSelectedIds(new Set()); selectedIdsRef.current = new Set()
          editingTextLayerRef.current = null; setTextInput(null); actionsRef.current.clearSelection(); composite(); return
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && activeIdRef.current !== 'bg') {
          e.preventDefault(); actionsRef.current.deleteLayer(activeIdRef.current); return
        }
        const m = modeRef.current
        if (m === 'art') {
          if (e.key === 'b') setTool('brush')
          if (e.key === 'e') setTool('eraser')
          if (e.key === 'g') setTool('fill')
          if (e.key === 'i') setTool('eyedropper')
          if (e.key === 'v') setTool('grab')
          if (e.key === 'x') setTool('crop')
          if (e.key === 'w') setTool('wand')
          if (e.key === 'l') setTool('lasso')
          if (e.key === 'm') setTool('marquee')
        }
        if (m === 'text') {
          if (e.key === 't') setTool('text')
          if (e.key === 'v') setTool('grab')
        }
        if (e.key === '[') setBrushSize(s => { const t = Math.max(0, valueToLogSlider(s, 1, 200) - 0.03); brushSizeRef.current = logSliderToValue(t, 1, 200); return brushSizeRef.current })
        if (e.key === ']') setBrushSize(s => { const t = Math.min(1, valueToLogSlider(s, 1, 200) + 0.03); brushSizeRef.current = logSliderToValue(t, 1, 200); return brushSizeRef.current })
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') { spaceDownRef.current = false; setSpaceDown(false) }
      if (e.key === 'Control' || e.key === 'Meta') ctrlDownRef.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ─── Layers ────────────────────────────────────────────────────────────────

  function addLayer() {
    markRemixChanged()
    saveStructure()
    const id = `layer_${Date.now()}`
    const c  = makeCanvas(dimsRef.current.w, dimsRef.current.h)
    offscreen.current[id] = c
    setLayers(prev => [...prev, { id, name: `Layer ${layers.length + 1}`, visible: true, opacity: 100 }])
    setActiveId(id)
  }

  function deleteLayer(id: string) {
    if (layers.length <= 1) return
    markRemixChanged()
    saveStructure()
    setLayers(prev => {
      const next = prev.filter(l => l.id !== id)
      if (activeIdRef.current === id) setActiveId(next[next.length - 1].id)
      return next
    })
    // intentionally keep offscreen.current[id] so undo can restore it
    setMaskedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    setTransforms(prev => { const n = { ...prev }; delete n[id]; return n })
    setBboxes(prev => { const n = { ...prev }; delete n[id]; return n })
    setThumbs(prev => { const n = { ...prev }; delete n[id]; return n })
    setCharLayers(prev => { const n = { ...prev }; delete n[id]; return n })
    setTextLayers(prev => { const n = { ...prev }; delete n[id]; return n })
    setPolyLayers(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function toggleVis(id: string) {
    saveStructure()
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  }
  function setOpacity(id: string, val: number) {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity: val } : l))
  }
  function moveLayer(id: string, dir: 1 | -1) {
    saveStructure()
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id)
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  function addMask(id: string) {
    saveStructure()
    const { w, h } = dimsRef.current
    const c = makeCanvas(w, h); const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
    maskCanvas.current[id] = c
    setMaskedIds(prev => new Set([...prev, id]))
  }

  // ─── Canvas resize ─────────────────────────────────────────────────────────

  function startResize(e: React.MouseEvent, handle: string) {
    e.preventDefault(); e.stopPropagation()
    resizingRef.current = {
      handle,
      startX: e.clientX, startY: e.clientY,
      startW: dimsRef.current.w, startH: dimsRef.current.h,
    }
    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return
      const { handle: h, startX, startY, startW, startH } = resizingRef.current
      const dx = (ev.clientX - startX) / zoomRef.current, dy = (ev.clientY - startY) / zoomRef.current
      const newW = Math.max(100, h.includes('e') ? startW + dx : h.includes('w') ? startW - dx : startW)
      const newH = Math.max(100, h.includes('s') ? startH + dy : h.includes('n') ? startH - dy : startH)
      setResizePreview({ w: Math.round(newW), h: Math.round(newH) })
    }
    function onUp(ev: MouseEvent) {
      if (!resizingRef.current) return
      const { handle: h, startX, startY, startW, startH } = resizingRef.current
      const dx = (ev.clientX - startX) / zoomRef.current, dy = (ev.clientY - startY) / zoomRef.current
      const newW = Math.round(Math.max(100, h.includes('e') ? startW + dx : h.includes('w') ? startW - dx : startW))
      const newH = Math.round(Math.max(100, h.includes('s') ? startH + dy : h.includes('n') ? startH - dy : startH))
      const shiftX = h.includes('w') ? newW - startW : 0
      const shiftY = h.includes('n') ? newH - startH : 0
      // Background resizes exactly; all other layers use max(new, old) so content is never clipped
      for (const [id, c] of Object.entries(offscreen.current)) {
        const tw = id === 'bg' ? newW : Math.max(newW, c.width)
        const th = id === 'bg' ? newH : Math.max(newH, c.height)
        const t = makeCanvas(tw, th); const tc = t.getContext('2d')!
        if (id === 'bg') { tc.fillStyle = '#fff'; tc.fillRect(0, 0, tw, th) }
        tc.drawImage(c, shiftX, shiftY)
        offscreen.current[id] = t
      }
      for (const [id, c] of Object.entries(maskCanvas.current)) {
        const tw = Math.max(newW, c.width)
        const th = Math.max(newH, c.height)
        const t = makeCanvas(tw, th); const tc = t.getContext('2d')!
        tc.fillStyle = '#fff'; tc.fillRect(0, 0, tw, th)
        tc.drawImage(c, shiftX, shiftY)
        maskCanvas.current[id] = t
      }
      // Shift text layer canvas positions so they stay visually in place
      const finalTextLayers = { ...textLayersRef.current }
      if (shiftX !== 0 || shiftY !== 0) {
        for (const [tid, meta] of Object.entries(finalTextLayers))
          finalTextLayers[tid] = { ...meta, x: meta.x + shiftX, y: meta.y + shiftY }
        textLayersRef.current = finalTextLayers
        setTextLayers(finalTextLayers)
      }
      dimsRef.current = { w: newW, h: newH }
      setCanvasW(newW); setCanvasH(newH)
      setResizePreview(null); resizingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Refresh raster layers only — refreshLayer wipes bbox for empty canvases (text layers)
      for (const id of Object.keys(offscreen.current)) {
        if (!textLayersRef.current[id]) refreshLayer(id)
      }
      // Always re-sync text bboxes last so they survive the raster refresh above
      for (const [tid, meta] of Object.entries(finalTextLayers)) refreshTextLayer(tid, meta)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Export / Publish ──────────────────────────────────────────────────────

  function flattenCanvas(): string {
    const { w, h } = dimsRef.current
    const exp = makeCanvas(w, h); const ctx = exp.getContext('2d')!
    for (const layer of layersRef.current) {
      if (!layer.visible) continue
      ctx.globalAlpha = layer.opacity / 100
      const tf   = transformsRef.current[layer.id]
      const bbox = bboxesRef.current[layer.id]
      const polyMeta2 = polyLayersRef.current[layer.id]
      if (polyMeta2) {
        const { vertices, strokeOn, strokeColor, strokeWidth, fillOn, fillColor } = polyMeta2
        ctx.beginPath()
        vertices.forEach(([vx, vy], i) => i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy))
        ctx.closePath()
        if (fillOn) { ctx.fillStyle = fillColor; ctx.fill() }
        if (strokeOn) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.lineJoin = 'round'; ctx.stroke() }
        ctx.globalAlpha = layer.opacity / 100
        continue
      }
      const textMeta = textLayersRef.current[layer.id]
      if (textMeta) {
        if (tf && bbox) {
          const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
          ctx.save()
          ctx.translate(cx + tf.tx, cy + tf.ty)
          ctx.rotate(tf.rotation)
          ctx.scale(tf.scaleX, tf.scaleY)
          ctx.translate(-cx, -cy)
          renderTextLayer(ctx, textMeta)
          ctx.restore()
        } else {
          renderTextLayer(ctx, textMeta)
        }
        continue
      }
      const lc = offscreen.current[layer.id]; if (!lc) continue
      if (tf && bbox) {
        const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
        ctx.save()
        ctx.translate(cx + tf.tx, cy + tf.ty)
        ctx.rotate(tf.rotation)
        ctx.scale(tf.scaleX, tf.scaleY)
        ctx.translate(-cx, -cy)
        ctx.drawImage(lc, 0, 0)
        ctx.restore()
      } else {
        ctx.drawImage(lc, 0, 0)
      }
    }
    ctx.globalAlpha = 1
    return exp.toDataURL('image/png')
  }

  function exportCanvas() {
    const a = document.createElement('a')
    a.download = 'meme-studio.png'; a.href = flattenCanvas(); a.click()
  }

  async function exportVvc(format: 'embedded' | 'zip') {
    if (exportingVvc) return
    setExportingVvc(true)
    try {
      const { w, h } = dimsRef.current
      const yieldToIdle = () => new Promise<void>(r => {
        if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(() => r())
        else setTimeout(r, 0)
      })
      const canvasData: Record<string, string> = {}
      const imgFiles: { name: string; data: Uint8Array }[] = []
      for (const [id, c] of Object.entries(offscreen.current)) {
        await yieldToIdle()
        const dataUrl = c.toDataURL('image/png')
        if (format === 'embedded') {
          canvasData[id] = dataUrl
        } else {
          const fname = `images/${id}.png`
          canvasData[id] = fname
          const b64 = dataUrl.split(',')[1]
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          imgFiles.push({ name: fname, data: bytes })
        }
      }
      const payload = {
        vvcVersion: 1, vvcFormat: format,
        id: currentDraftId ?? '', wallet: address,
        title: `VVC Export ${new Date().toLocaleDateString()}`,
        thumbnail: '', canvasW: w, canvasH: h,
        layers: layersRef.current, transforms: transformsRef.current,
        bboxes: bboxesRef.current, textLayers: textLayersRef.current,
        charLayers: charLayersRef.current, polyLayers: polyLayersRef.current,
        canvasData,
        inActionSnapshots: { ...inActionCharSnapshotRef.current },
        inActionHasSnapshot: { ...inActionHasSnapshot },
      }
      const stem = `vvc_${new Date().toISOString().slice(0, 10)}`
      if (format === 'embedded') {
        _triggerDownload(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `${stem}.vvc`)
      } else {
        const enc = new TextEncoder()
        const zipFiles = [{ name: 'draft.vvc', data: enc.encode(JSON.stringify(payload)) }, ...imgFiles]
        _triggerDownload(buildZip(zipFiles), `${stem}.zip`)
      }
    } finally {
      setExportingVvc(false)
    }
  }

  async function publishMeme() {
    if (publishing) return
    if (remixSourceId && !remixChangedRef.current) return  // must make changes before remixing
    setPublishing(true); setPublishMsg(null)
    try {
      const imageDataUrl = flattenCanvas()
      const characters = [...new Set(Object.values(charLayersRef.current).map(m => m.charKey))]
      const allText = Object.values(textLayersRef.current)
      const titles = allText.filter(m => m.subtype === 'title').map(m => m.text)
      const labels = allText.filter(m => m.subtype === 'label').map(m => m.text)
      const labelLinks = allText
        .filter(m => m.subtype === 'label')
        .map(m => ({
          text:    m.text,
          charKey: m.linkedCharId ? (charLayersRef.current[m.linkedCharId]?.charKey ?? null) : null,
        }))

      // Build draft payload inline — guaranteed to succeed since it uses in-memory state directly.
      // Include ALL layer canvases (no smart-skip) so the remix source is pixel-perfect.
      let draftPayloadInline: unknown = undefined
      try {
        const canvasData: Record<string, string> = {}
        for (const [id, c] of Object.entries(offscreen.current)) {
          if (textLayersRef.current[id]) continue  // text layers reconstructed from metadata
          canvasData[id] = c.toDataURL('image/png')
        }
        draftPayloadInline = {
          id: '', wallet: address,
          title: titles[0] ?? 'Published meme',
          thumbnail: '', updatedAt: new Date().toISOString(),
          canvasW: dimsRef.current.w, canvasH: dimsRef.current.h,
          layers: layersRef.current,
          transforms: transformsRef.current,
          bboxes: bboxesRef.current,
          textLayers: textLayersRef.current,
          charLayers: charLayersRef.current,
          polyLayers: polyLayersRef.current,
          canvasData,
          inActionSnapshots: { ...inActionCharSnapshotRef.current },
          inActionHasSnapshot: { ...inActionHasSnapshot },
        }
      } catch { /* draft save is best-effort */ }

      const result = await publishHandmade({
        imageDataUrl, characters, titles, labels, labelLinks,
        draftId:           currentDraftIdRef.current ?? undefined,
        remixedFrom:       remixSourceId ?? undefined,
        draftPayloadInline,
      })
      if (currentDraftId) {
        deleteDraftById(currentDraftId).catch(() => {})
        setCurrentDraftId(null)
      }
      setPublishedMemeId(result.job_id)
      // Pre-fill tweet text so the compose box is ready
      const t = titles[0] ?? 'Check out my new meme'
      setPubTweetText(`${t}\n\n${memeLink('studio', result.job_id)}\n\n#VirginVsChad #Memes $VVC`)
    } catch (err) {
      setPublishMsg({ ok: false, text: String(err) })
    } finally {
      setPublishing(false)
    }
  }

  async function handlePubShareClick() {
    if (!publishedMemeId) return
    const status = await fetchXStatus().catch(() => ({ connected: false as const }))
    if (status.connected && status.handle) {
      setPubXHandle(status.handle)
      setPubShareStage('compose')
    } else {
      window.open(X_AUTH_URL, 'x-oauth')
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type !== 'x_auth') return
        window.removeEventListener('message', onMsg)
        if (e.data.handle) {
          setPubXHandle(e.data.handle)
          setPubShareStage('compose')
        }
      }
      window.addEventListener('message', onMsg)
    }
  }

  async function handlePubPost() {
    if (!publishedMemeId) return
    setPubShareStage('posting')
    try {
      const imgUrl = new URL(`/handmade/${publishedMemeId}/image`, window.location.origin).href
      const result = await postXTweet({
        text: pubTweetText,
        image_url: imgUrl,
        meme_id: publishedMemeId,
        meme_type: 'studio',
        creator_wallet: address,
        share_in_community: pubShareInCommunity,
      })
      setPubTweetUrl(result.tweet_url)
      setPubShareStage('done')
    } catch (e) {
      alert((e as Error).message)
      setPubShareStage('compose')
    }
  }


  // ─── Render ────────────────────────────────────────────────────────────────

  const isDrawTool = tool === 'brush' || tool === 'eraser'
  const showCursor = cursorPos.on && isDrawTool && !spaceDown
  const cursorStyle: React.CSSProperties = showCursor ? {
    position: 'fixed',
    width: brushSize * zoom, height: brushSize * zoom,
    left: cursorPos.x - (brushSize * zoom) / 2,
    top:  cursorPos.y - (brushSize * zoom) / 2,
    borderRadius: brushShape === 'square' ? '0' : '50%',
  } : { display: 'none' }

  const grabCursorMap: Record<GrabHandle, string> = {
    move: 'grab', rotate: 'crosshair',
    tl: 'nw-resize', tr: 'ne-resize', br: 'se-resize', bl: 'sw-resize',
    n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
  }
  const canvasCursor = spaceDown ? 'grab'
    : (tool === 'grab' && charLayers[activeId] && hoveredTextId) ? 'grab'
    : tool === 'grab'
    ? (grabHover ? grabCursorMap[grabHover] : 'default')
    : tool === 'polygon' && hoveredVertIdxRef.current >= 0 ? 'grab'
    : tool === 'text' ? 'text'
    : (isDrawTool ? 'none' : 'crosshair')

  const grabOverlay = (() => {
    if (tool !== 'grab' || activeId === 'bg') return null
    const bbox = bboxes[activeId]; if (!bbox) return null
    const tf = transforms[activeId] ?? IDENTITY_TF
    const corners = bboxCorners(bbox, tf)
    const rhPt = rotateHandlePt(corners)
    const [tl, tr, br, bl] = corners
    const tcx = (tl[0]+tr[0])/2, tcy = (tl[1]+tr[1])/2
    const mids: [number,number][] = [
      [(tl[0]+tr[0])/2, (tl[1]+tr[1])/2],
      [(tr[0]+br[0])/2, (tr[1]+br[1])/2],
      [(br[0]+bl[0])/2, (br[1]+bl[1])/2],
      [(bl[0]+tl[0])/2, (bl[1]+tl[1])/2],
    ]
    return { corners, rhPt, tcx, tcy, mids }
  })()

  // Floating "Add Title / Add Label" buttons — shown in grab mode over the active char layer
  const charTextBtns = (() => {
    if (tool !== 'grab' || !charLayers[activeId]) return null
    const bbox = bboxes[activeId]; if (!bbox) return null
    const tf = transforms[activeId] ?? IDENTITY_TF
    const corners = bboxCorners(bbox, tf)
    const cx = corners.reduce((s, p) => s + p[0], 0) / 4
    const cy = corners.reduce((s, p) => s + p[1], 0) / 4
    const titleEntry = Object.values(textLayers).find(
      t => t.subtype === 'title' && t.linkedCharId === activeId
    )
    const hasTitle = !!titleEntry
    const titleText = titleEntry?.text ?? ''
    const magicSet = magicLabelSets[activeId] ?? null
    const magicGenerating = magicLabelGenerating.has(activeId)
    const magicRemaining = magicSet ? magicSet.labels.length - magicSet.used : 0
    return { x: cx * zoom, y: cy * zoom, hasTitle, titleText, magicSet, magicGenerating, magicRemaining,
      charKey: charLayers[activeId].charKey, charName: charLayers[activeId].charName }
  })()

  // Link handle: right-center of an unlinked text label in grab mode
  const linkHandlePos = (() => {
    const id = hoveredUnlinkedId
    if (tool !== 'grab' || !id || linkDrag || textInput) return null
    const bbox = bboxes[id]; if (!bbox) return null
    const tf = transforms[id] ?? IDENTITY_TF
    const corners = bboxCorners(bbox, tf)  // [tl, tr, br, bl]
    const hx = ((corners[1][0] + corners[2][0]) / 2) * zoom
    const hy = ((corners[1][1] + corners[2][1]) / 2) * zoom
    return { x: hx, y: hy, textId: id }
  })()

  // Dashed anchor lines from each label/title to its linked char center (text mode)
  const anchorLines = (() => {
    if (mode !== 'text') return []
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (const [textId, textMeta] of Object.entries(textLayers)) {
      if (!textMeta.linkedCharId) continue
      const charId = textMeta.linkedCharId
      const charBbox = bboxes[charId]; if (!charBbox) continue
      const charTf = transforms[charId] ?? IDENTITY_TF
      const charCX = charBbox.x + charBbox.w / 2 + charTf.tx
      const charCY = charBbox.y + charBbox.h / 2 + charTf.ty
      const textBbox = bboxes[textId]
      const textTf = transforms[textId] ?? IDENTITY_TF
      let textCX: number, textCY: number
      if (textBbox) {
        const corners = bboxCorners(textBbox, textTf)
        textCX = corners.reduce((s, p) => s + p[0], 0) / 4
        textCY = corners.reduce((s, p) => s + p[1], 0) / 4
      } else {
        textCX = textMeta.x + textTf.tx
        textCY = textMeta.y + textTf.ty
      }
      lines.push({ x1: textCX, y1: textCY, x2: charCX, y2: charCY })
    }
    return lines
  })()

  const pickerGroups: { label: string; chars: CharData[] }[] = [
    { label: 'Male',     chars: CHARACTERS.filter(c => c.group === 'male')   },
    { label: 'Female',   chars: CHARACTERS.filter(c => c.group === 'female') },
    { label: 'Deities',  chars: CHARACTERS.filter(c => c.group === 'deity')  },
    { label: 'Extended', chars: EXTENDED_CAST                                },
  ]

  const ALL_TOOLS = [
    { id: 'brush'      as Tool, key: 'B', icon: '✏', label: 'Brush'   },
    { id: 'eraser'     as Tool, key: 'E', icon: '◻', label: 'Eraser'  },
    { id: 'fill'       as Tool, key: 'G', icon: '▨', label: 'Fill'    },
    { id: 'eyedropper' as Tool, key: 'I', icon: '◈', label: 'Pick'    },
    { id: 'grab'       as Tool, key: 'V', icon: '✥', label: 'Grab'    },
    { id: 'text'       as Tool, key: 'T', icon: 'T', label: 'Text'    },
    { id: 'line'       as Tool, key: 'L', icon: '╱', label: 'Line'    },
    { id: 'polygon'    as Tool, key: 'P', icon: '⬡', label: 'Polygon' },
    { id: 'crop'       as Tool, key: 'X', icon: '⬚', label: 'Crop'    },
    { id: 'wand'       as Tool, key: 'W', icon: '✦', label: 'Wand'    },
    { id: 'lasso'      as Tool, key: 'L', icon: '⟳', label: 'Lasso'   },
    { id: 'marquee'    as Tool, key: 'M', icon: '⬜', label: 'Marquee' },
    { id: 'flip'       as Tool, key: 'F', icon: '⇄',  label: 'Flip'    },
  ]
  const TOOLS_BY_MODE: Record<Mode, typeof ALL_TOOLS> = {
    art:  ALL_TOOLS.filter(t => !['text'].includes(t.id)),
    text: ALL_TOOLS.filter(t => t.id === 'text' || t.id === 'grab'),
  }
  const ALL_SIDEBAR_TOOLS = ALL_TOOLS // unified: all tools in one mode
  const QUICK_COLORS = [
    '#000000','#1a1a1a','#555555','#aaaaaa','#ffffff',
    '#cc2222','#dd6600','#ccaa00','#226622','#224488',
    '#7722aa','#885533','#ff8888','#ffcc88','#88ccff',
  ]

  const showBrushControls  = tool === 'brush' || tool === 'eraser'
  const showFillControls   = tool === 'fill'
  const showShapeControls  = tool === 'line' || tool === 'polygon'
  const showCropControls   = tool === 'crop'
  const showWandControls   = tool === 'wand' || tool === 'lasso' || tool === 'marquee'
  const showTextControls   = tool === 'text' || (tool === 'grab' && !!textLayers[activeId])
  const showGrabControls   = tool === 'grab'
  const isActiveTextLayer = !!textLayers[activeId]
  const showFlipControls  = tool === 'flip'
  const activeCharMeta = charLayers[activeId]
  const MODE_BTNS: { id: Mode; icon: string; label: string }[] = [
    { id: 'art',  icon: '✏', label: 'Art'  },
    { id: 'text', icon: 'T', label: 'Text' },
  ]

  if (studioView === 'home') {
    return (
      <div className="mstudio">
        <StudioHome onNew={handleNewDocument} onOpenDraft={handleLoadDraft}
          resume={sessionWaiting ? { thumbnail: sessionWaiting.thumbnail, savedAt: sessionWaiting.savedAt, open: () => void handleLoadDraft(sessionWaiting) } : null} />
      </div>
    )
  }

  return (
    <>
    <div className="mstudio">

      {/* ── Main row ── */}
      <div className="mstudio-main">

        {/* ── Left Toolbar ── */}
        <aside className="mstudio-toolbar">

          <div className="mst-group">
            {/* Grab: full-width primary button */}
            <button className={`mst-tool mst-tool--grab ${tool === 'grab' ? 'active' : ''}`}
              onClick={() => { setTool('grab'); toolRef.current = 'grab' }} title="Grab (V)">
              <span className="mst-tool-icon">✥</span>
              <span className="mst-tool-label">Grab</span>
            </button>
            {/* All other tools: 2-column grid */}
            <div className="mst-tools-grid">
              {ALL_SIDEBAR_TOOLS.filter(t => t.id !== 'grab').map(({ id, key, icon, label }) => (
                <button key={id} className={`mst-tool mst-tool--small ${tool === id ? 'active' : ''}`}
                  onClick={() => { setTool(id); toolRef.current = id }} title={`${label} (${key})`}>
                  <span className="mst-tool-icon">{icon}</span>
                  <span className="mst-tool-label">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          {(
            <div className="mst-group">
              <div className="mst-label">Color</div>
              <div className="mst-color-row">
                <div className="mst-color-preview" style={{ background: color }} />
                <input type="color" value={color} onChange={e => { setColor(e.target.value); colorRef.current = e.target.value; updateTextStyle({ color: e.target.value }) }} className="mst-color-input" />
              </div>
              <div className="mst-palette">
                {QUICK_COLORS.map(c => (
                  <button key={c} className={`mst-swatch ${color === c ? 'sel' : ''}`}
                    style={{ background: c }} onClick={() => { setColor(c); colorRef.current = c; updateTextStyle({ color: c }) }} />
                ))}
              </div>
            </div>
          )}

          <div className="mst-divider" />

          <div className="mst-group">
            <button className="mst-action" onClick={undo} title="Ctrl+Z">↩ Undo</button>
            <button className="mst-action" onClick={redo} title="Ctrl+Y">↪ Redo</button>
          </div>

        </aside>

        {/* ── Canvas Area ── */}
        <div className="mstudio-area">

          {/* ── Top-left circle buttons ── */}
          <div className="mst-circle-btns">
            <button className="mst-circle-btn" onClick={() => setStudioView('home')} title="Studio Home">
              ⌂
            </button>
            <button
              className={`mst-circle-btn mst-circle-btn--save ${savingDraft ? 'mst-circle-btn--busy' : ''}`}
              onClick={handleSaveDraft}
              disabled={savingDraft}
              title="Save Draft"
            >
              {savingDraft ? '…' : '💾'}
            </button>
            {savedMsg && <span className="mst-circle-save-msg">{savedMsg}</span>}
            {!savedMsg && autoSaveStatus !== 'idle' && (
              <span className={`mst-autosave-badge mst-autosave-badge--${autoSaveStatus}`}>
                {autoSaveStatus === 'saving' ? '⟳ Saving…' : autoSaveStatus === 'saved' ? '✓ Saved' : '✕ Save err'}
              </span>
            )}
          </div>

          {/* ── Top-right corner actions ── */}
          <div className="mst-corner-actions">
            {remixSourceId && (
              <div className="mst-remix-banner">
                🎨 Remixing a meme
                {!remixChanged && <span className="mst-remix-hint"> — make at least one change</span>}
              </div>
            )}
            <button
              className="mst-publish-btn"
              onClick={publishMeme}
              disabled={publishing || (!!remixSourceId && !remixChanged)}
              title={remixSourceId && !remixChanged ? 'Make at least one change to publish your remix' : undefined}
            >
              {publishing ? '⟳ Publishing…' : remixSourceId ? '⬆ Publish Remix' : '⬆ Publish Meme'}
            </button>
            <button className="mst-export-btn" onClick={exportCanvas}>↓ Export PNG</button>
            <div className="mst-vvc-wrap">
              <button
                className="mst-export-btn mst-export-btn--vvc"
                onClick={() => setVvcMenuOpen(v => !v)}
                disabled={exportingVvc}
                title="Download project file (.vvc)"
              >
                {exportingVvc ? '⟳' : '↓'} .vvc
              </button>
              {vvcMenuOpen && (
                <div className="mst-vvc-menu" onMouseLeave={() => setVvcMenuOpen(false)}>
                  <button onClick={() => { setVvcMenuOpen(false); void exportVvc('embedded') }}>
                    Embedded JSON (single file)
                  </button>
                  <button onClick={() => { setVvcMenuOpen(false); void exportVvc('zip') }}>
                    Zip (images folder)
                  </button>
                </div>
              )}
            </div>
            {publishMsg && (
              <span className={`mst-publish-msg mst-publish-msg--${publishMsg.ok ? 'ok' : 'err'}`}>
                {publishMsg.text}
              </span>
            )}
          </div>

          {/* Mode switcher — floats at top center of canvas area */}
          <div className="mstudio-scroll" ref={scrollRef}>
            <div className="mstudio-scroll-inner"
              onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
                if (toolRef.current !== 'line' || e.button !== 0) return
                if ((e.target as HTMLElement) === displayRef.current) return
                const p = canvasCoordsFromClient(e.clientX, e.clientY)
                startLineDrag(p.x, p.y)
              }}
            >
              <div className="mstudio-canvas-wrap" style={{ width: canvasW * zoom, height: canvasH * zoom }}
                onDragOver={e => {
                  if (toolRef.current === 'grab' && e.dataTransfer.types.includes('application/vvc-text-btn')) {
                    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
                  }
                }}
                onDrop={e => {
                  if (modeRef.current !== 'text') return
                  const raw = e.dataTransfer.getData('application/vvc-text-btn')
                  if (!raw) return
                  e.preventDefault()
                  const { subtype, linkedCharId } = JSON.parse(raw) as { subtype: 'title' | 'label'; linkedCharId: string }
                  const { x, y } = canvasCoordsFromClient(e.clientX, e.clientY)
                  addTextAt(x, y, subtype, linkedCharId)
                }}
              >

                {(['n','ne','e','se','s','sw','w','nw'] as const).map(h => (
                  <div key={h} className={`mst-handle mst-handle-${h}`}
                    onMouseDown={e => startResize(e, h)} />
                ))}

                {resizePreview && (() => {
                  const h = resizingRef.current?.handle ?? ''
                  return (
                    <div className="mst-resize-ghost" style={{
                      width:  resizePreview.w * zoom,
                      height: resizePreview.h * zoom,
                      top:    h.includes('n') ? 'auto' : 0,
                      bottom: h.includes('n') ? 0 : 'auto',
                      left:   h.includes('w') ? 'auto' : 0,
                      right:  h.includes('w') ? 0 : 'auto',
                    }} />
                  )
                })()}

                <div className="mst-canvas-event-wrap" style={{ width: canvasW * zoom, height: canvasH * zoom }}>
                  <canvas
                    ref={displayRef}
                    width={canvasW} height={canvasH}
                    className="mstudio-canvas"
                    style={{ width: canvasW * zoom, height: canvasH * zoom }}
                  />
                  {/* Hit area extends 400px beyond canvas so grab handles outside bounds are clickable */}
                  <div
                    className="mst-canvas-hit-area"
                    style={{ cursor: canvasCursor, pointerEvents: charAction === 'gen-expand' ? 'none' : undefined }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseLeave}
                    onDoubleClick={onDoubleClick}
                    onContextMenu={onContextMenu}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                  />
                </div>

                {loadingLayerIds.size > 0 && displayRef.current && (() => {
                  const el = displayRef.current!
                  const rect = el.getBoundingClientRect()
                  const ratio = rect.width / el.width
                  return [...loadingLayerIds].map(lid => {
                    const bbox = bboxesRef.current[lid]
                    const tf = transformsRef.current[lid] ?? IDENTITY_TF
                    if (!bbox) return null
                    const scx = (bbox.x + bbox.w / 2 + tf.tx) * ratio + rect.left
                    const scy = (bbox.y + bbox.h / 2 + tf.ty) * ratio + rect.top
                    return (
                      <div key={lid} className="mst-reskin-spinner" style={{ position: 'fixed', left: scx, top: scy, zIndex: 60, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
                        <div className="mst-reskin-spinner-ring" />
                      </div>
                    )
                  })
                })()}

                {/* In-canvas thumbnail strips for non-active layers with pending batches */}
                {Object.entries(inActionPendingBatch).map(([layerId, urls]) => {
                  if (layerId === activeId || urls.length <= 1 || !displayRef.current) return null
                  const bbox = bboxesRef.current[layerId]
                  const tf = transformsRef.current[layerId] ?? IDENTITY_TF
                  if (!bbox) return null
                  const el = displayRef.current
                  const rect = el.getBoundingClientRect()
                  const ratio = rect.width / el.width
                  const scx = (bbox.x + bbox.w / 2 + tf.tx) * ratio + rect.left
                  const rawScy = (bbox.y + bbox.h + tf.ty) * ratio + rect.top + 8
                  const scy = Math.min(rawScy, window.innerHeight - 70)
                  return (
                    <div key={layerId} className="mst-incanvas-strip" style={{ position: 'fixed', left: scx, top: scy, transform: 'translateX(-50%)', zIndex: 50, pointerEvents: 'auto' }}>
                      {urls.map((url, i) => (
                        <img key={i} src={url} className="mst-incanvas-strip-thumb" alt={`Option ${i+1}`}
                          onMouseEnter={async () => {
                            const c = offscreen.current[layerId]; if (!c) return
                            if (!hoverPreSnapshotRef.current) {
                              hoverPreSnapshotRef.current = makeCanvas(c.width, c.height)
                              hoverPreSnapshotRef.current.getContext('2d')!.drawImage(c, 0, 0)
                            }
                            const img2 = await loadImage(url)
                            c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
                            c.getContext('2d')!.drawImage(img2, 0, 0, c.width, c.height)
                            composite()
                          }}
                          onMouseLeave={() => {
                            const pre = hoverPreSnapshotRef.current; hoverPreSnapshotRef.current = null
                            const c = offscreen.current[layerId]
                            if (pre && c) {
                              c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
                              c.getContext('2d')!.drawImage(pre, 0, 0)
                              composite()
                            }
                          }}
                          onClick={() => { hoverPreSnapshotRef.current = null; void commitInActionResult(url, layerId) }}
                        />
                      ))}
                    </div>
                  )
                })}

                <div className="mst-brush-cursor" style={cursorStyle} />

                {textDragPreview && (
                  <svg width={canvasW * zoom} height={canvasH * zoom} viewBox={`0 0 ${canvasW} ${canvasH}`}
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                    <rect
                      x={Math.min(textDragPreview.x, textDragPreview.x2)}
                      y={Math.min(textDragPreview.y, textDragPreview.y2)}
                      width={Math.abs(textDragPreview.x2 - textDragPreview.x)}
                      height={Math.abs(textDragPreview.y2 - textDragPreview.y)}
                      fill="rgba(240,160,32,0.07)" stroke="#F0A020" strokeWidth="1" strokeDasharray="5,3" />
                  </svg>
                )}

                {/* ── Gen-expand handles overlay ── */}
                {charAction === 'gen-expand' && activeId && bboxes[activeId] && (() => {
                  const bbox = bboxes[activeId]
                  const tf   = transforms[activeId] ?? IDENTITY_TF
                  const eo   = expandOffsets

                  // Mirror how grabOverlay computes visible bounds: apply tx/ty + scale
                  const cx = bbox.x + bbox.w / 2 + tf.tx
                  const cy = bbox.y + bbox.h / 2 + tf.ty
                  const hw = bbox.w / 2 * tf.scaleX
                  const hh = bbox.h / 2 * tf.scaleY
                  // Visual (transformed) bbox — same coordinate space as grabOverlay
                  const vx = cx - hw
                  const vy = cy - hh
                  const vw = hw * 2
                  const vh = hh * 2

                  const ex = vx - eo.left
                  const ey = vy - eo.top
                  const ew = vw + eo.left + eo.right
                  const eh = vh + eo.top  + eo.bottom

                  const handles: Array<{ id: string; cx: number; cy: number; cursor: string }> = [
                    { id: 'tl', cx: ex,        cy: ey,        cursor: 'nwse-resize' },
                    { id: 't',  cx: ex + ew/2, cy: ey,        cursor: 'ns-resize'   },
                    { id: 'tr', cx: ex + ew,   cy: ey,        cursor: 'nesw-resize' },
                    { id: 'r',  cx: ex + ew,   cy: ey + eh/2, cursor: 'ew-resize'   },
                    { id: 'br', cx: ex + ew,   cy: ey + eh,   cursor: 'nwse-resize' },
                    { id: 'b',  cx: ex + ew/2, cy: ey + eh,   cursor: 'ns-resize'   },
                    { id: 'bl', cx: ex,        cy: ey + eh,   cursor: 'nesw-resize' },
                    { id: 'l',  cx: ex,        cy: ey + eh/2, cursor: 'ew-resize'   },
                  ]

                  return (
                    <svg
                      width={canvasW * zoom} height={canvasH * zoom}
                      viewBox={`0 0 ${canvasW} ${canvasH}`}
                      style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'all', cursor: 'default' }}
                    >
                      {/* Block canvas events while in expand mode */}
                      <rect x={0} y={0} width={canvasW} height={canvasH} fill="transparent" />
                      {/* Original visual bbox — faint reference (matches grab overlay position) */}
                      <rect x={vx} y={vy} width={vw} height={vh}
                        fill="none" stroke="#F0A020" strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />
                      {/* Expanded bbox */}
                      <rect x={ex} y={ey} width={ew} height={eh}
                        fill="rgba(96,210,255,0.04)" stroke="#60d2ff" strokeWidth="1.5" strokeDasharray="7,4" />
                      {/* Drag handles */}
                      {handles.map(h => (
                        <rect key={h.id}
                          x={h.cx - 6} y={h.cy - 6} width={12} height={12} rx={2}
                          fill="#06131a" stroke="#60d2ff" strokeWidth="1.5"
                          style={{ cursor: h.cursor, pointerEvents: 'all' }}
                          onPointerDown={e => {
                            e.stopPropagation()
                            const { x, y } = canvasCoordsFromClient(e.clientX, e.clientY)
                            expandDragRef.current = { handle: h.id, startX: x, startY: y, startOffsets: { ...expandOffsets } }
                            ;(e.target as SVGElement).setPointerCapture(e.pointerId)
                          }}
                          onPointerMove={e => {
                            if (!expandDragRef.current) return
                            const { x, y } = canvasCoordsFromClient(e.clientX, e.clientY)
                            const { handle, startX, startY, startOffsets: so } = expandDragRef.current
                            const dx = x - startX
                            const dy = y - startY
                            setExpandOffsets({
                              left:   handle.includes('l') ? Math.max(0, so.left   - dx) : so.left,
                              right:  handle.includes('r') ? Math.max(0, so.right  + dx) : so.right,
                              top:    handle.includes('t') ? Math.max(0, so.top    - dy) : so.top,
                              bottom: handle.includes('b') ? Math.max(0, so.bottom + dy) : so.bottom,
                            })
                          }}
                          onPointerUp={() => { expandDragRef.current = null }}
                        />
                      ))}
                    </svg>
                  )
                })()}

                {grabOverlay && (
                  <svg width={canvasW * zoom} height={canvasH * zoom} viewBox={`0 0 ${canvasW} ${canvasH}`}
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                    <polygon
                      points={grabOverlay.corners.map(([x,y]) => `${x},${y}`).join(' ')}
                      fill="none" stroke="#F0A020" strokeWidth="1.5" strokeDasharray="5,3" />
                    <line x1={grabOverlay.tcx} y1={grabOverlay.tcy}
                      x2={grabOverlay.rhPt[0]} y2={grabOverlay.rhPt[1]}
                      stroke="#F0A020" strokeWidth="1" opacity="0.7" />
                    {grabOverlay.corners.map(([x,y], i) => (
                      <rect key={i} x={x-5} y={y-5} width={10} height={10}
                        fill="#1a1100" stroke="#F0A020" strokeWidth="1.5" rx="1" />
                    ))}
                    {grabOverlay.mids.map(([x,y], i) => (
                      <rect key={`m${i}`} x={x-4} y={y-4} width={8} height={8}
                        fill="#1a1100" stroke="#F0A020" strokeWidth="1.5"
                        transform={`rotate(45,${x},${y})`} />
                    ))}
                    <circle cx={grabOverlay.rhPt[0]} cy={grabOverlay.rhPt[1]} r="6"
                      fill="#1a1100" stroke="#F0A020" strokeWidth="1.5" />
                  </svg>
                )}

                {/* Multi-select: dim outlines for non-active selected layers */}
                {selectedIds.size >= 2 && [...selectedIds].filter(sid => sid !== activeId && bboxes[sid]).map(sid => {
                  const sb = bboxes[sid]!, stf = transforms[sid] ?? IDENTITY_TF
                  const sc = bboxCorners(sb, stf)
                  return (
                    <svg key={sid} width={canvasW * zoom} height={canvasH * zoom} viewBox={`0 0 ${canvasW} ${canvasH}`}
                      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                      <polygon points={sc.map(([px, py]) => `${px},${py}`).join(' ')}
                        fill="none" stroke="rgba(240,160,32,0.45)" strokeWidth="1.5" strokeDasharray="4,3" />
                    </svg>
                  )
                })}

                {/* Snap guide lines */}
                {snapLines.length > 0 && (
                  <svg width={canvasW * zoom} height={canvasH * zoom} viewBox={`0 0 ${canvasW} ${canvasH}`}
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 20 }}>
                    {snapLines.map((ln, i) => ln.axis === 'v'
                      ? <line key={i} x1={ln.pos} y1={-2000} x2={ln.pos} y2={canvasH + 2000} stroke="#F0A020" strokeWidth="1" opacity="0.7" strokeDasharray="4,4" />
                      : <line key={i} x1={-2000} y1={ln.pos} x2={canvasW + 2000} y2={ln.pos} stroke="#F0A020" strokeWidth="1" opacity="0.7" strokeDasharray="4,4" />
                    )}
                  </svg>
                )}

                {anchorLines.length > 0 && (
                  <svg width={canvasW * zoom} height={canvasH * zoom} viewBox={`0 0 ${canvasW} ${canvasH}`}
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                    {anchorLines.map((ln, i) => (
                      <line key={i}
                        x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                        stroke="#F0A020" strokeWidth="1.5" strokeDasharray="6,5"
                        opacity="0.3" />
                    ))}
                  </svg>
                )}

                {/* Link handle — draggable button on unlinked text labels */}
                {linkHandlePos && (
                  <div
                    className="mst-link-handle"
                    style={{ left: linkHandlePos.x, top: linkHandlePos.y }}
                    onMouseDown={e => startLinkDrag(e, linkHandlePos.textId)}
                  >
                    ⊕
                  </div>
                )}

                {/* Link drag line + char highlight */}
                {linkDrag && (() => {
                  const textBbox = bboxes[linkDrag.textId]
                  const textTf = transforms[linkDrag.textId] ?? IDENTITY_TF
                  let tx = linkDrag.x, ty = linkDrag.y
                  if (textBbox) {
                    const corners = bboxCorners(textBbox, textTf)
                    tx = corners.reduce((s, p) => s + p[0], 0) / 4 * zoom
                    ty = corners.reduce((s, p) => s + p[1], 0) / 4 * zoom
                  }
                  const overBbox = linkDrag.overCharId ? bboxes[linkDrag.overCharId] : null
                  const overTf   = linkDrag.overCharId ? (transforms[linkDrag.overCharId] ?? IDENTITY_TF) : IDENTITY_TF
                  return (
                    <svg style={{ position: 'absolute', inset: 0, width: canvasW * zoom, height: canvasH * zoom, pointerEvents: 'none', overflow: 'visible', zIndex: 250 }}>
                      {overBbox && (
                        <polygon
                          points={bboxCorners(overBbox, overTf).map(([px, py]) => `${px * zoom},${py * zoom}`).join(' ')}
                          fill="rgba(240,160,32,0.12)"
                          stroke="#F0A020"
                          strokeWidth="2"
                        />
                      )}
                      <line
                        x1={tx} y1={ty}
                        x2={linkDrag.x} y2={linkDrag.y}
                        stroke="#F0A020" strokeWidth="2" strokeDasharray="6,4"
                        opacity="0.9"
                      />
                      <circle cx={linkDrag.x} cy={linkDrag.y} r="5"
                        fill="#F0A020" opacity="0.9" />
                    </svg>
                  )
                })()}

                {mode === 'text' && charLayers[activeId] && hoveredTextId && bboxes[hoveredTextId] && (() => {
                  const corners = bboxCorners(bboxes[hoveredTextId], transforms[hoveredTextId] ?? IDENTITY_TF)
                  return (
                    <svg width={canvasW * zoom} height={canvasH * zoom} viewBox={`0 0 ${canvasW} ${canvasH}`}
                      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                      <defs>
                        <filter id="mst-text-glow">
                          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      </defs>
                      <polygon
                        points={corners.map(([px, py]) => `${px},${py}`).join(' ')}
                        fill="rgba(240,160,32,0.09)"
                        stroke="#F0A020"
                        strokeWidth="1.5"
                        opacity="0.85"
                        filter="url(#mst-text-glow)"
                      />
                    </svg>
                  )
                })()}

                {charTextBtns && (
                  <div className="mst-char-text-btns"
                    style={{ left: charTextBtns.x, top: charTextBtns.y }}>
                    <div className="mst-char-text-btns-row">
                      {!charTextBtns.hasTitle && (
                        <button
                          className="mst-char-text-btn mst-char-text-btn--title"
                          draggable
                          onDragStart={e => handleTextBtnDragStart(e, 'title')}
                          onClick={() => handleAddTextForChar('title')}
                          title="Add title (click or drag to place)"
                        ><span style={{fontSize:14}}>T</span><span>title</span></button>
                      )}
                      <button
                        className="mst-char-text-btn mst-char-text-btn--label"
                        draggable
                        onDragStart={e => handleTextBtnDragStart(e, 'label')}
                        onClick={() => handleAddTextForChar('label')}
                        title="Add label (click or drag to place)"
                      ><span style={{fontSize:14}}>+</span><span>label</span></button>
                    </div>
                    {/* AI labels — centered below; hidden only when set is fully exhausted */}
                    {(charTextBtns.magicGenerating || !charTextBtns.magicSet || charTextBtns.magicSet.labels.length > 0) && (
                      <div className="mst-char-text-btns-magic-row">
                        <button
                          className={`mst-char-text-btn mst-char-text-btn--magic${charTextBtns.magicGenerating ? ' mst-char-text-btn--magic-loading' : ''}`}
                          draggable={!charTextBtns.magicGenerating && !!charTextBtns.magicSet && charTextBtns.magicSet.labels.length > 0}
                          onDragStart={(!charTextBtns.magicGenerating && !!charTextBtns.magicSet && charTextBtns.magicSet.labels.length > 0) ? e => handleMagicLabelDragStart(e, activeId) : undefined}
                          onClick={() => {
                            if (charTextBtns.magicGenerating) return
                            if (!charTextBtns.hasTitle) { handleAddTextForChar('title'); return }
                            if (!charTextBtns.magicSet) {
                              triggerMagicLabels(activeId, charTextBtns.charKey, charTextBtns.titleText)
                            }
                          }}
                          title={
                            charTextBtns.magicGenerating ? 'Generating AI labels…' :
                            charTextBtns.magicSet ? 'Drag to place an AI label' :
                            !charTextBtns.hasTitle ? 'Click to set a title — AI labels will generate automatically' :
                            'Generate AI labels'
                          }
                          style={{ cursor: charTextBtns.magicGenerating ? 'default' : charTextBtns.magicSet ? 'grab' : 'pointer' }}
                        >
                          <span className="mst-magic-ai-text">AI</span>
                          <span>labels</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {resizePreview && (
            <div className="mst-resize-label">{resizePreview.w} × {resizePreview.h}px</div>
          )}

          {/* Joystick controls */}
          <StudioJoysticks
            onZoomDelta={delta => {
              const nz = Math.max(0.05, Math.min(4, zoomRef.current + delta))
              zoomRef.current = nz; setZoom(nz)
            }}
            onPanDelta={(dx, dy) => {
              const el = scrollRef.current
              if (el) { el.scrollLeft += dx; el.scrollTop += dy }
            }}
          />

          {/* ── Right-side tool options panel — same column as publish buttons + joysticks ── */}
          {(showBrushControls || showFillControls || showCropControls || showWandControls || showTextControls || showShapeControls || showFlipControls || showGrabControls) && (
            <aside className="mst-options-panel">

              {showBrushControls && (<>
                <div className="mst-label">Shape</div>
                <div className="mst-shapes">
                  {(['circle','square','soft'] as BrushShape[]).map(s => (
                    <button key={s} className={`mst-shape-btn ${brushShape === s ? 'active' : ''}`}
                      onClick={() => setBrushShape(s)} title={s}>
                      {s === 'circle' ? '○' : s === 'square' ? '□' : '◎'}
                    </button>
                  ))}
                </div>
                <div className="mst-label" style={{ marginTop: 8 }}>Size <span className="mst-val">{brushSize}px</span></div>
                <input type="range" min={0} max={1000} value={Math.round(valueToLogSlider(brushSize, 1, 200) * 1000)}
                  onChange={e => { const v = logSliderToValue(+e.target.value / 1000, 1, 200); setBrushSize(v); brushSizeRef.current = v }} className="mst-slider" />
                <div className="mst-label" style={{ marginTop: 8 }}>Opacity <span className="mst-val">{paintOpacity}%</span></div>
                <input type="range" min={1} max={100} value={paintOpacity}
                  onChange={e => setPaintOpacity(+e.target.value)} className="mst-slider" />
                <div className="mst-label" style={{ marginTop: 8 }}>Smooth <span className="mst-val">{smoothing}</span></div>
                <input type="range" min={0} max={100} value={smoothing}
                  onChange={e => setSmoothing(+e.target.value)} className="mst-slider" />
              </>)}

              {showFillControls && (<>
                <div className="mst-label">Tolerance <span className="mst-val">{fillTolerance}</span></div>
                <input type="range" min={0} max={255} value={fillTolerance}
                  onChange={e => setFillTolerance(+e.target.value)} className="mst-slider" />
              </>)}

              {showCropControls && (
                <div className="mst-label" style={{ lineHeight: 1.5 }}>Drag to select area. Release to crop.</div>
              )}

              {showWandControls && (<>
                <div className="mst-label">Mode</div>
                <div className="mst-sel-mode-row">
                  {(['replace','add','subtract'] as const).map(m => (
                    <button key={m} className={`mst-sel-mode-btn ${selectionMode === m ? 'active' : ''}`}
                      onClick={() => { setSelectionMode(m); selectionModeRef.current = m }}
                      title={m === 'replace' ? 'Replace' : m === 'add' ? 'Add (Shift)' : 'Subtract (Alt)'}>
                      {m === 'replace' ? '⬜' : m === 'add' ? '⊕' : '⊖'}
                    </button>
                  ))}
                </div>
                {tool === 'wand' && (<>
                  <div className="mst-label" style={{ marginTop: 8 }}>Tolerance <span className="mst-val">{wandTolerance}</span></div>
                  <input type="range" min={0} max={255} value={wandTolerance}
                    onChange={e => { setWandTolerance(+e.target.value); wandToleranceRef.current = +e.target.value }} className="mst-slider" />
                </>)}
                {hasSelection && (<>
                  <div className="mst-wand-actions" style={{ marginTop: 8 }}>
                    <button className="mst-wand-btn mst-wand-btn--erase" onClick={applyWandErase}>Erase sel.</button>
                    <button className="mst-wand-btn mst-wand-btn--fill"  onClick={applyWandFill}>Fill sel.</button>
                  </div>
                  <button className="mst-wand-btn mst-wand-btn--clear" style={{ marginTop: 4 }} onClick={clearSelection}>✕ Deselect</button>
                </>)}
              </>)}

              {showFlipControls && (<>
                <div className="mst-label">Flip active layer</div>
                <div className="mst-flip-btns">
                  <button className="mst-flip-btn" onClick={() => flipLayer('h')}>⇄ Horizontal</button>
                  <button className="mst-flip-btn" onClick={() => flipLayer('v')}>⇅ Vertical</button>
                </div>
              </>)}

              {showTextControls && (<>
                <div className="mst-label">Font</div>
                <div className="mst-font-btns">
                  {TEXT_FONTS.map(f => (
                    <button key={f.id}
                      className={`mst-font-btn ${fontFamily === f.id ? 'active' : ''}`}
                      style={{ fontFamily: f.id }}
                      onClick={() => { setFontFamily(f.id); fontFamilyRef.current = f.id; updateTextStyle({ fontFamily: f.id }) }}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="mst-label" style={{ marginTop: 8 }}>Size <span className="mst-val">{fontSize}px</span></div>
                <input type="range" min={0} max={1000} value={Math.round(valueToLogSlider(fontSize, 12, 300) * 1000)}
                  onChange={e => { const v = logSliderToValue(+e.target.value / 1000, 12, 300); setFontSize(v); fontSizeRef.current = v; updateTextStyle({ fontSize: v }) }}
                  className="mst-slider" />
                <div className="mst-label" style={{ marginTop: 8 }}>Align</div>
                <div className="mst-align-btns">
                  {([
                    { id: 'left'   , label: '≡L' },
                    { id: 'center' , label: '≡C' },
                    { id: 'right'  , label: '≡R' },
                    { id: 'justify', label: '≡J' },
                  ] as { id: TextAlign; label: string }[]).map(({ id: a, label }) => (
                    <button key={a} className={`mst-align-btn ${textAlign === a ? 'active' : ''}`}
                      title={a.charAt(0).toUpperCase() + a.slice(1)}
                      onClick={() => {
                        setTextAlign(a); textAlignRef.current = a
                        setTextInput(prev => prev ? { ...prev, textAlign: a } : null)
                        updateTextStyle({ textAlign: a })
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mst-label" style={{ marginTop: 8 }}>Highlight</div>
                <div className="mst-shape-toggle-row">
                  <label className="mst-shape-toggle">
                    <input type="checkbox"
                      checked={!!textBgColor}
                      onChange={e => {
                        const v = e.target.checked ? '#ffff00' : ''
                        setTextBgColor(v)
                        updateTextStyle({ bgColor: v })
                      }} />
                    <span>BG color</span>
                  </label>
                  {textBgColor && (
                    <input type="color" value={textBgColor}
                      onChange={e => { setTextBgColor(e.target.value); updateTextStyle({ bgColor: e.target.value }) }}
                      className="mst-color-input mst-color-input--mini" />
                  )}
                </div>
              </>)}

              {tool === 'grab' && !!polyLayers[activeId] && (<>
                <div className="mst-label">Polygon</div>
                <div className="mst-shape-toggle-row">
                  <label className="mst-shape-toggle">
                    <input type="checkbox" checked={polyLayers[activeId].strokeOn}
                      onChange={e => updatePolyStyle(activeId, { strokeOn: e.target.checked })} />
                    <span>Stroke</span>
                  </label>
                  {polyLayers[activeId].strokeOn && (
                    <input type="color" value={polyLayers[activeId].strokeColor}
                      onChange={e => updatePolyStyle(activeId, { strokeColor: e.target.value })}
                      className="mst-color-input mst-color-input--mini" />
                  )}
                </div>
                {polyLayers[activeId].strokeOn && (<>
                  <div className="mst-label">Width <span className="mst-val">{polyLayers[activeId].strokeWidth}px</span></div>
                  <input type="range" min={1} max={40} value={polyLayers[activeId].strokeWidth}
                    onChange={e => updatePolyStyle(activeId, { strokeWidth: +e.target.value })} className="mst-slider" />
                </>)}
                <div className="mst-shape-toggle-row" style={{ marginTop: 4 }}>
                  <label className="mst-shape-toggle">
                    <input type="checkbox" checked={polyLayers[activeId].fillOn}
                      onChange={e => updatePolyStyle(activeId, { fillOn: e.target.checked })} />
                    <span>Fill</span>
                  </label>
                  {polyLayers[activeId].fillOn && (
                    <input type="color" value={polyLayers[activeId].fillColor}
                      onChange={e => updatePolyStyle(activeId, { fillColor: e.target.value })}
                      className="mst-color-input mst-color-input--mini" />
                  )}
                </div>
              </>)}

              {showGrabControls && (() => {
                const isMultiSel = selectedIds.size >= 2
                const hasSingle  = activeId !== 'bg'
                return (<>
                  <div className="mst-label">Snap</div>
                  <label className="mst-shape-toggle">
                    <input type="checkbox" checked={snapEnabled}
                      onChange={e => { setSnapEnabled(e.target.checked); snapEnabledRef.current = e.target.checked }} />
                    <span>Snap to objects</span>
                  </label>
                  <div className="mst-label" style={{ marginTop: 10 }}>Selection</div>
                  <label className="mst-shape-toggle">
                    <input type="checkbox" checked={multiSelectMode}
                      onChange={e => setMultiSelectMode(e.target.checked)} />
                    <span>Select multiple</span>
                  </label>
                  <div className="mst-label" style={{ marginTop: 2, fontSize: 9, color: '#444', textTransform: 'none', letterSpacing: 0 }}>
                    or hold Ctrl and click
                  </div>
                  {(isMultiSel || hasSingle) && (<>
                    <div className="mst-label" style={{ marginTop: 10 }}>
                      {isMultiSel ? `Align (${selectedIds.size} layers)` : 'Align to canvas'}
                    </div>
                    <div className="mst-grab-align-grid">
                      <button className="mst-grab-align-btn" title={isMultiSel ? 'Align left edges' : 'Left'}
                        onClick={() => isMultiSel ? alignSelection('left') : alignToCanvas('left')}>←</button>
                      <button className="mst-grab-align-btn" title="Center horizontally"
                        onClick={() => isMultiSel ? alignSelection('centerH') : alignToCanvas('centerH')}>↔</button>
                      <button className="mst-grab-align-btn" title={isMultiSel ? 'Align right edges' : 'Right'}
                        onClick={() => isMultiSel ? alignSelection('right') : alignToCanvas('right')}>→</button>
                      <button className="mst-grab-align-btn" title={isMultiSel ? 'Align top edges' : 'Top'}
                        onClick={() => isMultiSel ? alignSelection('top') : alignToCanvas('top')}>↑</button>
                      <button className="mst-grab-align-btn" title="Center vertically"
                        onClick={() => isMultiSel ? alignSelection('centerV') : alignToCanvas('centerV')}>↕</button>
                      <button className="mst-grab-align-btn" title={isMultiSel ? 'Align bottom edges' : 'Bottom'}
                        onClick={() => isMultiSel ? alignSelection('bottom') : alignToCanvas('bottom')}>↓</button>
                      {isMultiSel && selectedIds.size >= 3 && (<>
                        <button className="mst-grab-align-btn mst-grab-align-btn--wide" title="Distribute horizontally"
                          onClick={() => alignSelection('distH')}>⇔ H</button>
                        <button className="mst-grab-align-btn mst-grab-align-btn--wide" title="Distribute vertically"
                          onClick={() => alignSelection('distV')}>⇕ V</button>
                      </>)}
                    </div>
                  </>)}
                  {/* Polygon shape controls if active layer is a polygon */}
                  {!!polyLayers[activeId] && (
                    <div className="mst-label" style={{ marginTop: 10, borderTop: '1px solid #222', paddingTop: 8 }}>Shape</div>
                  )}
                </>)
              })()}

              {showShapeControls && (<>
                {tool === 'polygon' && (<>
                  <div className="mst-label">Shape</div>
                  <div className="mst-poly-presets">
                    {POLY_PRESETS.map((p, i) => (
                      <button key={i} className={`mst-poly-preset ${polyPresetIdx === i ? 'active' : ''}`}
                        onClick={() => setPolyPresetIdx(i)} title={`${p.sides} sides`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>)}
                <div className="mst-shape-toggle-row" style={{ marginTop: 4 }}>
                  <label className="mst-shape-toggle">
                    <input type="checkbox" checked={shapeStrokeOn} onChange={e => { setShapeStrokeOn(e.target.checked); shapeStrokeOnRef.current = e.target.checked; if (polyLayersRef.current[activeIdRef.current]) updatePolyStyle(activeIdRef.current, { strokeOn: e.target.checked }) }} />
                    <span>Stroke</span>
                  </label>
                  {shapeStrokeOn && (
                    <input type="color" value={shapeStrokeColor}
                      onChange={e => { setShapeStrokeColor(e.target.value); shapeStrokeColorRef.current = e.target.value; if (polyLayersRef.current[activeIdRef.current]) updatePolyStyle(activeIdRef.current, { strokeColor: e.target.value }) }}
                      className="mst-color-input mst-color-input--mini" />
                  )}
                </div>
                {shapeStrokeOn && (<>
                  <div className="mst-label">Width <span className="mst-val">{shapeStrokeW}px</span></div>
                  <input type="range" min={1} max={40} value={shapeStrokeW}
                    onChange={e => { const v = +e.target.value; setShapeStrokeW(v); shapeStrokeWRef.current = v; if (polyLayersRef.current[activeIdRef.current]) updatePolyStyle(activeIdRef.current, { strokeWidth: v }) }} className="mst-slider" />
                </>)}
                {tool === 'polygon' && (
                  <div className="mst-shape-toggle-row" style={{ marginTop: 4 }}>
                    <label className="mst-shape-toggle">
                      <input type="checkbox" checked={shapeFillOn} onChange={e => { setShapeFillOn(e.target.checked); shapeFillOnRef.current = e.target.checked; if (polyLayersRef.current[activeIdRef.current]) updatePolyStyle(activeIdRef.current, { fillOn: e.target.checked }) }} />
                      <span>Fill</span>
                    </label>
                    {shapeFillOn && (
                      <input type="color" value={shapeFillColor}
                        onChange={e => { setShapeFillColor(e.target.value); shapeFillColorRef.current = e.target.value; if (polyLayersRef.current[activeIdRef.current]) updatePolyStyle(activeIdRef.current, { fillColor: e.target.value }) }}
                        className="mst-color-input mst-color-input--mini" />
                    )}
                  </div>
                )}
              </>)}

            </aside>
          )}
        </div>

        {/* ── Right-click brush menu ── */}
        {brushMenu && (
          <div ref={brushMenuRef} className="mst-brush-menu"
            style={{ left: brushMenu.x, top: brushMenu.y }}
            onMouseDown={e => e.stopPropagation()}>
            <div className="mst-bm-title">Brush Settings</div>
            <div className="mst-bm-row">
              <span>Size</span>
              <input type="range" min={0} max={1000} value={Math.round(valueToLogSlider(brushSize, 1, 200) * 1000)}
                onChange={e => { const v = logSliderToValue(+e.target.value / 1000, 1, 200); setBrushSize(v); brushSizeRef.current = v }} className="mst-slider" />
              <span className="mst-bm-val">{brushSize}px</span>
            </div>
            <div className="mst-bm-row">
              <span>Opacity</span>
              <input type="range" min={1} max={100} value={paintOpacity}
                onChange={e => setPaintOpacity(+e.target.value)} className="mst-slider" />
              <span className="mst-bm-val">{paintOpacity}%</span>
            </div>
            <div className="mst-bm-row">
              <span>Smooth</span>
              <input type="range" min={0} max={100} value={smoothing}
                onChange={e => setSmoothing(+e.target.value)} className="mst-slider" />
              <span className="mst-bm-val">{smoothing}</span>
            </div>
          </div>
        )}

        {/* ── Layers Panel ── */}
        <aside className="mstudio-layers">
          <div className="msl-header">
            <span>LAYERS</span>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <button
                className={`msl-key-btn ${ownKeyActive ? 'active' : ''}`}
                onClick={() => setShowKeyModal(true)}
                title={ownKeyActive ? 'Own Gemini key active — credits bypassed' : 'Use own Gemini API key'}
              >
                🔑{ownKeyActive && <span className="msl-key-dot" />}
              </button>
              <button className="msl-add-btn" onClick={addLayer}>+ New</button>
            </div>
          </div>

          <div className="msl-list">
            {(() => {
              const renderLayerItem = (layer: typeof layers[0]) => {
                const charMeta = charLayers[layer.id]
                const isActive = layer.id === activeId
                return (
                  <div key={layer.id}
                    className={`msl-item ${isActive ? 'active' : ''}`}
                    onClick={() => { setActiveId(layer.id); syncTextControls(layer.id); setSelectedIds(new Set()); selectedIdsRef.current = new Set() }}>
                    <div className="msl-name-row">
                      <span className="msl-name">{layer.name}</span>
                      {charMeta && <span className="msl-char-badge">★</span>}
                    </div>
                    {thumbs[layer.id]
                      ? <img src={thumbs[layer.id]} className="msl-thumb" alt="" />
                      : <div className="msl-dot-area">
                          <div className="msl-dot" style={{
                            background: maskedIds.has(layer.id) ? '#ff8800'
                              : layer.id === 'bg' ? '#fff' : '#8888ff'
                          }} />
                        </div>
                    }
                    <div className="msl-btns" onClick={e => e.stopPropagation()}>
                      <button className={`msl-btn msl-vis ${layer.visible ? '' : 'off'}`}
                        onClick={e => { e.stopPropagation(); toggleVis(layer.id) }} title="Visibility">
                        {layer.visible ? '●' : '○'}
                      </button>
                      <button className="msl-btn" onClick={e => { e.stopPropagation(); moveLayer(layer.id, -1) }} title="Up">↑</button>
                      <button className="msl-btn" onClick={e => { e.stopPropagation(); moveLayer(layer.id, 1) }} title="Down">↓</button>
                      {!maskedIds.has(layer.id) && (
                        <button className="msl-btn" onClick={e => { e.stopPropagation(); addMask(layer.id) }} title="Add mask">▣</button>
                      )}
                      <button className="msl-btn msl-del" onClick={e => { e.stopPropagation(); deleteLayer(layer.id) }} title="Delete">×</button>
                    </div>
                    {isActive && (
                      <div className="msl-opacity" onClick={e => e.stopPropagation()}>
                        <span className="mst-label">Opacity</span>
                        <input type="range" min={0} max={100} value={layer.opacity}
                          onPointerDown={() => saveStructure()}
                          onChange={e => setOpacity(layer.id, +e.target.value)} className="mst-slider" />
                        <span className="mst-val">{layer.opacity}%</span>
                      </div>
                    )}
                  </div>
                )
              }

              const renderTextEntry = (textId: string) => {
                const lyr = layers.find(l => l.id === textId)
                const tm = textLayers[textId]
                if (!lyr || !tm) return null
                const isActive = textId === activeId
                const isEditing = inlineEditingTextId === textId
                return (
                  <div key={textId}
                    className={`mst-text-group-entry ${isActive ? 'active' : ''}`}
                    onClick={() => { setActiveId(textId); syncTextControls(textId) }}>
                    <button className={`msl-btn msl-vis ${lyr.visible ? '' : 'off'}`}
                      onClick={e => { e.stopPropagation(); toggleVis(textId) }}>
                      {lyr.visible ? '●' : '○'}
                    </button>
                    {isEditing
                      ? <input className="mst-text-group-input" autoFocus value={inlineEditText}
                          onChange={e => setInlineEditText(e.target.value)}
                          onBlur={() => commitInlineTextEdit(textId, inlineEditText)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitInlineTextEdit(textId, inlineEditText) }
                            if (e.key === 'Escape') { setInlineEditingTextId(null) }
                          }}
                          onClick={e => e.stopPropagation()} />
                      : <span className="mst-text-group-label"
                          onDoubleClick={e => { e.stopPropagation(); setInlineEditingTextId(textId); setInlineEditText(tm.text) }}>
                          {tm.text || '—'}
                        </span>
                    }
                    <div className="mst-text-group-entry-btns" onClick={e => e.stopPropagation()}>
                      <button className="msl-btn" title="Up" onClick={e => { e.stopPropagation(); moveLayer(textId, -1) }}>↑</button>
                      <button className="msl-btn" title="Down" onClick={e => { e.stopPropagation(); moveLayer(textId, 1) }}>↓</button>
                      <button className="msl-btn" title="Edit text" onClick={e => { e.stopPropagation(); setInlineEditingTextId(textId); setInlineEditText(tm.text) }}>✏</button>
                      <button className="msl-btn msl-del" title="Delete" onClick={e => { e.stopPropagation(); deleteLayer(textId) }}>×</button>
                    </div>
                  </div>
                )
              }

              if (mode !== 'text') {
                return [...layers].reverse().map(layer => renderLayerItem(layer))
              }

              // Text mode: group text layers under their linked char
              const linkedByChar: Record<string, string[]> = {}
              const unlinkedIds: string[] = []
              const linkedIds = new Set<string>()
              for (const lyr of layers) {
                const tm = textLayers[lyr.id]; if (!tm) continue
                if (tm.linkedCharId && charLayers[tm.linkedCharId]) {
                  if (!linkedByChar[tm.linkedCharId]) linkedByChar[tm.linkedCharId] = []
                  linkedByChar[tm.linkedCharId].push(lyr.id)
                  linkedIds.add(lyr.id)
                } else {
                  unlinkedIds.push(lyr.id)
                }
              }

              const items: React.ReactNode[] = []
              for (const layer of [...layers].reverse()) {
                if (linkedIds.has(layer.id)) continue
                const tm = textLayers[layer.id]
                if (tm && !tm.linkedCharId) continue // unlinked text — rendered below
                items.push(renderLayerItem(layer))
                // If this is a char layer, render its linked text entries indented below
                if (charLayers[layer.id] && linkedByChar[layer.id]) {
                  for (const textId of linkedByChar[layer.id]) {
                    items.push(renderTextEntry(textId))
                  }
                }
              }
              // Unlinked text group
              if (unlinkedIds.length > 0) {
                items.push(<div key="__unlinked__" className="mst-unlinked-group-header">Unlinked</div>)
                for (const textId of unlinkedIds) {
                  items.push(renderTextEntry(textId))
                }
              }
              return items
            })()}
          </div>

          <div className="msl-footer">
            <span className="mst-val">{canvasW} × {canvasH}px</span>
          </div>
        </aside>

      </div>{/* end .mstudio-main */}

      {/* ── Character Picker Panel ── */}
      {<div className={`mstudio-picker ${pickerOpen ? 'mstudio-picker--open' : 'mstudio-picker--closed'}`}>

        {/* Toggle tab */}
        <button className="mstudio-picker-tab" onClick={() => setPickerOpen(o => !o)}>
          <div className="mstudio-picker-tab-avatars">
            {CHARACTERS.slice(0, 5).map(char => (
              <div key={char.key} className="mstudio-picker-tab-avatar">
                <img src={charImgSrc(char)} alt="" />
              </div>
            ))}
          </div>
          <span>Characters ({ALL_CHARS.length})</span>
          <span className="mstudio-picker-tab-chevron">▲</span>
        </button>

        {/* Scrollable content — only rendered when open for performance */}
        {pickerOpen && (
          <div className="mstudio-picker-scroll">
            {pickerGroups.map(({ label, chars }) => (
              <div key={label} className="mst-picker-group">
                <span className="mst-picker-group-label">{label}</span>
                <div className="mst-picker-row">
                  {chars.map(char => (
                    <div
                      key={char.key}
                      className={`mst-char-card mst-char-card--${char.rarity}`}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('application/vvc-char', JSON.stringify({
                          charKey: char.key, charName: char.name, charFile: char.file, charGroup: char.group,
                        }))
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      title={`Drag ${char.name} onto canvas`}
                    >
                      <img src={charImgSrc(char)} alt={char.name} />
                      <span className="mst-char-card-name">{char.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* ── Magic label picker popup ── */}
      {magicLabelPicker && (<>
        <div className="mst-magic-picker-backdrop" onClick={() => setMagicLabelPicker(null)} />
        <div className="mst-magic-picker" style={{ left: magicLabelPicker.cx, top: magicLabelPicker.cy }}>
          <div className="mst-magic-picker-header">✦ Pick a label</div>
          {magicLabelPicker.labels.map((label, i) => (
            <button key={i} className="mst-magic-picker-item" onClick={() => {
              addTextAt(magicLabelPicker.canvasX, magicLabelPicker.canvasY, 'label', magicLabelPicker.charId, label)
              setMagicLabelSets(prev => {
                const set = prev[magicLabelPicker.charId]; if (!set) return prev
                const newLabels = set.labels.filter((_, idx) => idx !== i)
                return { ...prev, [magicLabelPicker.charId]: { ...set, labels: newLabels } }
              })
              setMagicLabelPicker(null)
            }}>
              {label}
            </button>
          ))}
        </div>
      </>)}

      {/* ── Grab radial menu ── */}
      {(grabMenu || charPicker) && (
        <div className="mst-radial-backdrop" onClick={() => { setGrabMenu(null); setCharPicker(null) }} />
      )}
      {grabMenu && (() => {
        const R = 72
        const allItems = [
          { label: 'Character', icon: '◉', dx: 0,           dy: -R,      action: () => { setCharPicker({ x: grabMenu.x, y: grabMenu.y, canvasX: grabMenu.canvasX, canvasY: grabMenu.canvasY }); setGrabMenu(null) } },
          { label: 'Title',     icon: 'T', dx: -R * 0.866,  dy: R * 0.5, action: () => addTextAt(grabMenu.canvasX, grabMenu.canvasY, 'title') },
          { label: 'Label',     icon: 'a', dx:  R * 0.866,  dy: R * 0.5, action: () => addTextAt(grabMenu.canvasX, grabMenu.canvasY, 'label') },
        ]
        const items = allItems
        return <>
          <svg className="mst-radial-lines" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 499 }}>
            {items.map(it => (
              <line key={it.label} x1={grabMenu.x} y1={grabMenu.y} x2={grabMenu.x + it.dx} y2={grabMenu.y + it.dy} stroke="#F0A020" strokeWidth="1" opacity="0.25" />
            ))}
          </svg>
          <div className="mst-radial-center" style={{ left: grabMenu.x, top: grabMenu.y }} />
          {items.map(it => (
            <button key={it.label} className="mst-radial-btn" style={{ left: grabMenu.x + it.dx - 28, top: grabMenu.y + it.dy - 28 }} onClick={it.action}>
              <span className="mst-radial-icon">{it.icon}</span>
              <span className="mst-radial-label">{it.label}</span>
            </button>
          ))}
        </>
      })()}

      {/* ── Character picker popup ── */}
      {charPicker && (
        <div className="mst-char-picker-popup" style={{
          left: Math.min(charPicker.x + 16, window.innerWidth - 296),
          top:  Math.max(16, Math.min(charPicker.y - 20, window.innerHeight - 536)),
        }}>
          <div className="mst-char-picker-header">
            <span>ADD CHARACTER</span>
            <button className="mst-char-picker-close" onClick={() => setCharPicker(null)}>×</button>
          </div>
          <div className="mst-char-picker-scroll">
            {pickerGroups.map(({ label, chars }) => (
              <div key={label} className="mst-picker-group">
                <span className="mst-picker-group-label">{label}</span>
                <div className="mst-picker-row">
                  {chars.map(char => (
                    <div
                      key={char.key}
                      className={`mst-char-card mst-char-card--${char.rarity}`}
                      onClick={() => {
                        const cp = charPicker
                        setCharPicker(null)
                        dropCharacter(char.key, char.name, char.file, cp.canvasX, cp.canvasY, char.group)
                      }}
                      title={char.name}
                    >
                      <img src={charImgSrc(char)} alt={char.name} />
                      <span className="mst-char-card-name">{char.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Floating layer action panel — only visible in grab mode ── */}
      {tool === 'grab' && activeId && displayRef.current && (() => {
        void scrollTick // consumed so scroll re-renders recompute rect

        // ── Background layer: show AI BG panel anchored to canvas top ──
        if (activeId === 'bg') {
          const el = displayRef.current!
          const rect = el.getBoundingClientRect()
          const bgX = rect.left + rect.width / 2
          const bgY = Math.min(rect.bottom + 10, window.innerHeight - 200)
          const busy = loadingLayerIds.has('bg')
          return (
            <div className={`mst-char-action-float ${ownKeyActive ? 'mst-char-action-float--own-key' : ''}`} style={{ left: bgX, top: bgY }}>
              <div className="mst-char-action-btns">
                <button
                  className={`mst-char-action-btn ${charAction === 'ai-edit' ? 'active' : ''}`}
                  onClick={() => setCharAction(a => a === 'ai-edit' ? null : 'ai-edit')}
                  title="AI edit/generate background"
                >
                  <span className="mst-char-action-icon">✦</span>
                  <span className="mst-char-action-label">AI BG</span>
                  <span className="mst-action-cost">⚡ 3</span>
                </button>
              </div>
              {charAction === 'ai-edit' && (
                <div className="mst-char-action-panel">
                  <div className="mst-char-action-panel-hint">Describe the background to generate or edit.</div>
                  <textarea
                    className="mst-reskin-textarea"
                    placeholder={`e.g. "neon city skyline at night"`}
                    value={artAiPrompt}
                    onChange={e => { setArtAiPrompt(e.target.value); artAiPromptRef.current = e.target.value }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doArtAi() } }}
                    disabled={busy}
                    autoFocus
                  />
                  <button className="mst-reskin-btn" onClick={doArtAi} disabled={!artAiPrompt.trim() || busy}>
                    {busy ? '⟳ Generating…' : <span>Apply <span className="mst-reskin-btn-cost">· ⚡ 3</span></span>}
                  </button>
                </div>
              )}
            </div>
          )
        }

        const bbox = bboxesRef.current[activeId]
        const tf   = transformsRef.current[activeId] ?? IDENTITY_TF
        if (!bbox) return null
        const el    = displayRef.current!
        const rect  = el.getBoundingClientRect()
        const ratio = rect.width / el.width
        const corners = bboxCorners(bbox, tf)
        const scx = ((corners[2][0] + corners[3][0]) / 2) * ratio + rect.left
        const rawScy = ((corners[2][1] + corners[3][1]) / 2) * ratio + rect.top + 10
        // Only clamp when bar would overlap the character-strip panel at the bottom.
        // 200 ≈ height of the character selection strip; let the bar use workspace space freely.
        const scy = Math.min(rawScy, window.innerHeight - 200)
        const busy = loadingLayerIds.has(activeId)
        return (
          <div className={`mst-char-action-float ${ownKeyActive ? 'mst-char-action-float--own-key' : ''}`} style={{ left: scx, top: scy }}>
            <div className="mst-char-action-btns">
              {activeCharMeta && (() => {
                const inActionCost = inActionCount === 1 ? 3 : inActionCount === 2 ? 5 : 8
                return (<>
                  <button
                    className={`mst-char-action-btn ${charAction === 'reskin' ? 'active' : ''}`}
                    onClick={() => setCharAction(a => a === 'reskin' ? null : 'reskin')}
                    title="Re-skin from template"
                  >
                    <span className="mst-char-action-icon">🧍</span>
                    <span className="mst-char-action-label">Re-skin</span>
                    <span className="mst-action-cost">⚡ 3</span>
                  </button>
                  <button
                    className={`mst-char-action-btn ${charAction === 'edit' ? 'active' : ''}`}
                    onClick={() => setCharAction(a => a === 'edit' ? null : 'edit')}
                    title="Edit current image"
                  >
                    <span className="mst-char-action-icon">🎨</span>
                    <span className="mst-char-action-label">Edit</span>
                    <span className="mst-action-cost">⚡ 3</span>
                  </button>
                  <button
                    className={`mst-char-action-btn mst-char-action-btn--inaction ${charAction === 'in-action' ? 'active' : ''}`}
                    onClick={() => setCharAction(a => a === 'in-action' ? null : 'in-action')}
                    title="Place character in an alive scene"
                  >
                    <span className="mst-char-action-icon">🎬</span>
                    <span className="mst-char-action-label">In Action</span>
                    <span className="mst-action-cost">⚡ {inActionCost}</span>
                  </button>
                  <button
                    className={`mst-char-action-btn ${charAction === 'skins' ? 'active' : ''}`}
                    onClick={() => setCharAction(a => a === 'skins' ? null : 'skins')}
                    title="Browse saved skins for this character"
                  >
                    <span className="mst-char-action-icon">🖼</span>
                    <span className="mst-char-action-label">Skins</span>
                    <span className="mst-action-cost mst-action-cost--free">FREE</span>
                  </button>
                  <button
                    className={`mst-char-action-btn mst-char-action-btn--expand ${charAction === 'gen-expand' ? 'active' : ''}`}
                    onClick={() => setCharAction(a => a === 'gen-expand' ? null : 'gen-expand')}
                    title="Generative expand — resize the bounding box then generate"
                  >
                    <span className="mst-char-action-icon">⤢</span>
                    <span className="mst-char-action-label">Expand</span>
                    <span className="mst-action-cost mst-action-cost--expand">⚡ 3</span>
                  </button>
                </>)
              })()}
              {!activeCharMeta && !polyLayers[activeId] && (
                <button
                  className={`mst-char-action-btn ${charAction === 'ai-edit' ? 'active' : ''}`}
                  onClick={() => setCharAction(a => a === 'ai-edit' ? null : 'ai-edit')}
                  title="AI edit this layer"
                >
                  <span className="mst-char-action-icon">✦</span>
                  <span className="mst-char-action-label">AI Edit</span>
                  <span className="mst-action-cost">⚡ 3</span>
                </button>
              )}
              {polyLayers[activeId] && (
                <button
                  className="mst-char-action-btn"
                  onClick={() => rasterizePolygon(activeId)}
                  title="Rasterize polygon to pixels"
                >
                  <span className="mst-char-action-icon">⬛</span>
                  <span className="mst-char-action-label">Rasterize</span>
                </button>
              )}
            </div>

            {charAction === 'reskin' && (
              <div className="mst-char-action-panel">
                <div className="mst-char-action-panel-hint">Describe new outfit / style. Template pose is preserved.</div>
                <textarea
                  className="mst-reskin-textarea"
                  placeholder={`e.g. "red hoodie, spiky blue hair"`}
                  value={reskinPrompt}
                  onChange={e => { setReskinPrompt(e.target.value); reskinPromptRef.current = e.target.value }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doReskin() } }}
                  disabled={busy}
                  autoFocus
                />
                <button className="mst-reskin-btn" onClick={doReskin} disabled={!reskinPrompt.trim() || busy}>
                  {busy ? '⟳ Generating…' : <span>Generate <span className="mst-reskin-btn-cost">· ⚡ 3</span></span>}
                </button>
              </div>
            )}

            {charAction === 'edit' && (
              <div className="mst-char-action-panel">
                <div className="mst-char-action-panel-hint">Edits the current canvas pixels directly.</div>
                <textarea
                  className="mst-reskin-textarea"
                  placeholder={`e.g. "add sunglasses, change hair to purple"`}
                  value={editPrompt}
                  onChange={e => { setEditPrompt(e.target.value); editPromptRef.current = e.target.value }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doEdit() } }}
                  disabled={busy}
                  autoFocus
                />
                <button className="mst-reskin-btn" onClick={doEdit} disabled={!editPrompt.trim() || busy}>
                  {busy ? '⟳ Generating…' : <span>Apply Edit <span className="mst-reskin-btn-cost">· ⚡ 3</span></span>}
                </button>
              </div>
            )}

            {charAction === 'in-action' && (
              <div className="mst-char-action-panel mst-char-action-panel--inaction">
                {/* Sub-mode tabs */}
                <div className="mst-inaction-tabs">
                  <button className={`mst-inaction-tab ${inActionSubMode === 'scene' ? 'active' : ''}`}
                    onClick={() => { setInActionSubMode('scene'); inActionSubModeRef.current = 'scene' }}>New Scene</button>
                  {inActionHasSnapshot[activeId] && (
                    <button className={`mst-inaction-tab ${inActionSubMode === 'modify' ? 'active' : ''}`}
                      onClick={() => { setInActionSubMode('modify'); inActionSubModeRef.current = 'modify' }}>Modify</button>
                  )}
                </div>

                {inActionSubMode === 'scene' && (<>
                  {/* Pending batch picker */}
                  {inActionPendingBatch[activeId]?.length > 0 ? (<>
                    {hoveredInActionUrl && (
                      <img src={hoveredInActionUrl} className="mst-inaction-hover-preview" alt="Preview" />
                    )}
                    <div className="mst-char-action-panel-hint">Pick a result:</div>
                    <div className="mst-inaction-picker-row">
                      {inActionPendingBatch[activeId].map((url, i) => (
                        <button key={i} className="mst-inaction-pick-btn"
                          onMouseEnter={async () => {
                            const c = offscreen.current[activeId]; if (!c) return
                            if (!hoverPreSnapshotRef.current) {
                              hoverPreSnapshotRef.current = makeCanvas(c.width, c.height)
                              hoverPreSnapshotRef.current.getContext('2d')!.drawImage(c, 0, 0)
                            }
                            setHoveredInActionUrl(url)
                            const img2 = await loadImage(url)
                            c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
                            c.getContext('2d')!.drawImage(img2, 0, 0, c.width, c.height)
                            composite()
                          }}
                          onMouseLeave={() => {
                            setHoveredInActionUrl(null)
                            const pre = hoverPreSnapshotRef.current; hoverPreSnapshotRef.current = null
                            const c = offscreen.current[activeId]
                            if (pre && c) {
                              c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
                              c.getContext('2d')!.drawImage(pre, 0, 0)
                              composite()
                            }
                          }}
                          onClick={() => { hoverPreSnapshotRef.current = null; setHoveredInActionUrl(null); void commitInActionResult(url, activeId) }}>
                          <img src={url} className="mst-inaction-pick-thumb" alt={`Option ${i+1}`} />
                        </button>
                      ))}
                    </div>
                    <button className="mst-wand-btn mst-wand-btn--clear" style={{ marginTop: 4 }}
                      onClick={() => {
                        const b = { ...inActionPendingBatchRef.current }; delete b[activeId]
                        inActionPendingBatchRef.current = b; setInActionPendingBatch(b)
                      }}>✕ Discard</button>
                  </>) : (<>
                    <div className="mst-char-action-panel-hint">Describe a situation. The character will be placed into it.</div>
                    {/* Scene depth level */}
                    <div className="mst-inaction-levels">
                      {([
                        { lvl: 1 as const, label: '□ PROP',    gif: '/assets/prop.gif',    desc: 'Just adds a prop to the character' },
                        { lvl: 2 as const, label: '⊞ CONTEXT', gif: '/assets/context.gif', desc: 'Extended surroundings without background' },
                        { lvl: 3 as const, label: '▣ SCENE',   gif: '/assets/scene.gif',   desc: 'Full scene with background' },
                      ]).map(({ lvl, label, gif, desc }) => (
                        <button key={lvl}
                          className={`mst-inaction-level ${inActionLevel === lvl ? 'active' : ''}`}
                          onClick={() => { setInActionLevel(lvl); inActionLevelRef.current = lvl }}
                          onMouseEnter={e => setLevelTooltip({ gif, desc, x: e.clientX, y: e.clientY })}
                          onMouseMove={e => setLevelTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                          onMouseLeave={() => setLevelTooltip(null)}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {/* Generation count */}
                    <div className="mst-inaction-count-row">
                      <span className="mst-label" style={{ fontSize: 8, color: '#555' }}>Generate</span>
                      {([1, 2, 3] as const).map(n => (
                        <button key={n}
                          className={`mst-inaction-count-btn ${inActionCount === n ? 'active' : ''}`}
                          onClick={() => { setInActionCount(n); inActionCountRef.current = n }}
                          title={`Generate ${n} option${n > 1 ? 's' : ''} to pick from`}>{n}</button>
                      ))}
                    </div>
                    <textarea
                      className="mst-reskin-textarea"
                      placeholder={`e.g. "arguing with a judge in a courtroom"`}
                      value={inActionPrompt}
                      onChange={e => { setInActionPrompt(e.target.value); inActionPromptRef.current = e.target.value }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doInAction() } }}
                      disabled={busy}
                      autoFocus
                    />
                    {(() => {
                      const cost = inActionCount === 1 ? 3 : inActionCount === 2 ? 5 : 8
                      return (
                      <div className="mst-inaction-btn-row">
                        <button className="mst-reskin-btn mst-reskin-btn--inaction" onClick={doInAction}
                          disabled={!inActionPrompt.trim() || busy}>
                          {busy ? '⟳ Generating…' : <span>Generate <span className="mst-reskin-btn-cost">· ⚡ {cost}</span></span>}
                        </button>
                        {inActionHasSnapshot[activeId] && (
                          <button className="mst-reskin-btn mst-reskin-btn--inaction mst-inaction-regen"
                            onClick={doInActionRegenerate}
                            disabled={!inActionPrompt.trim() || busy}
                            title="Re-generate using base character (not the current scene)">
                            {busy ? '⟳' : <span>↺ Re-gen <span className="mst-reskin-btn-cost">⚡ {cost}</span></span>}
                          </button>
                        )}
                      </div>
                      )
                    })()}
                    {(inActionPrevImages[activeId]?.length ?? 0) > 0 && (
                      <button className="mst-wand-btn mst-wand-btn--clear" style={{ marginTop: 4 }}
                        onClick={doInActionGoBack}
                        title={`Go back (${inActionPrevImages[activeId].length} step${inActionPrevImages[activeId].length > 1 ? 's' : ''} available)`}>
                        ← Undo ({inActionPrevImages[activeId].length})
                      </button>
                    )}
                  </>)}
                </>)}

                {inActionSubMode === 'modify' && inActionHasSnapshot[activeId] && (<>
                  <div className="mst-char-action-panel-hint">Describe changes to apply to the current scene.</div>
                  <textarea
                    className="mst-reskin-textarea"
                    placeholder={`e.g. "add rain outside the window"`}
                    value={inActionPrompt}
                    onChange={e => { setInActionPrompt(e.target.value); inActionPromptRef.current = e.target.value }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doInActionModify() } }}
                    disabled={busy}
                    autoFocus
                  />
                  <button className="mst-reskin-btn mst-reskin-btn--inaction" onClick={doInActionModify}
                    disabled={!inActionPrompt.trim() || busy}>
                    {busy ? '⟳ Modifying…' : <span>Modify Scene <span className="mst-reskin-btn-cost">· ⚡ 3</span></span>}
                  </button>
                  {(inActionPrevImages[activeId]?.length ?? 0) > 0 && (
                    <button className="mst-wand-btn mst-wand-btn--clear" style={{ marginTop: 4 }}
                      onClick={doInActionGoBack}>
                      ← Undo ({inActionPrevImages[activeId].length})
                    </button>
                  )}
                </>)}
              </div>
            )}

            {charAction === 'ai-edit' && (
              <div className="mst-char-action-panel">
                <div className="mst-char-action-panel-hint">Describe any visual change to apply to this layer.</div>
                <textarea
                  className="mst-reskin-textarea"
                  placeholder={`e.g. "make it glow neon blue" or "add heavy rain"`}
                  value={artAiPrompt}
                  onChange={e => { setArtAiPrompt(e.target.value); artAiPromptRef.current = e.target.value }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doArtAi() } }}
                  disabled={busy}
                  autoFocus
                />
                <button className="mst-reskin-btn" onClick={doArtAi} disabled={!artAiPrompt.trim() || busy}>
                  {busy ? '⟳ Generating…' : <span>Apply <span className="mst-reskin-btn-cost">· ⚡ 3</span></span>}
                </button>
              </div>
            )}

            {charAction === 'skins' && (
              <div className="mst-char-action-panel mst-char-action-panel--skins">
                <input
                  className="mst-skin-search"
                  type="text"
                  placeholder="Search prompts…"
                  value={skinSearch}
                  onChange={e => {
                    const v = e.target.value
                    setSkinSearch(v)
                    if (skinSearchTimer.current) clearTimeout(skinSearchTimer.current)
                    skinSearchTimer.current = setTimeout(() => {
                      const meta = activeId ? charLayersRef.current[activeId] : null
                      if (meta) { setSkinsOffset(0); setSkins([]); void loadSkins(meta.charKey, v, 0) }
                    }, 300)
                  }}
                />
                {skinsLoading && skins.length === 0 && (
                  <div className="mst-skin-loading">Loading…</div>
                )}
                {!skinsLoading && skins.length === 0 && (
                  <div className="mst-skin-loading">No skins yet — generate a RE-SKIN, EDIT, or IN ACTION to populate this library.</div>
                )}
                <div className="mst-skin-grid">
                  {skins.map(skin => (
                    <button key={skin.id} className="mst-skin-card" onClick={() => { void applySkin(skin) }} title={skin.prompt}>
                      <img src={skinImageUrl(skin.id)} className="mst-skin-thumb" alt={skin.prompt} loading="lazy" />
                      <span className="mst-skin-type">{skin.skin_type.replace('inaction_', '')}</span>
                    </button>
                  ))}
                </div>
                {skinsHasMore && (
                  <button className="mst-wand-btn" style={{ marginTop: 4 }} disabled={skinsLoading}
                    onClick={() => {
                      const meta = activeId ? charLayersRef.current[activeId] : null
                      if (meta) void loadSkins(meta.charKey, skinSearch, skinsOffset)
                    }}>
                    {skinsLoading ? '⟳ Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            )}

            {charAction === 'gen-expand' && (() => {
              const bbox = activeId ? bboxes[activeId] : null
              if (!bbox) return null
              const eo = expandOffsets
              const total = eo.top + eo.right + eo.bottom + eo.left
              const MIN_EXPAND = 80  // px — below this Gemini has too little room
              const tooSmall = total > 0 && Math.max(eo.top, eo.right, eo.bottom, eo.left) < MIN_EXPAND
              return (
                <div className="mst-char-action-panel mst-char-action-panel--expand">
                  <p className="mst-expand-hint">Drag the handles to grow the canvas around the image, then generate.</p>
                  <div className="mst-expand-stats">
                    {['top','right','bottom','left'].map(s => (
                      <span key={s} className="mst-expand-stat">
                        {s[0].toUpperCase()}: <b>{Math.round((eo as any)[s])}px</b>
                      </span>
                    ))}
                  </div>
                  {tooSmall && (
                    <p className="mst-expand-hint" style={{ color: '#f0a020', marginTop: 4 }}>
                      Expand at least 80px on one side for better results.
                    </p>
                  )}
                  <button
                    className="mst-wand-btn"
                    disabled={total === 0 || tooSmall || loadingLayerIds.has(activeId)}
                    onClick={() => void doGenExpand()}
                  >
                    {loadingLayerIds.has(activeId) ? '⟳ Generating…' : '⤢ Generate Expand'}
                  </button>
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── Text input overlay ── */}
      {textInput && (textInput.w ? (
        <div
          className="mst-text-box-frame"
          style={{
            left: textInput.screenX, top: textInput.screenY,
            width: textInput.screenW,
            transform: textInput.screenRotation ? `rotate(${textInput.screenRotation}rad)` : undefined,
          }}
        >
          <textarea
            ref={el => { textAreaFrameRef.current = el; if (el) autoResizeTextArea(el) }}
            className="mst-text-input mst-text-input--area mst-text-input--framed"
            rows={1}
            style={{
              width: '100%',
              fontFamily: textInput.editingLayerId ? textLayers[textInput.editingLayerId]?.fontFamily ?? fontFamily : fontFamily,
              fontSize: textInput.screenFontSize ?? Math.max(10, fontSize * zoom),
              textAlign: textInput.textAlign ?? 'left',
              color: textInput.editingLayerId ? (textLayers[textInput.editingLayerId]?.color ?? color) : color,
              caretColor: textInput.editingLayerId ? (textLayers[textInput.editingLayerId]?.color ?? color) : color,
            }}
            value={textInput.value}
            onChange={e => {
              setTextInput(prev => prev ? { ...prev, value: e.target.value } : null)
              autoResizeTextArea(e.currentTarget)
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); cancelTextEdit(); return }
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.ctrlKey) {
                  const ta = e.currentTarget
                  const start = ta.selectionStart ?? ta.value.length
                  const end   = ta.selectionEnd   ?? ta.value.length
                  const next  = ta.value.slice(0, start) + '\n' + ta.value.slice(end)
                  setTextInput(prev => prev ? { ...prev, value: next } : null)
                  requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; autoResizeTextArea(ta) })
                } else {
                  commitText()
                }
              }
            }}
            onBlur={commitText}
            placeholder="Type here…"
            autoFocus
          />
          {(['tl','tr','bl','br','mt','mb','ml','mr'] as const).map(h => (
            <div key={h}
              className={`mst-tb-handle mst-tb-handle--${h}`}
              onMouseDown={e => { if (h === 'ml' || h === 'mr') startTextResize(e, h === 'mr' ? 'r' : 'l') }}
            />
          ))}
        </div>
      ) : (
        <input
          ref={textInputRef}
          className="mst-text-input"
          style={{
            left: textInput.screenX, top: textInput.screenY,
            fontFamily,
            fontSize: textInput.screenFontSize ?? Math.max(10, fontSize * zoom),
          }}
          value={textInput.value}
          onChange={e => setTextInput(prev => prev ? { ...prev, value: e.target.value } : null)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitText() }
            if (e.key === 'Escape') cancelTextEdit()
          }}
          onBlur={commitText}
          placeholder="Type here…"
          autoFocus
        />
      ))}

    </div>

    {showKeyModal && (
      <GeminiKeyModal
        onClose={() => setShowKeyModal(false)}
        onChanged={() => setOwnKeyActive(hasUserGeminiKey())}
      />
    )}


    {showBuyModal && (
      <BuyCreditsModal
        wallet={address}
        currentBalance={showBuyModal.balance ?? 0}
        requiredCredits={showBuyModal.required}
        onClose={() => setShowBuyModal(null)}
        onPurchased={_newBal => { creditBalanceRefreshRef.current?.(); window.dispatchEvent(new CustomEvent('vvc:credits-changed')) }}
      />
    )}

    {/* ── Publish celebration modal ── */}
    {publishedMemeId && (

      <div className="mst-pub-overlay" onClick={e => {
        if (e.target === e.currentTarget && pubShareStage !== 'posting') {
          setPublishedMemeId(null); setPubShareStage(null)
        }
      }}>
        {Array.from({ length: 28 }).map((_, i) => (
          <span key={i} className="mst-confetti" style={{
            '--x': `${Math.random() * 100}vw`,
            '--delay': `${(Math.random() * 0.8).toFixed(2)}s`,
            '--duration': `${(0.9 + Math.random() * 0.8).toFixed(2)}s`,
            '--color': ['#ff4d4d','#ffd700','#4dff91','#4dc8ff','#ff4dce','#fff'][Math.floor(Math.random() * 6)],
            '--rot': `${Math.floor(Math.random() * 360)}deg`,
          } as React.CSSProperties} />
        ))}
        <div className="mst-pub-card">
          {pubShareStage !== 'posting' && (
            <button className="mst-pub-close" onClick={() => { setPublishedMemeId(null); setPubShareStage(null) }}>×</button>
          )}
          <div className="mst-pub-label">Meme Published!</div>
          <div className="mst-pub-img-wrap">
            <img src={`/handmade/${publishedMemeId}/image`} alt="Published meme" className="mst-pub-img" />
          </div>
          <div className="mst-pub-id">#{publishedMemeId.slice(0, 8)}</div>

          {/* ── X share flow ── */}
          {pubShareStage === null && (
            <div className="mst-pub-actions">
              <button className="mst-pub-share-btn" onClick={handlePubShareClick}>𝕏 Share</button>
              <button className="mst-pub-done" onClick={() => { const id = publishedMemeId!; setPublishedMemeId(null); setPubShareStage(null); onPublished?.(id) }}>Nice 🔥</button>
            </div>
          )}

          {pubShareStage === 'compose' && (
            <div className="mst-pub-compose">
              <div className="mst-pub-compose-header">
                <div className="mst-pub-compose-avatar">{pubXHandle?.[0]?.toUpperCase() ?? '𝕏'}</div>
                <span className="mst-pub-compose-handle">@{pubXHandle}</span>
              </div>
              <textarea
                className="mst-pub-compose-textarea"
                value={pubTweetText}
                onChange={e => setPubTweetText(e.target.value.slice(0, 280))}
                autoFocus
              />
              <label className="mst-pub-compose-community">
                <input
                  type="checkbox"
                  checked={pubShareInCommunity}
                  onChange={e => setPubShareInCommunity(e.target.checked)}
                />
                Share in community
              </label>
              <div className="mst-pub-compose-footer">
                <span className={`mst-pub-compose-counter${pubTweetText.length > 260 ? ' mst-pub-compose-counter--warn' : ''}`}>
                  {280 - pubTweetText.length}
                </span>
                <button
                  className="mst-pub-compose-post"
                  onClick={handlePubPost}
                  disabled={!pubTweetText.trim()}
                >Post</button>
              </div>
            </div>
          )}

          {pubShareStage === 'posting' && (
            <p className="mst-pub-posting">Uploading & posting to 𝕏…</p>
          )}

          {pubShareStage === 'done' && (
            <div className="mst-pub-actions">
              {pubTweetUrl && (
                <a className="mst-pub-view-tweet" href={pubTweetUrl} target="_blank" rel="noopener noreferrer">
                  View on 𝕏 ↗
                </a>
              )}
              <button className="mst-pub-done" onClick={() => { const id = publishedMemeId!; setPublishedMemeId(null); setPubShareStage(null); onPublished?.(id) }}>Nice 🔥</button>
            </div>
          )}
        </div>
      </div>
    )}
    <>
      {levelTooltip && createPortal(
        <div className="mst-level-tooltip" style={{ left: levelTooltip.x + 16, top: levelTooltip.y - 16 }}>
          <img src={levelTooltip.gif} alt="" />
          <div className="mst-level-tooltip-desc">{levelTooltip.desc}</div>
        </div>,
        document.body
      )}
    </>
    </>
  )
}
