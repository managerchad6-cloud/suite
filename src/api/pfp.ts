const API_KEY = 'AIzaSyCJFGxK97J9dQVszXm483PG2pvnVcR26go'
const MODEL   = 'nano-banana-pro-preview'

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

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/png', data: base64 } },
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
