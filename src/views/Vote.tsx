import { useState, useEffect } from 'react'
import {
  getRanks, getMyVideoVote, voteVideo,
  getRoadmap, getMyRoadmapVotes, voteRoadmap,
  type Video, type RoadmapItem,
} from '../api/viewer'

type Phantom = { signMessage: (m: Uint8Array, enc: string) => Promise<{ signature: Uint8Array }> }

function getPhantomSolana(): Phantom | null {
  return (window as unknown as { phantom?: { solana?: Phantom } }).phantom?.solana ?? null
}

async function signVote(message: string): Promise<string> {
  const p = getPhantomSolana()
  if (!p) throw new Error('Phantom not found')
  const { signature } = await p.signMessage(new TextEncoder().encode(message), 'utf8')
  return Array.from(signature).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function VideoVoting({ address }: { address: string }) {
  const [videos, setVideos] = useState<Video[]>([])
  const [myVote, setMyVote] = useState<string | null>(null)
  const [voting, setVoting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [ranks, mv] = await Promise.all([getRanks(), getMyVideoVote(address)])
    setVideos(ranks)
    setMyVote(mv)
    setLoading(false)
  }

  useEffect(() => { load() }, [address])

  const handleVote = async (videoFile: string) => {
    if (voting) return
    setVoting(videoFile)
    try {
      const date = new Date().toISOString().split('T')[0]
      const sig = await signVote(`VVC Vote: ${videoFile} | ${date}`)
      await voteVideo(address, videoFile, sig)
      await load()
    } catch { /* rejected */ } finally { setVoting(null) }
  }

  return (
    <div className="vote-section">
      <div className="vote-section-header">
        <span className="vote-section-title">VIDEO QUEUE</span>
        <span className="vote-section-sub">One vote · changeable</span>
      </div>
      {loading ? <div className="vote-spinner" /> : (
        <div className="vote-list">
          {videos.map((v, i) => (
            <div key={v.file} className={`vote-row ${myVote === v.file ? 'my-vote' : ''}`}>
              <span className="vote-rank">#{i + 1}</span>
              <div className="vote-info">
                <span className="vote-title">{v.title}</span>
                <span className="vote-meta">{v.id} · Arc {v.arc}</span>
              </div>
              <span className="vote-count">{v.votes}</span>
              <button
                className={`btn-vote-item ${myVote === v.file ? 'voted' : ''}`}
                onClick={() => handleVote(v.file)}
                disabled={!!voting}
                title={myVote === v.file ? 'Your vote — click to change' : undefined}
              >
                {voting === v.file ? '…' : myVote === v.file ? '✓' : '↑'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RoadmapVoting({ address }: { address: string }) {
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [myVotes, setMyVotes] = useState<string[]>([])
  const [voting, setVoting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [roadmap, mv] = await Promise.all([getRoadmap(), getMyRoadmapVotes(address)])
    setItems(roadmap)
    setMyVotes(mv)
    setLoading(false)
  }

  useEffect(() => { load() }, [address])

  const handleVote = async (itemId: string) => {
    if (voting || myVotes.includes(itemId)) return
    setVoting(itemId)
    try {
      const date = new Date().toISOString().split('T')[0]
      const sig = await signVote(`VVC Roadmap Vote: ${itemId} | ${date}`)
      await voteRoadmap(address, itemId, sig)
      setMyVotes((prev) => [...prev, itemId])
      await load()
    } catch { /* rejected */ } finally { setVoting(null) }
  }

  return (
    <div className="vote-section">
      <div className="vote-section-header">
        <span className="vote-section-title">ROADMAP</span>
        <span className="vote-section-sub">Multiple items · one vote each</span>
      </div>
      {loading ? <div className="vote-spinner" /> : (
        <div className="vote-list">
          {items.map((item, i) => (
            <div key={item.id} className={`vote-row ${myVotes.includes(item.id) ? 'my-vote' : ''}`}>
              <span className="vote-rank">#{i + 1}</span>
              <div className="vote-info">
                <span className="vote-title">{item.title}</span>
              </div>
              <span className="vote-count">{item.votes}</span>
              <button
                className={`btn-vote-item ${myVotes.includes(item.id) ? 'voted' : ''}`}
                onClick={() => handleVote(item.id)}
                disabled={!!voting || myVotes.includes(item.id)}
              >
                {voting === item.id ? '…' : myVotes.includes(item.id) ? '✓' : '↑'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Vote({ address }: { address: string }) {
  return (
    <div className="vote-view">
      <VideoVoting address={address} />
      <RoadmapVoting address={address} />
    </div>
  )
}
