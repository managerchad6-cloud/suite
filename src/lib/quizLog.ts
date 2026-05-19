export interface QuizLogEntry {
  timestamp: string
  conversation: { question: string; answer: string }[]
  character: string
  attributes: Record<string, string>
}

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

// Reconstruct Q&A pairs from raw Gemini history.
// History is already [model(opener), user(ans1), model(q2), user(ans2), ..., model(final)]
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
