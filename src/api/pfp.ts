const VVC_API_KEY = ''
const MODEL       = 'nano-banana-pro-preview'

const GEMINI_KEY_STORAGE = 'vvc_gemini_key'

export function getUserGeminiKey(): string | null {
  return localStorage.getItem(GEMINI_KEY_STORAGE)
}
export function setUserGeminiKey(key: string) {
  localStorage.setItem(GEMINI_KEY_STORAGE, key.trim())
}
export function clearUserGeminiKey() {
  localStorage.removeItem(GEMINI_KEY_STORAGE)
}
export function hasUserGeminiKey(): boolean {
  const k = localStorage.getItem(GEMINI_KEY_STORAGE)
  return !!k && k.length > 0
}

function getActiveKey(): string {
  return getUserGeminiKey() ?? VVC_API_KEY
}

export const LEGENDARY_CHARS = new Set(['gad', 'zad', 'bad', 'gizzard', 'wizard', 'grandwizard', 'wraith'])

export const CHAR_TEMPLATE: Record<string, string> = {
  gigachad:    'gigachad_template',
  chad:        'chad_template',
  thad:        'thad_template',
  lad:         'lad_template',
  brad:        'brad_template',
  cad:         'cad_template',
  boomer:      'boomer_template',
  basic:       'basic_template',
  neckbeard:   'neckbeard_template',
  incel:       'incel_template',
  coomer:      'coomer_template',
  shlad:       'shlad_template',
  lshad:       'lshad_template',
  wizard:      'wizard_template',
  grandwizard: 'grandwizard_template',
  wraith:      'wraith_template',
  virgin:      'virgin_template',
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

// ─── Background removal ───────────────────────────────────────────────────────
//
// Chroma-key pipeline for magenta (#FF00FF) backgrounds.
// Three-stage process:
//   1. Alpha keying   — distance from magenta in RGB space → alpha 0–1
//   2. Colour despill — subtract magenta contamination from edge pixel colours
//   3. Alpha erosion  — shrink the alpha boundary by 1px to remove halo ring
//
// Magenta (R:255 G:0 B:255) is chosen because:
//   • VVC meme art never uses it (palette is skin tones, white, black, desaturated primaries)
//   • G=0 is a strong discriminant — almost all character colours have G > 30
//   • Maximum distance from typical skin tones and character art in RGB space

const MAGENTA_BG_INSTRUCTION = [
  'BACKGROUND: All empty space — sky, void, air, any area where there is no character, prop, or physical surface — must be filled with solid magenta: exactly #FF00FF, RGB (255, 0, 255). Zero deviation.',
  'IMPORTANT — what counts as empty space: the area BEHIND everything. If the character is standing in a room, the wall behind them is empty space (magenta). If outdoors, the sky is empty space (magenta).',
  'IMPORTANT — what does NOT count as empty space: the ground, floor, or surface the character stands on; any prop; the character themselves. These must use natural, realistic colours appropriate to the scene.',
  'In short: character and physical surfaces use real colours. The backdrop void behind everything is #FF00FF. Never use magenta or pink for floors, ground, walls, or objects.',
].join('\n')

// Squared thresholds — compare dist² to avoid sqrt in the hot loop.
// Inner (fully transparent): dist normalised < 0.09  → dist² < 0.0081 × 195075 ≈ 1580
// Outer (fully opaque):      dist normalised > 0.22  → dist² > 0.0484 × 195075 ≈ 9442
const MAX_DIST_SQ = 3 * 255 * 255   // 195 075
const INNER_SQ    = 0.0081 * MAX_DIST_SQ  // ~1581
const OUTER_SQ    = 0.0484 * MAX_DIST_SQ  // ~9442
const INNER       = Math.sqrt(INNER_SQ)
const RANGE       = Math.sqrt(OUTER_SQ) - INNER

export async function removeBackground(blobUrl: string): Promise<string> {
  // Load image as bitmap
  const blob   = await fetch(blobUrl).then(r => r.blob())
  const bitmap = await createImageBitmap(blob)

  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const ctx    = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const imageData = ctx.getImageData(0, 0, width, height)
  const d         = imageData.data  // Uint8ClampedArray, RGBA

  // ── Pass 1: Alpha keying + despill ────────────────────────────────────
  // Pre-compute alpha into a Float32 array (needed for the erosion pass).
  const alphaF = new Float32Array(width * height)

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]

    // Squared distance from magenta (255, 0, 255)
    const dSq = (r - 255) ** 2 + g * g + (b - 255) ** 2

    let alpha: number
    if (dSq <= INNER_SQ) {
      alpha = 0
    } else if (dSq >= OUTER_SQ) {
      alpha = 1
    } else {
      // Soft edge zone: linear interpolation on the non-squared distance
      const dist = Math.sqrt(dSq)
      alpha = (dist - INNER) / RANGE
    }

    // Despill: recover the true foreground colour at the edge.
    // Observed = α × foreground + (1-α) × magenta(255,0,255)
    // → foreground_R ≈ observed_R − (1-α) × 255  (clamped)
    // → foreground_G unchanged (magenta G=0, no G contamination)
    // → foreground_B ≈ observed_B − (1-α) × 255  (clamped)
    if (alpha < 1) {
      const spill = (1 - alpha) * 255
      d[i]     = Math.max(0, r - spill)   // R
      // d[i+1] = g                        // G — untouched
      d[i + 2] = Math.max(0, b - spill)   // B
    }

    alphaF[i >> 2] = alpha
    d[i + 3] = Math.round(alpha * 255)
  }

  // ── Pass 2: Alpha erosion (remove 1-pixel halo ring) ──────────────────
  // For each pixel: α_eroded = min(α, min of 4 cardinal neighbours).
  // This shrinks the transparency boundary inward by 1px, eliminating the
  // last fringe of blended background-colour pixels at the character edge.
  // Only pixels adjacent to transparent area are affected.
  const erodedAlpha = new Float32Array(alphaF)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const a   = alphaF[idx]
      if (a === 0) continue
      const minNeighbour = Math.min(
        alphaF[idx - 1],
        alphaF[idx + 1],
        alphaF[idx - width],
        alphaF[idx + width],
      )
      erodedAlpha[idx] = Math.min(a, minNeighbour)
    }
  }

  // ── Pass 3: Colour despill for hard-edge boundary pixels ──────────────────
  // Only targets pixels that were fully opaque in the key (alphaF === 1) but
  // became boundary pixels after erosion. These are missed by pass 1 because
  // their dist² was beyond OUTER_SQ (treated as solid), yet their colour still
  // contains magenta contamination from the original background edge.
  for (let i = 0; i < d.length; i += 4) {
    const pixIdx = i >> 2
    if (alphaF[pixIdx] < 1) continue        // skip soft-zone (already despilled)
    const eroded = erodedAlpha[pixIdx]
    if (eroded > 0.999) continue            // interior pixel

    const r = d[i], g = d[i + 1], b = d[i + 2]
    const contamination = Math.max(0, Math.min(r, b) - g)
    if (contamination < 8) continue

    const f = contamination / 255
    d[i]     = Math.max(0, r - contamination)
    d[i + 2] = Math.max(0, b - contamination)
    erodedAlpha[pixIdx] = Math.min(eroded, 1 - f)
  }

  // Write final alpha back into the pixel buffer
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = Math.round(erodedAlpha[i >> 2] * 255)
  }

  // ── Pass 4: 1px black inner stroke ────────────────────────────────────────
  // Paint the outermost visible ring of pixels black to cover any residual
  // colour spill at the keyed edge. VVC characters have black outlines so
  // this reinforces existing linework without visible change to interior art.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4
      if (d[i + 3] === 0) continue
      if (
        d[i - 1]              < 50 ||   // left pixel alpha
        d[i + 7]              < 50 ||   // right pixel alpha
        d[i - width * 4 + 3] < 50 ||   // up pixel alpha
        d[i + width * 4 + 3] < 50       // down pixel alpha
      ) {
        d[i]     = 0
        d[i + 1] = 0
        d[i + 2] = 0
      }
    }
  }

  // ── Export as transparent PNG ──────────────────────────────────────────
  ctx.putImageData(imageData, 0, 0)
  const outBlob = await canvas.convertToBlob({ type: 'image/png' })
  return URL.createObjectURL(outBlob)
}

