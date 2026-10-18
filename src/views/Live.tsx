import { useEffect } from 'react'
import { StreamPlayer } from '../components/StreamPlayer'
import { ChatInput } from '../components/ChatInput'

// The stream gets the whole width; memes, ideas, videos and votes live behind the chat's "+".
// The picture keeps its own shape on any screen (the leftover space glows with it), and just start
// typing to chat: keys go to the chat box unless the player itself is focused (its shortcuts).
export function Live() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (el && el !== document.body && !el.classList.contains('live-center')) return
      const input = document.querySelector<HTMLInputElement>('.live-center .chat-input')
      if (!input || input.closest('[inert]')) return
      if (e.key === 'Enter' || e.key === '/' || e.key.length === 1) input.focus()   // the key lands in the box
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="live-layout">
      <div className="live-center" tabIndex={-1}>
        <div className="live-stage">
          <StreamPlayer />
        </div>
        <ChatInput />
      </div>
    </div>
  )
}
