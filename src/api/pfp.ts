const API_KEY = 'AIzaSyCKhS-jCwRmLq3H-1hfUxNtAgWECfsekOU'
const MODEL   = 'nano-banana-pro-preview'

export const LEGENDARY_CHARS = new Set(['gad', 'zad', 'bad', 'gizzard', 'wizard'])

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
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
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
