import { StreamPlayer } from '../components/StreamPlayer'
import { ChatInput } from '../components/ChatInput'
import { MemeQueue } from '../components/MemeQueue'
import { YtVideosPanel } from '../components/YtVideosPanel'

export function Live({ address }: { address: string }) {
  return (
    <div className="live-layout">
      <div className="live-center">
        <StreamPlayer />
        <ChatInput address={address} />
      </div>
      <div className="live-right">
        <MemeQueue address={address} />
        <YtVideosPanel address={address} />
      </div>
    </div>
  )
}