// ─── Generative Expand (outpainting) ─────────────────────────────────────────
//
// Takes an existing image, composites it onto a larger colour-padded canvas,
// asks Gemini to fill the border with scene continuation, then composites the
// original back on top to guarantee the centre is pixel-perfect unchanged.
// The padding colour is chosen dynamically to be as far as possible from any
// colour that already exists in the original image, preventing Gemini from
// confusing padding with original scene content (e.g. a pink scene + magenta
// padding would be indistinguishable).

// Pick the padding colour that is furthest (min perceptual distance) from all
// opaque pixels in the bitmap. Tests a handful of vivid candidates that cover
// the colour wheel. Sampling every 20th pixel is fast and accurate enough.
async function selectPaddingColor(bitmap: ImageBitmap): Promise<[number, number, number]> {
  const c   = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = c.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)

  const candidates: [number, number, number][] = [
    [255,   0, 255],  // magenta
    [  0, 255, 255],  // cyan
    [255, 255,   0],  // yellow
    [  0, 255, 127],  // spring green
    [127,   0, 255],  // violet
    [255, 127,   0],  // amber  (less useful but adds coverage)
  ]

  let bestColor = candidates[0]
  let bestMinDist = -1

  for (const [cr, cg, cb] of candidates) {
    let minDist = Infinity
    for (let i = 0; i < data.length; i += 80) {   // sample every 20th pixel
      if (data[i + 3] < 128) continue              // skip transparent
      const d = (data[i] - cr) ** 2 + (data[i + 1] - cg) ** 2 + (data[i + 2] - cb) ** 2
      if (d < minDist) minDist = d
    }
    if (minDist > bestMinDist) { bestMinDist = minDist; bestColor = [cr, cg, cb] }
  }

  return bestColor
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function rgbToName([r, g, b]: [number, number, number]): string {
  if (r === 255 && g === 0 && b === 255) return 'magenta'
  if (r === 0 && g === 255 && b === 255) return 'cyan'
  if (r === 255 && g === 255 && b === 0) return 'yellow'
  if (r === 0 && g === 255 && b === 127) return 'spring green'
  if (r === 127 && g === 0 && b === 255) return 'violet'
  if (r === 255 && g === 127 && b === 0) return 'amber'
  return 'solid colour'
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)![1]
  const raw  = atob(b64)
  const arr  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function generativeExpand(
  origDataUrl: string,  // cropped original image as data URL
  newW: number,         // new total canvas width
  newH: number,         // new total canvas height
  offsetX: number,      // where original sits in the new canvas (pixels from left)
  offsetY: number,      // where original sits in the new canvas (pixels from top)
  transparent: boolean, // caller-detected: true = character on transparent bg
): Promise<string> {
  const origBlob   = dataUrlToBlob(origDataUrl)
  const origBitmap = await createImageBitmap(origBlob)
  const origW      = origBitmap.width
  const origH      = origBitmap.height

  // 1. Choose padding colour.
  //    Transparent layers: always magenta — same as the character generation
  //    pipeline, so Gemini gets one consistent "fill me" signal across both the
  //    border areas and the transparent gaps in the character area.
  //    Opaque layers: pick the colour furthest from existing scene content so
  //    Gemini can clearly distinguish placeholder from content.
  const padRgb   = await selectPaddingColor(origBitmap)
  const fillColor = transparent ? '#FF00FF' : rgbToHex(padRgb)
  const fillName  = transparent ? 'magenta'  : rgbToName(padRgb)

  const padded = new OffscreenCanvas(newW, newH)
  const pCtx   = padded.getContext('2d')!
  pCtx.fillStyle = fillColor
  pCtx.fillRect(0, 0, newW, newH)
  pCtx.drawImage(origBitmap, offsetX, offsetY)
  origBitmap.close()

  const paddedBase64 = await blobToBase64(await padded.convertToBlob({ type: 'image/png' }))

  // 3. Ask Gemini to outpaint the border areas
  const prompt = [
    'TASK: Outpainting — fill the marked border areas to extend this scene.',
    '',
    `The areas filled with ${fillName} (${fillColor}) are empty borders. They are a technical mask — they have zero meaning as a scene element. Treat them as blank canvas.`,
    '',
    'INSTRUCTIONS:',
    `1. Study the existing scene carefully, especially at every edge where scene content meets the ${fillName} border.`,
    `2. Fill each ${fillName} area by continuing exactly what appears at that edge — same colours, same elements, same textures.`,
    '3. Sky colour, ground colour, lighting — all must match the existing scene pixel-perfectly at the boundary. If the sky in the scene is orange, the extended sky is orange. Do NOT change or "correct" any colour.',
    '4. The result must look like the original canvas was simply larger — not like new content was added.',
    '',
    'RULES:',
    `— Every ${fillName} pixel must be replaced. None must remain.`,
    '— Colour continuity is the top priority. Match boundary pixels exactly — zero colour jump at any seam.',
    '— Art style: crude linework, flat colours, black outlines. VVC meme cartoon quality.',
    '— All generated elements must be fully inside the frame.',
    '— Do NOT modify any non-placeholder pixel.',
  ].join('\n')

  const resultBlobUrl = await callGeminiImage(paddedBase64, 'image/png', prompt)

  // 3. Composite original back on top to guarantee centre is pixel-perfect
  const [resultBitmap, origBitmap2] = await Promise.all([
    createImageBitmap(await fetch(resultBlobUrl).then(r => r.blob())),
    createImageBitmap(origBlob),
  ])

  const final  = new OffscreenCanvas(newW, newH)
  const fCtx   = final.getContext('2d')!

  // Scale Gemini's result to exactly newW×newH — Gemini returns arbitrary resolution
  fCtx.drawImage(resultBitmap, 0, 0, newW, newH)

  // Restore original pixel-perfectly. clearRect zeros the area first so transparent
  // pixels in the original stay transparent rather than showing Gemini's background.
  fCtx.clearRect(offsetX, offsetY, origW, origH)
  fCtx.drawImage(origBitmap2, offsetX, offsetY)

  resultBitmap.close()
  origBitmap2.close()

  const finalBlob = await final.convertToBlob({ type: 'image/png' })
  const finalUrl  = URL.createObjectURL(finalBlob)

  // For transparent layers, Gemini sometimes leaves magenta unfilled in ambiguous
  // zones (e.g. sky areas where it can't determine the correct scene colour from the
  // boundary). removeBackground keys those out so the canvas background layer shows
  // through, which is the correct visual result (orange canvas = orange sky, etc.).
  // For opaque layers there is no magenta left to remove, so we skip it.
  if (transparent) return removeBackground(finalUrl)
  return finalUrl
}

