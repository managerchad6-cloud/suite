import { useState } from 'react'
import { getUserGeminiKey, setUserGeminiKey, clearUserGeminiKey } from '../api/pfp'
import './GeminiKeyModal.css'

interface Props {
  onClose: () => void
  onChanged: () => void
}

export function GeminiKeyModal({ onClose, onChanged }: Props) {
  const [input,   setInput]   = useState(getUserGeminiKey() ?? '')
  const [testing, setTesting] = useState(false)
  const [status,  setStatus]  = useState<'idle' | 'ok' | 'error'>('idle')
  const [errMsg,  setErrMsg]  = useState('')

  async function testAndSave() {
    const key = input.trim()
    if (!key) return
    setTesting(true); setStatus('idle')
    try {
      // Minimal test: list models endpoint (cheap, no quota)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
      }
      setUserGeminiKey(key)
      setStatus('ok')
      onChanged()
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Invalid key')
      setStatus('error')
    } finally {
      setTesting(false)
    }
  }

  function remove() {
    clearUserGeminiKey()
    setInput('')
    setStatus('idle')
    onChanged()
  }

  const hasKey = !!getUserGeminiKey()

  return (
    <div className="gkm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gkm-modal">
        <div className="gkm-header">
          <span className="gkm-title">Gemini API Key</span>
          <button className="gkm-close" onClick={onClose}>✕</button>
        </div>

        <p className="gkm-desc">
          Use your own <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a> key
          to bypass VVC credits entirely. The key is stored only in your browser — never sent to our servers.
        </p>

        <input
          className="gkm-input"
          type="password"
          placeholder="AIza..."
          value={input}
          onChange={e => { setInput(e.target.value); setStatus('idle') }}
          onKeyDown={e => { if (e.key === 'Enter') testAndSave() }}
          spellCheck={false}
        />

        {status === 'ok'    && <div className="gkm-ok">✓ Key saved — credits bypassed for all Studio AI actions</div>}
        {status === 'error' && <div className="gkm-err">✕ {errMsg}</div>}

        <div className="gkm-actions">
          <button className="gkm-btn-primary" onClick={testAndSave} disabled={!input.trim() || testing}>
            {testing ? 'Testing…' : 'Test & Save'}
          </button>
          {hasKey && (
            <button className="gkm-btn-remove" onClick={remove}>
              Remove key (use credits)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
