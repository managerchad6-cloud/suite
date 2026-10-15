#!/usr/bin/env node
// remove-bg.mjs — Strip backgrounds from character images.
//
// Pipeline (mirrors pfp.ts):
//   1. Gemini (nano-banana-pro-preview) repaints background → solid magenta #FF00FF
//   2. Magenta chroma-key → transparent PNG  (same algorithm as removeBackground())
//   3. File saved/replaced as .png; characterLore.ts ext fields updated automatically
//
// Usage (run from Meme Factory UI/suite/):
//   node remove-bg.mjs              — cast/ images only
//   node remove-bg.mjs --chars      — also process chars/ (skips _template files)
//   node remove-bg.mjs --dry-run    — show what would happen, no writes or API calls

import sharp from 'sharp'
import fs    from 'node:fs'
import path  from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_KEY  = process.env.GEMINI_API_KEY
const MODEL    = 'nano-banana-pro-preview'
const DELAY_MS = 2000   // pause between Gemini calls to stay within rate limits

const ARGS     = process.argv.slice(2)
const DRY_RUN  = ARGS.includes('--dry-run')
const DO_CHARS = ARGS.includes('--chars')

const ASSETS   = path.join(__dirname, 'public', 'assets')
const CAST_DIR = path.join(ASSETS, 'cast')
const CHAR_DIR = path.join(ASSETS, 'chars')
const LORE_TS  = path.join(__dirname, 'src', 'data', 'characterLore.ts')

// ── Gemini: repaint background → magenta ──────────────────────────────────────