// ─── Gemini image call ────────────────────────────────────────────────────────

async function callGeminiImage(base64: string, mimeType: string, prompt: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt },
      ]
    }],
    generationConfig: { responseModalities: ['image', 'text'] }
  })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${getActiveKey()}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini error ${res.status}: ${err}`)
  }

  const json  = await res.json()
  const parts: any[] = json.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find(
    p => p.inlineData?.mimeType?.startsWith('image/') || p.inline_data?.mime_type?.startsWith('image/')
  )

  if (!imgPart) throw new Error('No image in Gemini response')

  const imgData  = imgPart.inlineData ?? imgPart.inline_data
  const byteChars = atob(imgData.data)
  const byteArr  = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i)
  const outBlob  = new Blob([byteArr], { type: imgData.mimeType ?? imgData.mime_type })
  return URL.createObjectURL(outBlob)
}

// ─── Portrait prompts (PFP generation — white BG, no removal needed) ─────────

const PROMPT_STANDARD = `Reframe this character as a square profile picture. You may adjust the body pose and composition — but the face is completely off-limits.

FACE — zero tolerance rules:
- Do NOT change the face in any way: same angle, same orientation, same morphology, same expression, same features.
- If the face is in full side profile in the input, it stays in full side profile. If it is 3/4, it stays 3/4. If it is front-on, it stays front-on. The head does NOT rotate toward the viewer under any circumstances.
- "Centering" means moving the face's X/Y position on the canvas. It does NOT mean rotating the head. Never rotate the head.
- Do NOT rotate or mirror the face.

