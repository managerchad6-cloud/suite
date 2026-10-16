import { useCallback, useEffect, useRef, useState } from 'react'
import Hls, { ErrorTypes, Events } from 'hls.js'
import { STREAM_URL } from '../api/livestream'

// The stream is 2-second segments in a 12-second sliding playlist. The player stays a few
// seconds behind the live edge and never drifts: up to MAX_LATENCY it catches up by playing a
// touch faster (pitch is kept, so it's inaudible); beyond that, or after a stall, a hidden tab or
// a pause, it jumps straight back to the edge. There is no scrubber: it's live, you're either
// on it or one click away from it.

const TARGET_LATENCY = 5     // seconds behind the edge we aim for
const MAX_LATENCY = 10       // further behind than this: jump (must stay under the 12s window)
const CATCH_UP_RATE = 1.08
const LIVE_SLACK = 2.5       // within TARGET + this still reads as "LIVE"
const RETRY_MS = 3000
const HIDE_CONTROLS_MS = 2500
const VOLUME_KEY = 'vvc:live-volume'

type Status = 'connecting' | 'playing' | 'buffering' | 'offline'

function savedVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return v > 0 && v <= 1 ? v : 1
  } catch { return 1 }
}

export function StreamPlayer() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const [status, setStatus] = useState<Status>('connecting')
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true) // browsers only autoplay muted
  const [volume, setVolume] = useState(savedVolume)
  const [latency, setLatency] = useState<number | null>(null)
  const [controlsShown, setControlsShown] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Seconds behind the live edge (null until known) */
  const measureLatency = useCallback((): number | null => {
    const video = videoRef.current
    if (!video) return null
    const hls = hlsRef.current
    if (hls) return hls.liveSyncPosition != null ? hls.latency : null
    const { seekable } = video
    return seekable.length ? seekable.end(seekable.length - 1) - video.currentTime : null
  }, [])

  const goLive = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const hls = hlsRef.current
    const { seekable } = video
    const edge = hls?.liveSyncPosition ?? (seekable.length ? seekable.end(seekable.length - 1) - TARGET_LATENCY : null)
    if (edge != null && Number.isFinite(edge)) video.currentTime = edge
    video.playbackRate = 1
    video.play().catch(() => { /* needs a click */ })
  }, [])

  // ── Load the stream (and reload it after fatal errors) ───────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let retry: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const start = () => {
      if (disposed) return
      setStatus('connecting')
      if (Hls.isSupported()) {
        const hls = new Hls({
          liveSyncDuration: TARGET_LATENCY,
          liveMaxLatencyDuration: MAX_LATENCY,
          maxLiveSyncPlaybackRate: CATCH_UP_RATE,
          backBufferLength: 10,
        })
        hlsRef.current = hls
        hls.loadSource(STREAM_URL)
        hls.attachMedia(video)
        hls.on(Events.MANIFEST_PARSED, () => {
          video.play().catch(() => { /* autoplay blocked — the play button is there */ })
        })
        let mediaRecoveries = 0
        hls.on(Events.ERROR, (_e, data) => {
          if (!data.fatal) return
          if (data.type === ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) {
            hls.recoverMediaError()
            return
          }
          // Stream restarting or network gone: start over in a moment
          setStatus('offline')
          hls.destroy()
          hlsRef.current = null
          retry = setTimeout(start, RETRY_MS)
        })
        hls.on(Events.FRAG_BUFFERED, () => { mediaRecoveries = 0 })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = STREAM_URL // Safari: native HLS; catch-up is done by the watchdog below
        video.play().catch(() => {})
      }
    }

    start()
    return () => {
      disposed = true
      if (retry) clearTimeout(retry)
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [])

  // ── Video element state ──────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = savedVolume()
    const onPlaying = () => { setStatus('playing'); setPaused(false) }
    const onWaiting = () => setStatus((s) => (s === 'offline' ? s : 'buffering'))
    const onPause = () => setPaused(true)
    const onPlay = () => {
      setPaused(false)
      // Resuming after a pause: back to now, not to where we stopped
      const l = measureLatency()
      if (l != null && l > TARGET_LATENCY + LIVE_SLACK) goLive()
    }
    const onVolume = () => {
      setMuted(video.muted)
      setVolume(video.volume)
      try { localStorage.setItem(VOLUME_KEY, String(video.volume)) } catch { /* private mode */ }
    }
    const onError = () => setStatus('offline')
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('pause', onPause)
    video.addEventListener('play', onPlay)
    video.addEventListener('volumechange', onVolume)
    video.addEventListener('error', onError)
    return () => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('volumechange', onVolume)
      video.removeEventListener('error', onError)
    }
  }, [goLive, measureLatency])

  // ── Latency watchdog: show it, and never let it grow ─────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const video = videoRef.current
      const l = measureLatency()
      setLatency(l)
      if (!video || l == null || video.paused) return
      if (l > MAX_LATENCY + 1) {
        goLive() // hls.js should have done this; belt and braces (and Safari)
      } else if (!hlsRef.current) {
        // Safari: hls.js isn't steering the rate, so catch up by hand
        video.playbackRate = l > TARGET_LATENCY + 1.5 ? CATCH_UP_RATE : 1
      }
    }, 1000)
    // A hidden tab gets throttled and falls behind: jump to now when it's back
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const l = measureLatency()
      if (l != null && l > TARGET_LATENCY + LIVE_SLACK) goLive()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [goLive, measureLatency])

  // ── Controls ─────────────────────────────────────────────────────────────────
  const pokeControls = useCallback(() => {
    setControlsShown(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsShown(false), HIDE_CONTROLS_MS)
  }, [])
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current) }, [])

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }
  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    if (!video.muted && video.volume === 0) video.volume = 0.5
    if (video.paused) video.play().catch(() => {})
  }
  const changeVolume = (v: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = v
    video.muted = v === 0
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else wrapRef.current?.requestFullscreen?.().catch(() => {})
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay() }
    else if (e.key === 'm') toggleMute()
    else if (e.key === 'f') toggleFullscreen()
    else if (e.key === 'l') goLive()
    else return
    pokeControls()
  }

  const behind = latency != null && latency > TARGET_LATENCY + LIVE_SLACK
  const atLive = status === 'playing' && !paused && !behind
  const showControls = controlsShown || paused || behind || status !== 'playing'

  return (
    <div
      ref={wrapRef}
      className={`stream-wrap${showControls ? ' stream-wrap--controls' : ''}`}
      tabIndex={0}
      onMouseMove={pokeControls}
      onTouchStart={pokeControls}
      onKeyDown={onKey}
    >
      <video
        ref={videoRef}
        className="stream-video"
        muted
        playsInline
        onClick={() => { if (muted) toggleMute(); pokeControls() }}
        onDoubleClick={toggleFullscreen}
      />

      {status !== 'playing' && !paused && (
        <div className="stream-state" aria-live="polite">
          {status === 'offline' ? 'Stream offline · reconnecting…' : status === 'buffering' ? 'Buffering…' : 'Connecting…'}
        </div>
      )}

      {muted && status === 'playing' && (
        <button type="button" className="stream-unmute" onClick={toggleMute}>
          🔇 Tap to unmute
        </button>
      )}

      <div className="stream-controls">
        <button type="button" className="stream-btn" onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'}>
          {paused ? '▶' : '❚❚'}
        </button>
        <button type="button" className="stream-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </button>
        <input
          className="stream-volume"
          type="range" min={0} max={1} step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          aria-label="Volume"
        />
        <button
          type="button"
          className={`stream-live${atLive ? ' stream-live--on' : ''}`}
          onClick={goLive}
          disabled={atLive}
          title={atLive ? 'You are watching live' : 'Jump to live'}
        >
          <span className="stream-live-dot" aria-hidden />
          {atLive || latency == null ? 'LIVE' : `−${Math.round(latency)}s · GO LIVE`}
        </button>
        <span className="stream-spacer" />
        <button type="button" className="stream-btn" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
          {fullscreen ? '⤡' : '⤢'}
        </button>
      </div>
    </div>
  )
}