async function toMagentaBg(imgBuf, mimeType) {
  const base64 = imgBuf.toString('base64')
  const body = JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: mimeType, data: base64 } },
      { text: [
        'Repaint this image so that ALL background / empty-space areas are solid magenta: exactly #FF00FF, RGB (255, 0, 255). No other colour may be used for the background.',
        'Background definition: white, off-white, or any plain area that is NOT the character themselves — the void around and behind the character.',
        'Keep the character COMPLETELY UNCHANGED: same colours, black outlines, pose, proportions, art style. Modify nothing about the character.',
        'Output is the same image but every background pixel replaced with #FF00FF.',
      ].join(' ') },
    ]}],
    generationConfig: { responseModalities: ['image', 'text'] },
  })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`)
  }

  const json  = await res.json()
  const parts = json.candidates?.[0]?.content?.parts ?? []
  const img   = parts.find(p => {
    const d = p.inlineData ?? p.inline_data
    return d?.mimeType?.startsWith('image/') || d?.mime_type?.startsWith('image/')
  })
  if (!img) throw new Error(`No image in Gemini response. Parts: ${JSON.stringify(parts).slice(0, 200)}`)

  const d = img.inlineData ?? img.inline_data
  return Buffer.from(d.data, 'base64')
}

// ── Magenta chroma-key (exact port of pfp.ts removeBackground) ────────────────

const MAX_DIST_SQ = 3 * 255 * 255
const INNER_SQ    = 0.0081 * MAX_DIST_SQ
const OUTER_SQ    = 0.0484 * MAX_DIST_SQ
const INNER       = Math.sqrt(INNER_SQ)
const RANGE       = Math.sqrt(OUTER_SQ) - INNER

async function chromaKey(imgBuf) {
  const { data, info } = await sharp(imgBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const d      = new Uint8ClampedArray(data)
  const alphaF = new Float32Array(width * height)

  // Pass 1: alpha keying + magenta despill
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const dSq = (r - 255) ** 2 + g * g + (b - 255) ** 2

    let alpha
    if      (dSq <= INNER_SQ) alpha = 0
    else if (dSq >= OUTER_SQ) alpha = 1
    else { const dist = Math.sqrt(dSq); alpha = (dist - INNER) / RANGE }

    if (alpha < 1) {
      const spill = (1 - alpha) * 255
      d[i]     = Math.max(0, r - spill)
      d[i + 2] = Math.max(0, b - spill)
    }
    alphaF[i >> 2] = alpha
    d[i + 3]       = Math.round(alpha * 255)
  }

  // Pass 2: alpha erosion — remove 1px halo ring
  const eA = new Float32Array(alphaF)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (alphaF[idx] === 0) continue
      eA[idx] = Math.min(
        alphaF[idx], alphaF[idx - 1], alphaF[idx + 1],
        alphaF[idx - width], alphaF[idx + width],
      )
    }
  }

  // Pass 3: despill hard-edge boundary pixels
  for (let i = 0; i < d.length; i += 4) {
    const pi = i >> 2
    if (alphaF[pi] < 1 || eA[pi] > 0.999) continue
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const c = Math.max(0, Math.min(r, b) - g)
    if (c < 8) continue
    d[i]     = Math.max(0, r - c)
    d[i + 2] = Math.max(0, b - c)
  }

  // Write eroded alpha back
  for (let i = 0; i < d.length; i += 4) d[i + 3] = Math.round(eA[i >> 2] * 255)

  // Pass 4: 1px black inner stroke (covers residual edge spill; VVC art has black outlines)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4
      if (d[i + 3] === 0) continue
      if (
        d[i - 1]              < 50 ||  // left alpha
        d[i + 7]              < 50 ||  // right alpha
        d[i - width * 4 + 3] < 50 ||  // up alpha
        d[i + width * 4 + 3] < 50      // down alpha
      ) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0
      }
    }
  }

  return sharp(Buffer.from(d.buffer), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isAlreadyTransparent(imgPath) {
  try {
    const meta = await sharp(imgPath).metadata()
    if (!meta.hasAlpha) return false
    const { data } = await sharp(imgPath).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true })
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 248) return true
    }
    return false
  } catch { return false }
}

function mimeFor(ext) {
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' }[ext.toLowerCase()] ?? 'image/png'
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Process one file ──────────────────────────────────────────────────────────

// Returns the output path (always .png), or null if skipped
async function processImage(imgPath) {
  const ext     = path.extname(imgPath).slice(1).toLowerCase()
  const outPath = imgPath.replace(/\.(jpe?g|webp|png)$/i, '.png')
  const label   = path.basename(imgPath)

  if (await isAlreadyTransparent(imgPath)) {
    console.log(`  skip  ${label}  (already transparent)`)
    return null
  }

  console.log(`  proc  ${label} …`)
  if (DRY_RUN) return outPath

  const imgBuf     = fs.readFileSync(imgPath)
  const magentaBuf = await toMagentaBg(imgBuf, mimeFor(ext))
  const pngBuf     = await chromaKey(magentaBuf)

  fs.writeFileSync(outPath, pngBuf)
  if (outPath !== imgPath) {
    fs.unlinkSync(imgPath)
    console.log(`        ${path.basename(imgPath)} → ${path.basename(outPath)}`)
  }

  return outPath
}

// ── Patch characterLore.ts ext fields ────────────────────────────────────────

function patchLore(conversions) {
  // conversions: Map<stem, oldExt> for files that changed extension to .png
  if (conversions.size === 0) return
  let src = fs.readFileSync(LORE_TS, 'utf8')
  let changed = 0
  for (const [stem, oldExt] of conversions) {
    // Match: file: 'stem', ext: 'oldExt'  OR  file: 'stem', ext: "oldExt"
    const re = new RegExp(
      `(file:\\s*'${stem}',[^}\\n]*?ext:\\s*)'${oldExt}'`,
      'g'
    )
    const re2 = new RegExp(
      `(file:\\s*"${stem}",[^}\\n]*?ext:\\s*)"${oldExt}"`,
      'g'
    )
    // Also handle ext on the same property line but possibly after a comma gap
    const re3 = new RegExp(
      `(key:[^,]+,\\s*name:[^,]+,\\s*file:\\s*'${stem}'(?:,\\s*ext:\\s*)'${oldExt}')`,
      'g'
    )
    // Simpler: just find ext: 'oldExt' near file: 'stem'
    // Use a multiline approach: find the block containing file: 'stem' and replace its ext
    const blockRe = new RegExp(
      `(file:\\s*['"]${stem}['"][^}\\n]*?ext:\\s*)['"]${oldExt}['"]`,
      'g'
    )
    const before = src
    src = src.replace(blockRe, `$1'png'`)
    if (src !== before) changed++
  }
  if (changed > 0 && !DRY_RUN) {
    fs.writeFileSync(LORE_TS, src, 'utf8')
    console.log(`\n  patched characterLore.ts — ${changed} ext field(s) updated to 'png'`)
  } else if (changed > 0) {
    console.log(`\n  [dry-run] would patch ${changed} ext field(s) in characterLore.ts`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function collectImages(dir) {
  return fs.readdirSync(dir)
    .filter(f => /\.(png|jpe?g|webp)$/i.test(f) && !f.includes('_template'))
    .sort()
    .map(f => path.join(dir, f))
}

const targets = [
  ...collectImages(CAST_DIR),
  ...(DO_CHARS ? collectImages(CHAR_DIR) : []),
]

console.log(`\n── Background remover ─────────────────────────────────────────`)
console.log(`   Model : ${MODEL}`)
console.log(`   Images: ${targets.length} (cast: ${collectImages(CAST_DIR).length}${DO_CHARS ? `, chars: ${collectImages(CHAR_DIR).length}` : ''})`)
if (DRY_RUN) console.log('   Mode  : DRY RUN — no files written, no API calls\n')
else         console.log('   Mode  : LIVE\n')

const conversions = new Map()  // stem → oldExt (for lore patching)
let processed = 0, skipped = 0, errors = 0

for (let idx = 0; idx < targets.length; idx++) {
  const imgPath = targets[idx]
  try {
    const outPath = await processImage(imgPath)
    if (outPath === null) {
      skipped++
    } else {
      processed++
      const oldExt  = path.extname(imgPath).slice(1).toLowerCase()
      const stem    = path.basename(imgPath, path.extname(imgPath))
      if (oldExt !== 'png') conversions.set(stem, oldExt)
    }
  } catch (e) {
    console.error(`  ERROR ${path.basename(imgPath)}: ${e.message}`)
    errors++
  }

  // Rate-limit pause between Gemini calls (skip on last item or if skipped)
  if (!DRY_RUN && idx < targets.length - 1) await sleep(DELAY_MS)
}

patchLore(conversions)

console.log(`\n── Done ────────────────────────────────────────────────────────`)
console.log(`   Processed : ${processed}`)
console.log(`   Skipped   : ${skipped} (already transparent)`)
console.log(`   Errors    : ${errors}`)
