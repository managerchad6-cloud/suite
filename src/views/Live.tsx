import { StreamPlayer } from '../components/StreamPlayer'
import { ChatInput } from '../components/ChatInput'

// The stream gets the whole width; memes, ideas, videos and votes live behind the chat's "+"
export function Live() {
  return (
    <div className="live-layout">
      <div className="live-center">
        <StreamPlayer />
        <ChatInput />
      </div>
    </div>
  )
}
