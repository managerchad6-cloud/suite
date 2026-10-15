import '../video.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getCommunityFeed, getPublishedVideo, voteVideo, type PublishedVideo, type VideoScene, type SceneData } from '../api/video'
import { VideoCanvas } from '../components/VideoCanvas'

// ─── Single video card (fullscreen vertical, TikTok-style) ───────────────────

function VideoCard({ video, address, active }: {
  video: PublishedVideo
  address: string
  active: boolean
}) {
  const [full, setFull]       = useState<PublishedVideo & { scenes?: VideoScene[] } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [scene, setScene]     = useState(0)
  const [votes, setVotes]     = useState(video.vote_count ?? 0)
  const [voted, setVoted]     = useState(false)

  useEffect(() => {
    if (!active) { setPlaying(false); return }
    getPublishedVideo(video.id).then(v => {
      setFull(v)
      setScene(0)
      setPlaying(true)
    })
  }, [active, video.id])

  async function handleVote() {
    if (voted) return
    const result = await voteVideo(video.id, address, 1)
    setVotes(result.votes)
    setVoted(true)
  }

  function handleSceneEnd() {
    if (!full?.scenes) return
    const next = scene + 1
    if (next < full.scenes.length) setScene(next)
    else setPlaying(false)
  }

  const currentScene    = full?.scenes?.[scene]
  const currentSceneData: SceneData | null = currentScene?.data ?? null

  return (
    <div className={`vf-card ${active ? 'vf-card--active' : ''}`}>
      <div className="vf-canvas-wrap">
        {currentSceneData && full ? (
          <VideoCanvas
            jobId={full.job_id}
            sceneData={currentSceneData}
            sceneIndex={scene}
            playing={playing && active}
            onEnded={handleSceneEnd}
          />
        ) : (
          <div className="vf-placeholder">
            {active ? <div className="vs-spinner" /> : <span>▶</span>}
          </div>
        )}

        {/* Overlay tap to play/pause */}
        <button className="vf-tap-overlay" onClick={() => setPlaying(p => !p)} />
      </div>

      <div className="vf-info">
        <div className="vf-title">{video.title}</div>
        <div className="vf-meta">
          {video.scene_count} scenes · {video.duration_s.toFixed(0)}s
        </div>
        {full?.scenes && full.scenes.length > 1 && (
          <div className="vf-scene-dots">
            {full.scenes.map((_, i) => (
              <button
                key={i}
                className={`vf-dot ${i === scene ? 'active' : ''}`}
                onClick={() => { setScene(i); setPlaying(true) }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="vf-actions">
        <button
          className={`vf-vote-btn ${voted ? 'voted' : ''}`}
          onClick={handleVote}
          title="Upvote"
        >
          <span className="vf-vote-icon">⬆</span>
          <span className="vf-vote-count">{votes}</span>
        </button>
        <button className="vf-share-btn" title="Share">↗</button>
      </div>
    </div>
  )
}

// ─── Main VideoFeed ───────────────────────────────────────────────────────────

export function VideoFeed({ address }: { address: string }) {
  const [videos,  setVideos]  = useState<PublishedVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [offset, setOffset]   = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef  = useRef<HTMLDivElement>(null)
  const LIMIT = 10

  const loadMore = useCallback(async () => {
    try {
      const { videos: newVids } = await getCommunityFeed({ limit: LIMIT, offset })
      setVideos(prev => [...prev, ...newVids])
      setOffset(o => o + newVids.length)
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => { loadMore() }, [])

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  // Track active video by scroll position
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const idx = Math.round(container.scrollTop / container.clientHeight)
      setActiveIdx(idx)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  if (loading && !videos.length) {
    return (
      <div className="vf-empty">
        <div className="vs-spinner" />
        <p>Loading videos…</p>
      </div>
    )
  }

  if (!videos.length) {
    return (
      <div className="vf-empty">
        <p>No videos yet. Be the first to publish one!</p>
      </div>
    )
  }

  return (
    <div className="vf-feed" ref={containerRef}>
      {videos.map((v, i) => (
        <VideoCard
          key={v.id}
          video={v}
          address={address}
          active={i === activeIdx}
        />
      ))}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  )
}