BODY — limited freedom:
- You may shift the pose slightly so the character reads naturally as a portrait: relax the arms, adjust the shoulders, bring the framing in.
- Do NOT change clothing, shirt design, logos, text, or colours. What they are wearing in the input is exactly what they wear in the output.
- Keep the same art style, proportions, and character design.
- The entire head must be fully visible within the frame. Every part of the head — no matter how exaggerated or unusually proportioned — must be completely inside the canvas. Never crop any part of the head. If the head is large, zoom out until all of it fits.

COMPOSITION:
- Locate the face. Find the vertical midpoint of the face: halfway between the top of the skull and the bottom of the chin. That point must sit at exactly 50% of the canvas height — not 40%, not 35%, exactly halfway down.
- Find the horizontal midpoint of the face: halfway between the leftmost and rightmost points of the face. That point must sit at exactly 50% of the canvas width.
- Face should occupy roughly 55–65% of the canvas width.
- Once the face is centered, fill the remaining canvas with white. Neck, shoulders, or body may appear below the face — that is fine as long as the face midpoint is at true center.
- Do not let whitespace above the head, or neck length below the chin, pull the face away from true center. If the neck is long, it extends below center. If there is empty space above, it stays.
- White background only. No props, no objects, no environment.`

const PROMPT_LEGENDARY = `Reframe this mythological character as a square portrait. This character is non-humanoid and must not be given human proportions or a human body under any circumstances.

