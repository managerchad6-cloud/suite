import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { STREAM_URL } from '../api/livestream'

export function StreamPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, backBufferLength: 10 })
      hls.loadSource(STREAM_URL)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { /* autoplay blocked — user can click */ })
      })
      return () => hls.destroy()
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = STREAM_URL
    }
  }, [])

  return (
    <div className="stream-wrap">
      <video ref={videoRef} className="stream-video" muted playsInline controls />
    </div>
  )
}
