export interface QuizLogEntry {
  timestamp: string
  conversation: { question: string; answer: string }[]
  character: string
  attributes: Record<string, string>
}

export interface UserProfile {
  walletAddress: string
  character: string
  description: string
  attributes: Record<string, string>
  portraitDataUrl?: string
  updatedAt?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

export async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const blob = await fetch(blobUrl).then(r => r.blob())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function localKey(walletAddress: string) {
  return `vvc_profile_${walletAddress}`
}

// ── Quiz log ──────────────────────────────────────────────────────────────

export async function saveQuizEntry(
  entry: Omit<QuizLogEntry, 'timestamp'>
): Promise<void> {
  try {
    await fetch('/api/quiz-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
  } catch (e) {
    console.warn('[quiz-log] could not save session:', e)
  }
}

// ── Profile ───────────────────────────────────────────────────────────────

export async function saveProfile(profile: UserProfile): Promise<void> {
  // Always persist locally first — survives server downtime
  try { localStorage.setItem(localKey(profile.walletAddress), JSON.stringify(profile)) } catch {}
  // Then sync to backend
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
  } catch (e) {
    console.warn('[profile] backend save failed (local copy kept):', e)
  }
}

export async function loadProfile(walletAddress: string): Promise<UserProfile | null> {
  // Try backend first
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(walletAddress)}`)
    if (res.ok) {
      const data: UserProfile = await res.json()
      // Keep local copy in sync
      try { localStorage.setItem(localKey(walletAddress), JSON.stringify(data)) } catch {}
      return data
    }
  } catch {}
  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(localKey(walletAddress))
    if (raw) return JSON.parse(raw) as UserProfile
  } catch {}
  return null
}

// ── Conversation reconstruction ───────────────────────────────────────────

export function historyToConversation(
  history: { role: string; parts: [{ text: string }] }[]
): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = []
  for (let i = 0; i < history.length - 1; i += 2) {
    const modelMsg = history[i]
    const userMsg  = history[i + 1]
    if (!modelMsg || !userMsg) break
    if (modelMsg.role !== 'model' || userMsg.role !== 'user') continue
    let question = ''
    try {
      const parsed = JSON.parse(modelMsg.parts[0].text)
      if (parsed.done) break
      question = parsed.question ?? ''
    } catch { continue }
    if (!question) continue
    pairs.push({ question, answer: userMsg.parts[0].text })
  }
  return pairs
}