FACE — zero tolerance rules:
- Do NOT change the face in any way: same angle, same orientation, same morphology, same expression, same features.
- Do NOT rotate or reorient the face. "Centering" is a canvas position operation only — never a head rotation.

BODY — do NOT touch it:
- Do NOT adjust the pose. Do NOT add limbs, muscles, a torso, or any body parts that are not in the original.
- Do NOT give the character a human body. If the original body is serpentine, cosmic, abstract, or non-humanoid, keep it exactly that way.
- Keep the exact same art style, colours, forms, and character design.

ITEMS — remove held objects:
- Remove any items, objects, or props the character is holding or carrying (orbs, scales, weapons, tools, etc.).
- Do not replace them with anything. Just leave white space where they were.
- The character's own body, limbs, and tentacles are NOT items — keep those.

COMPOSITION:
- Place the character on a white square canvas with perfectly equal white margins on all four sides — left margin = right margin = top margin = bottom margin. The character floats in the dead center.
- Scale it to fill about 85% of the canvas so the margins are small but equal.
- White background. Do not add or invent anything.`

// ─── Studio operations ────────────────────────────────────────────────────────

export async function reskinCharacter(charKey: string, userPrompt: string): Promise<string> {
  const templateFile = CHAR_TEMPLATE[charKey]
  if (!templateFile) throw new Error(`No template for character: ${charKey}`)
  const prompt = [
    'You are given a black-and-white line-art template of a cartoon character.',
    'Apply the modification described below. Keep the exact same pose, proportions, and body structure.',
    'Use bold flat cartoon colors with black outlines. VVC meme-style cartoon illustration.',
    '',
    MAGENTA_BG_INSTRUCTION,
    '',
    userPrompt,
    '',
    'Do not change the pose or add/remove body parts. Only apply coloring and visual surface details as described.',
  ].join('\n')
  const raw = await generatePfp(templateFile, prompt)
  return removeBackground(raw)
}

export async function generatePfp(templateFile: string, prompt: string): Promise<string> {
  const templateUrl = `/assets/chars/${templateFile}.png`

  const blob = await fetch(templateUrl).then(r => {
    if (!r.ok) throw new Error(`Failed to load template: ${templateUrl}`)
    return r.blob()
  })

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  return callGeminiImage(base64, 'image/png', prompt)
}

export async function editLayer(imageDataUrl: string, userPrompt: string): Promise<string> {
  const base64   = imageDataUrl.split(',')[1]
  const mimeType = imageDataUrl.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const prompt = [
    'You are given an image layer from a meme canvas.',
    'Apply the visual modification described below.',
    'Maintain the same VVC meme art style (bold flat colors, black outlines) if applicable.',
    'Do NOT add any characters, people, or figures unless the modification explicitly requires one.',
    'Only change what is described. Keep everything else identical.',
    '',
    userPrompt,
  ].join('\n')
  return callGeminiImage(base64, mimeType, prompt)
}

export async function editCharacter(imageDataUrl: string, userPrompt: string): Promise<string> {
  const base64   = imageDataUrl.split(',')[1]
  const mimeType = imageDataUrl.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const prompt = [
    'You are given a cartoon character in VVC meme art style (bold flat colors, black outlines).',
    'Apply the visual modification described below while keeping the exact same pose, body structure, and composition.',
    'Maintain bold flat cartoon colors and black outlines.',
    '',
    MAGENTA_BG_INSTRUCTION,
    '',
    userPrompt,
    '',
    'Do NOT change the pose, proportions, or composition. Only apply the described visual surface changes.',
  ].join('\n')
  const raw = await callGeminiImage(base64, mimeType, prompt)
  return removeBackground(raw)
}

export async function reskinCharacterInScene(sceneDataUrl: string, charName: string, userPrompt: string): Promise<string> {
  const base64   = sceneDataUrl.split(',')[1]
  const mimeType = sceneDataUrl.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const prompt = [
    `You are given a full scene illustration in VVC meme cartoon art style.`,
    `The main character in this scene is the ${charName}.`,
    `Apply the clothing or appearance change described below to THE MAIN CHARACTER ONLY.`,
    '',
    userPrompt,
    '',
    `RULES — zero tolerance:`,
    `— Modify ONLY the ${charName}'s clothing, hair, accessories, or surface appearance as described.`,
    `— Do NOT move, rotate, or change the ${charName}'s pose, position, proportions, or facial features.`,
    `— Do NOT alter the background, environment, props, or any other characters or figures in the scene.`,
    `— Maintain the exact VVC meme art style: flat colors, black outlines, crude linework.`,
    `— Everything except the described surface change must look identical to the input.`,
  ].join('\n')
  return callGeminiImage(base64, mimeType, prompt)
}

