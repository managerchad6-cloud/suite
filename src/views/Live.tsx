import { StreamPlayer } from '../components/StreamPlayer'
import { ChatInput } from '../components/ChatInput'
import { MemeQueue } from '../components/MemeQueue'
import { YtVideosPanel } from '../components/YtVideosPanel'

export function Live() {
  return (
    <div className="live-layout">
      <div className="live-center">
        <StreamPlayer />
        <ChatInput />
      </div>
      <div className="live-right">
        <MemeQueue />
        <YtVideosPanel />
      </div>
    </div>
  )
}
