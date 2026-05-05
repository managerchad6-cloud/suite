import { useState, useEffect } from 'react'
import { getLists, voteList } from '../api/livestream'

interface VideoItem { title: string; votes: number; index: number }

export function VideoQueue({ address: _address }: { address: string }) {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [voting, setVoting] = useState<number | null>(null)

  const load = async () => {
    const data = await getLists()
    if (!data?.videos) return
    setVideos(
      (data.videos as { title: string; votes?: number }[]).map((v, i) => ({
        title: v.title,
        votes: v.votes ?? 0,
        index: i,
      }))
    )
  }

  useEffect(() => { load() }, [])

  const handleVote = async (index: number) => {
    if (voting !== null) return
    setVoting(index)
    try { await voteList('video', index); await load() }
    catch { /* rejected */ } finally { setVoting(null) }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">NEXT YT VIDEO</span>
      </div>
      <div className="panel-body">
        {videos.length === 0 ? (
          <div className="panel-empty">No videos in queue</div>
        ) : videos.map((v) => (
          <div key={v.index} className="queue-item">
            <span className="queue-text">{v.title}</span>
            <div className="queue-item-right">
              <span className="queue-votes">{v.votes}</span>
              <button
                className="btn-queue-vote"
                onClick={() => handleVote(v.index)}
                disabled={voting !== null}
              >
                {voting === v.index ? '…' : '↑'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