// Scene level prompts.
// Levels 1 and 2 use magenta background → removeBackground() applied after generation.
// Level 3 (full scene) keeps its own background — no removal.
const SCENE_LEVEL_PROMPTS: Record<1 | 2 | 3, string[]> = {
  1: [
    'SCENE — object only, transparent background:',
    `${MAGENTA_BG_INSTRUCTION}`,
    '— The character interacts with exactly ONE object or prop relevant to the situation (a weapon, a phone, a sign, a ball, a tool — whatever fits).',
    '— That one prop is the only thing other than the character in the entire image.',
    '— CRITICAL: The prop must be held, used, or directly touched by the character — not floating nearby. It is part of the action.',
    '— Nothing else. No shadows, no ground line, no background hint.',
    '',
    'FORMAT:',
    '— Magenta background (#FF00FF). Character + one prop only.',
    '— Character fills most of the frame.',
  ],
  2: [
    'SCENE — character + surroundings, transparent background:',
    `${MAGENTA_BG_INSTRUCTION}`,
    '— Add 2–4 surrounding elements: objects, props, a simple floor line, minimal context clues — enough to show the spatial situation.',
    '— Secondary characters: only include another figure if the situation absolutely requires one (e.g. a confrontation, someone being grabbed, a handshake). If included, they must be drawn in the exact same crude VVC style — wobbly lines, flat colors, imperfect proportions, same hand-drawn quality. Do NOT add background crowd figures or decorative people.',
    '— CRITICAL: Scene elements must be spatially separate from the main character. Nothing sits on their skin, clothing, or limbs.',
    '',
    'FORMAT:',
    '— Magenta background (#FF00FF). Light scene context only.',
    '— Character fills most of the frame, contextual elements are smaller and around them.',
  ],
  3: [
    'SCENE — full immersive scene:',
    '— Build a complete environment around the character: ground, sky, buildings, vehicles, crowds, explosions, interiors — whatever the situation demands. Fill the entire square canvas.',
    '— The background should be drawn with the same crude MS-Paint energy as the character — flat colors, rough shapes, no polish.',
    '— CRITICAL: Scene elements must be spatially separate from the character. They go in the background, on the ground, or to the side. Do NOT place any objects, figures, or props on top of, attached to, or overlapping the character\'s body.',
    '— You are drawing a freeze-frame of an actual event. The scene should make it immediately obvious what is happening.',
    '— A few strong scene elements beat a cluttered one. Keep it readable.',
    '',
    'FORMAT:',
    '— Full scene background fills the canvas. Immersive square composition.',
    '— Character is the focal point but the world exists around them.',
  ],
}

