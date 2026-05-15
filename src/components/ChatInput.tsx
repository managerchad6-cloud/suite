import { useState } from 'react'
import { sendChat } from '../api/livestream'

export function ChatInput({ address: _address }: { address: string }) {
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    const text = msg.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await sendChat(text)
      setMsg('')
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat-input-wrap">
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Say something… they're listening"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSend() }}
          disabled={sending}
          maxLength={300}
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={sending || !msg.trim()}>
          {sending ? '…' : '▶ SEND'}
        </button>
      </div>
    </div>
  )
}
