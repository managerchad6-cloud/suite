import { getUserGeminiKey } from './pfp'
import { ZAD_SYSTEM_PROMPT } from '../data/zadCorpus'

const VVC_API_KEY = ''
const CHAT_MODEL  = 'gemini-2.5-flash'

export interface Message {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

export const makeUserMsg  = (text: string): Message => ({ role: 'user',  parts: [{ text }] })
export const makeModelMsg = (text: string): Message => ({ role: 'model', parts: [{ text }] })

export async function chatWithZad(history: Message[], userMessage: string): Promise<string> {
  const apiKey = getUserGeminiKey() ?? VVC_API_KEY

  const contents: Message[] = [
    ...history,
    makeUserMsg(userMessage),
  ]

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: ZAD_SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.9,
    },
  })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`)
  }

  const json = await res.json()
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  if (!text) throw new Error('Empty response from Gemini')
  return text.trim()
}