export async function inActionCharacter(imageDataUrl: string, userPrompt: string, sceneLevel: 1 | 2 | 3 = 3): Promise<string> {
  const base64   = imageDataUrl.split(',')[1]
  const mimeType = imageDataUrl.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const prompt = [
    'You are given a cartoon character from VVC internet meme culture.',
    'Redraw the body in a new pose fitting the situation below. The face is completely frozen — reproduce it pixel-perfectly.',
    '',
    'FACE — absolute zero-tolerance rules:',
    '— Copy the face from the input EXACTLY. Same eyes, same nose, same mouth, same expression, same shape, same proportions, same features. Nothing changes.',
    '— Do NOT redraw the face. Do NOT reinterpret it. Do NOT "improve" it. Treat it like a stamp you are placing onto the new drawing.',
    '— The face in the output must be indistinguishable from the face in the input when overlaid.',
    '— Hair, beard, head shape — also frozen. Same as input.',
    '',
    'BODY — commit fully to the action:',
    '— The body MUST be in a completely different pose from the input. A slight stance change is wrong. The character must be physically doing something.',
    '— Choose a dramatic, committed pose: mid-sprint, diving, swinging, charging, falling, recoiling, throwing, screaming, cowering — whatever the situation demands. Full body engagement.',
    '— Change the camera angle too. Do not just draw the character from the front at eye level. Use a low angle looking up, a slight overhead, a 3/4 perspective, or whatever angle makes the scene feel alive.',
    '— Foreshortening, limbs coming toward camera, leaning into the frame — use these to make the image feel like a frozen moment in time, not a character sheet pose.',
    '— Redraw torso, arms, legs, and posture entirely from scratch.',
    '— Keep the same clothing, colors, and proportions as the input.',
    '— The body must look drawn by the same hand as the face — same rough linework, same imperfection level.',
    '',
    ...SCENE_LEVEL_PROMPTS[sceneLevel],
    '',
    'ART STYLE — most important:',
    '— Imagine someone drew this with a mouse on MS Paint, cheap tablet, no undo. That is the quality level.',
    '— Lines are wobbly and uneven. Not as a style choice — just how it came out.',
    '— Flat solid colors. No shading, no gradients, no highlights. Colors may slightly bleed outside lines.',
    '— Proportions slightly off in an accidental way. Hands are simple stubs.',
    '— Honest and crude — creative vision, limited technical skill. Charming because of its imperfection.',
    '— DO NOT produce clean studio cartoon, Flash asset, or TV animation linework.',
    '',
    'SITUATION:',
    userPrompt,
  ].join('\n')

  const raw = await callGeminiImage(base64, mimeType, prompt)
  // Level 3 is a full scene — keep its background intact
  if (sceneLevel === 3) return raw
  return removeBackground(raw)
}

export async function generatePortraitPfp(blobUrl: string, legendary: boolean): Promise<string> {
  const blob = await fetch(blobUrl).then(r => r.blob())
  const mimeType = blob.type || 'image/png'

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  const prompt = legendary ? PROMPT_LEGENDARY : PROMPT_STANDARD
  return callGeminiImage(base64, mimeType, prompt)
}
