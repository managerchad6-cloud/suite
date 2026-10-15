import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { imageUrl } from '../api/memes'
import './job-tracker-pill.css'

const STORAGE_KEY = 'vvc-tracked-job'

interface TrackedJob {
  jobId: string
  startedAt: number
}

type PillStatus = 'generating' | 'done' | 'failed'

function fmt(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function JobTrackerPill() {
  const navigate      = useNavigate()
  const { pathname }  = useLocation()
  const [job,    setJob]    = useState<TrackedJob | null>(null)
  const [status, setStatus] = useState<PillStatus>('generating')
  const [elapsed, setElapsed] = useState(0)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoRef  = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const jobRef   = useRef<TrackedJob | null>(null)

  const stopTimers = () => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null }
    if (tickRef.current)  { clearInterval(tickRef.current);  tickRef.current  = null }
  }

  const dismiss = () => {
    stopTimers()
    if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null }
    localStorage.removeItem(STORAGE_KEY)
    setJob(null)
    jobRef.current = null
    setStatus('generating')
    setElapsed(0)
  }

  // Load persisted job on mount (survives in-app navigation and page refresh)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as TrackedJob | null
      if (saved?.jobId) {
        setJob(saved)
        jobRef.current = saved
        setElapsed(Math.min(Math.floor((Date.now() - saved.startedAt) / 1000), 240))
      }
    } catch {}
  }, [])

  // MemeCreator tells us a new job was submitted
  useEffect(() => {
    const handler = (e: Event) => {
      const { jobId } = (e as CustomEvent<{ jobId: string }>).detail
      const j: TrackedJob = { jobId, startedAt: Date.now() }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(j))
      setJob(j)
      jobRef.current = j
      setStatus('generating')
      setElapsed(0)
    }
    window.addEventListener('vvc:job-started', handler)
    return () => window.removeEventListener('vvc:job-started', handler)
  }, [])

  // MemeCreator tells us the job finished (user stayed on /factory)
  useEffect(() => {
    const handler = (e: Event) => {
      const success = (e as CustomEvent<{ success: boolean }>).detail?.success ?? true
      if (!jobRef.current) return
      stopTimers()
      setStatus(success ? 'done' : 'failed')
      localStorage.removeItem(STORAGE_KEY)
      autoRef.current = setTimeout(dismiss, success ? 30_000 : 10_000)
    }
    window.addEventListener('vvc:job-done', handler)
    return () => window.removeEventListener('vvc:job-done', handler)
  }, [])

  // Background polling — runs whenever we have an active job and are away from /factory
  useEffect(() => {
    if (!job || status !== 'generating') return
    stopTimers()

    const poll = async () => {
      try {
        const res = await fetch(`/jobs/${job.jobId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'done') {
          stopTimers()
          setStatus('done')
          localStorage.removeItem(STORAGE_KEY)
          autoRef.current = setTimeout(dismiss, 30_000)
        } else if (data.status === 'failed') {
          stopTimers()
          setStatus('failed')
          localStorage.removeItem(STORAGE_KEY)
          autoRef.current = setTimeout(dismiss, 10_000)
        }
      } catch {}
    }

    tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    pollRef.current = setInterval(poll, 5000)
    void poll()

    return stopTimers
  }, [job?.jobId, status])

  // Always hidden on the Factory page — MemeCreator shows status inline there
  if (!job || pathname === '/factory') return null

  if (status === 'done') {
    return (
      <div className="jtp jtp--done">
        <img className="jtp-thumb" src={imageUrl(job.jobId)} alt="" />
        <div className="jtp-body">
          <span className="jtp-title">Your meme is ready!</span>
          <button
            className="jtp-action"
            onClick={() => { navigate(`/memes/factory/${job.jobId}`); dismiss() }}
          >
            View →
          </button>
        </div>
        <button className="jtp-x" onClick={dismiss}>✕</button>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="jtp jtp--failed">
        <span className="jtp-icon">⚠</span>
        <div className="jtp-body">
          <span className="jtp-title">Generation failed</span>
          <button className="jtp-action" onClick={() => { navigate('/factory'); dismiss() }}>
            Try again →
          </button>
        </div>
        <button className="jtp-x" onClick={dismiss}>✕</button>
      </div>
    )
  }

  return (
    <div className="jtp jtp--generating">
      <span className="jtp-spinner" />
      <div className="jtp-body">
        <span className="jtp-title">Generating meme…</span>
        <span className="jtp-elapsed">{fmt(elapsed)}</span>
      </div>
      <button
        className="jtp-x"
        onClick={dismiss}
        title="Dismiss (job keeps running in the background)"
      >✕</button>
    </div>
  )
}
