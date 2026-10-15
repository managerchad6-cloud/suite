export interface QuizLogEntry {
  timestamp: string
  conversation: { question: string; answer: string }[]
  character: string
  attributes: Record<string, string>
}

export interface UserProfile {
  walletAddress: string
  character: string
  title?: string
  description: string
  attributes: Record<string, string>
  characterImageDataUrl?: string
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
  // Always persist locally first — survives server downtime, keeps portrait images intact
  try { localStorage.setItem(localKey(profile.walletAddress), JSON.stringify(profile)) } catch {}
  // Strip large base64 image fields before sending to backend to stay under body size limits.
  // Portrait images are local-only; the public profile uses /assets/chars/:key as fallback.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { characterImageDataUrl: _c, portraitDataUrl: _p, ...payload } = profile
    const res = await fetch('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[profile] backend save failed:', res.status, body)
    }
  } catch (e) {
    console.warn('[profile] backend save failed (network):', e)
  }
}

export async function uploadPortrait(walletAddress: string, dataUrl: string, variant: 'pfp' | 'full'): Promise<void> {
  const path = variant === 'full'
    ? `/profiles/${encodeURIComponent(walletAddress)}/portrait/full`
    : `/profiles/${encodeURIComponent(walletAddress)}/portrait`
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    })
    if (!res.ok) console.warn('[portrait] upload failed:', res.status)
  } catch (e) {
    console.warn('[portrait] upload failed (network):', e)
  }
}

// Called on wallet connect — silently ensures server has both portraits.
// If the original upload failed (server down, first-time use), this re-uploads
// from localStorage so the user never has to re-run the Oracle.
export async function ensurePortraitsOnServer(walletAddress: string, profile: UserProfile): Promise<void> {
  const jobs: Array<{ checkUrl: string; dataUrl: string; variant: 'pfp' | 'full' }> = []
  if (profile.portraitDataUrl) {
    jobs.push({ checkUrl: `/profiles/${encodeURIComponent(walletAddress)}/portrait`, dataUrl: profile.portraitDataUrl, variant: 'pfp' })
  }
  if (profile.characterImageDataUrl) {
    jobs.push({ checkUrl: `/profiles/${encodeURIComponent(walletAddress)}/portrait/full`, dataUrl: profile.characterImageDataUrl, variant: 'full' })
  }
  for (const { checkUrl, dataUrl, variant } of jobs) {
    try {
      const head = await fetch(checkUrl, { method: 'HEAD' })
      if (!head.ok) await uploadPortrait(walletAddress, dataUrl, variant)
    } catch {
      uploadPortrait(walletAddress, dataUrl, variant).catch(() => {})
    }
  }
}

export async function loadProfilesBatch(wallets: string[]): Promise<Record<string, Partial<UserProfile>>> {
  if (wallets.length === 0) return {}
  try {
    const res = await fetch(`/profiles/batch?wallets=${encodeURIComponent(wallets.join(','))}`)
    return res.ok ? res.json() : {}
  } catch { return {} }
}

export async function loadProfile(walletAddress: string): Promise<UserProfile | null> {
  // Read local copy first — it may contain portrait images not stored on the backend
  let local: UserProfile | null = null
  try {
    const raw = localStorage.getItem(localKey(walletAddress))
    if (raw) local = JSON.parse(raw) as UserProfile
  } catch {}

  // Try backend for fresh text fields
  try {
    const res = await fetch(`/profiles/${encodeURIComponent(walletAddress)}`)
    if (res.ok) {
      const remote: UserProfile = await res.json()
      // Merge: remote has fresh text, local has portrait images (not stored on server)
      const merged: UserProfile = {
        ...local,
        ...remote,
        portraitDataUrl:      local?.portraitDataUrl      ?? remote.portraitDataUrl,
        characterImageDataUrl: local?.characterImageDataUrl ?? remote.characterImageDataUrl,
      }
      // Persist merged so portraits survive future loads
      try { localStorage.setItem(localKey(walletAddress), JSON.stringify(merged)) } catch {}
      return merged
    }
  } catch {}

  // No backend data — use local and re-push to backend
  if (local) {
    saveProfile(local).catch(() => {})
    return local
  }
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
