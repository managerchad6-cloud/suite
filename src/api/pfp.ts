const VVC_API_KEY = 'AIzaSyCN8_Q5nh2UJeX5r1RnK7XTJse7RJfQtSA'
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

export const LEGENDARY_CHARS = new Set(['gad', 'zad', 'bad', 'gizzard', 'wizard'])

export const CHAR_TEMPLATE: Record<string, string> = {
  gigachad:  'gigachad_template',
  chad:      'chad_template',
  thad:      'thad_template',
  lad:       'lad_template',
  brad:      'brad_template',
  boomer:    'boomer_template',
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

  const json = await res.json()
  const parts: any[] = json.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find(
    p => p.inlineData?.mimeType?.startsWith('image/') || p.inline_data?.mime_type?.startsWith('image/')
  )

  if (!imgPart) throw new Error('No image in Gemini response')

  const imgData = imgPart.inlineData ?? imgPart.inline_data
  const byteChars = atob(imgData.data)
  const byteArr = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i)
  const outBlob = new Blob([byteArr], { type: imgData.mimeType ?? imgData.mime_type })
  return URL.createObjectURL(outBlob)
}

export async function reskinCharacter(charKey: string, userPrompt: string): Promise<string> {
  const templateFile = CHAR_TEMPLATE[charKey]
  if (!templateFile) throw new Error(`No template for character: ${charKey}`)
  const prompt = [
    'You are given a black-and-white line-art template of a cartoon character.',
    'Apply the modification described below. Keep the exact same pose, proportions, and body structure.',
    'Use bold flat cartoon colors with black outlines, white background. VVC meme-style cartoon illustration.',
    '',
    userPrompt,
    '',
    'Do not change the pose or add/remove body parts. Only apply coloring and visual surface details as described.',
  ].join('\n')
  return generatePfp(templateFile, prompt)
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

export async function editCharacter(imageDataUrl: string, userPrompt: string): Promise<string> {
  const base64   = imageDataUrl.split(',')[1]
  const mimeType = imageDataUrl.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const prompt = [
    'You are given a cartoon character in VVC meme art style (bold flat colors, black outlines, white background).',
    'Apply the visual modification described below while keeping the exact same pose, body structure, and composition.',
    'Maintain bold flat cartoon colors, black outlines, white background.',
    '',
    userPrompt,
    '',
    'Do NOT change the pose, proportions, or composition. Only apply the described visual surface changes.',
  ].join('\n')
  return callGeminiImage(base64, mimeType, prompt)
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

const SCENE_LEVEL_PROMPTS: Record<1 | 2 | 3, string[]> = {
  1: [
    'SCENE — object only, white background:',
    '— Pure white background. No environment, no floor, no ground, no other characters.',
    '— The character interacts with exactly ONE object or prop relevant to the situation (a weapon, a phone, a sign, a ball, a tool — whatever fits).',
    '— That one prop is the only thing other than the character in the entire image.',
    '— CRITICAL: The prop must be held, used, or directly touched by the character — not floating nearby. It is part of the action.',
    '— Nothing else. No shadows, no ground line, no background hint.',
    '',
    'FORMAT:',
    '— White background. Character + one prop only.',
    '— Character fills most of the frame.',
  ],
  2: [
    'SCENE — character + surroundings, white or minimal background:',
    '— Pure white (#FFFFFF) background. No off-white, no cream, no bone — pure white only. No fully rendered environment or landscape.',
    '— Add 2–4 surrounding elements: objects, props, a simple floor line, minimal context clues — enough to show the spatial situation.',
    '— Secondary characters: only include another figure if the situation absolutely requires one (e.g. a confrontation, someone being grabbed, a handshake). If included, they must be drawn in the exact same crude VVC style — wobbly lines, flat colors, imperfect proportions, same hand-drawn quality. Do NOT add background crowd figures or decorative people.',
    '— CRITICAL: Scene elements must be spatially separate from the main character. Nothing sits on their skin, clothing, or limbs.',
    '',
    'FORMAT:',
    '— Pure white (#FFFFFF) background. Light scene context only.',
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
  return callGeminiImage(base64, mimeType, prompt)
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
