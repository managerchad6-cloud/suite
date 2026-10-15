import '../video.css'
import { useState, useRef, useEffect, useCallback } from 'react'
import { CHARACTERS, EXTENDED_CAST, type CharData } from '../data/characterLore'
import {
  initVideo, getVideoJob, triggerSceneGeneration, regenAudioLine,
  patchScene, publishVideo, startExport, getExportStatus, getExportDownloadUrl,
  type VideoJob, type SceneData, type DialogueTurn,
} from '../api/video'
import { VideoCanvas, type VideoCanvasHandle } from '../components/VideoCanvas'

const ALL_CHARS = [...CHARACTERS, ...EXTENDED_CAST]

// ─── @ mention autocomplete ───────────────────────────────────────────────────

function CharMentionPopover({ query, onSelect }: {
  query: string
  onSelect: (c: CharData) => void
}) {
  const results = ALL_CHARS.filter(c =>
    c.key.startsWith(query.toLowerCase()) || c.name.toLowerCase().startsWith(query.toLowerCase())
  ).slice(0, 8)

  if (!results.length) return null
  return (
    <div className="vs-mention-popover">
      {results.map(c => (
        <button key={c.key} className="vs-mention-item" onClick={() => onSelect(c)}>
          <img src={`/assets/chars/${c.file}.${c.ext ?? 'png'}`} alt={c.name} className="vs-mention-avatar" />
          <span className="vs-mention-name">{c.name}</span>
          <span className="vs-mention-tier">{c.tier}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Prompt Screen ────────────────────────────────────────────────────────────

function PromptScreen({ address, onSubmit }: {
  address: string
  onSubmit: (prompt: string, chars: CharData[]) => void
}) {
  const [text, setText]       = useState('')
  const [chars, setChars]     = useState<CharData[]>([])
  const [mention, setMention] = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)
    const atMatch = val.match(/@(\w*)$/)
    setMention(atMatch ? atMatch[1] : null)
  }

  function handleSelectChar(c: CharData) {
    if (!chars.find(x => x.key === c.key)) setChars(prev => [...prev, c])
    setText(prev => prev.replace(/@\w*$/, `@${c.name} `))
    setMention(null)
  }

  function removeChar(key: string) { setChars(prev => prev.filter(c => c.key !== key)) }

  async function handleSubmit() {
    if (!text.trim()) return
    setBusy(true)
    onSubmit(text, chars)
  }

  return (
    <div className="vs-prompt-screen">
      <div className="vs-prompt-inner">
        <h1 className="vs-prompt-title">VVC Video</h1>
        <p className="vs-prompt-sub">Write a prompt. Attach characters with <code>@name</code> or <kbd>+</kbd></p>

        <div className="vs-prompt-input-wrap">
          <textarea
            className="vs-prompt-textarea"
            placeholder="virgin goes on a date with @stacy and it goes exactly how you'd expect..."
            value={text}
            onChange={handleInput}
            rows={4}
            disabled={busy}
          />
          {mention !== null && (
            <CharMentionPopover query={mention} onSelect={handleSelectChar} />
          )}
        </div>

        {chars.length > 0 && (
          <div className="vs-char-chips">
            {chars.map(c => (
              <div key={c.key} className="vs-char-chip">
                <img src={`/assets/chars/${c.file}.${c.ext ?? 'png'}`} alt={c.name} />
                <span>{c.name}</span>
                <button onClick={() => removeChar(c.key)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="vs-prompt-actions">
          <button
            className="vs-prompt-browse"
            onClick={() => {/* open cast browser */}}
            disabled={busy}
          >+ Cast</button>
          <button
            className="vs-prompt-submit"
            onClick={handleSubmit}
            disabled={busy || !text.trim()}
          >{busy ? 'Writing your story…' : '→ Generate'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Scene status badge ───────────────────────────────────────────────────────

function SceneStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending:    '○ Pending',
    generating: '◌ Generating…',
    done:       '● Ready',
    failed:     '✕ Failed',
  }
  return (
    <span className={`vs-scene-badge vs-scene-badge--${status}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ─── Dialogue editor ──────────────────────────────────────────────────────────

function DialogueEditor({ sceneData, jobId, sceneIndex, onChange }: {
  sceneData: SceneData
  jobId: string
  sceneIndex: number
  onChange: (updated: SceneData) => void
}) {
  const [regenIdx, setRegenIdx] = useState<number | null>(null)

  async function handleTextChange(turnIdx: number, newText: string) {
    const updated = {
      ...sceneData,
      dialogue: sceneData.dialogue.map((d, i) => i === turnIdx ? { ...d, text: newText } : d),
    }
    onChange(updated)
  }

  async function handleRegen(turn: DialogueTurn, idx: number) {
    setRegenIdx(idx)
    try {
      const result = await regenAudioLine(jobId, sceneIndex, {
        turn_index: turn.turn,
        text: turn.text,
        speaker: turn.speaker,
      })
      // Update audio_cues duration
      const updated: SceneData = {
        ...sceneData,
        audio_cues: sceneData.audio_cues.map(c =>
          c.turn === turn.turn ? { ...c, duration_s: result.duration_s } : c
        ),
      }
      onChange(updated)
      await patchScene(jobId, sceneIndex, { audio_cues: updated.audio_cues })
    } finally {
      setRegenIdx(null)
    }
  }

  return (
    <div className="vs-dialogue-editor">
      {sceneData.dialogue.map((turn, idx) => (
        <div key={turn.turn} className={`vs-dialogue-turn vs-dialogue-turn--${turn.speaker}`}>
          <div className="vs-dialogue-turn-header">
            <span className="vs-dialogue-speaker">{turn.speaker}</span>
            <span className="vs-dialogue-emotion">{turn.emotion}</span>
            {turn.is_inner_thought && <span className="vs-inner-thought-tag">💭 inner</span>}
          </div>
          <div className="vs-dialogue-turn-body">
            <textarea
              className="vs-dialogue-text"
              value={turn.text}
              rows={2}
              onChange={e => handleTextChange(idx, e.target.value)}
            />
            <button
              className="vs-regen-btn"
              onClick={() => handleRegen(turn, idx)}
              disabled={regenIdx === idx}
              title="Regenerate audio for this line"
            >{regenIdx === idx ? '…' : '🔊'}</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Cut list editor ──────────────────────────────────────────────────────────

function CutListEditor({ sceneData, onChange }: {
  sceneData: SceneData
  onChange: (updated: SceneData) => void
}) {
  const totalFrames = sceneData.total_frames

  return (
    <div className="vs-cutlist">
      <div className="vs-cutlist-header">
        <span>Cut List</span>
        <span className="vs-cutlist-duration">{sceneData.duration_seconds.toFixed(1)}s</span>
      </div>
      <div className="vs-cutlist-timeline">
        {sceneData.cut_list.map((cut, i) => {
          const widthPct = ((cut.end_frame - cut.start_frame) / totalFrames) * 100
          const leftPct  = (cut.start_frame / totalFrames) * 100
          return (
            <div
              key={i}
              className="vs-cutlist-segment"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              title={`${cut.shot_id} [${cut.start_frame}–${cut.end_frame}]`}
            >
              <span className="vs-cutlist-label">{cut.shot_id.replace('_', ' ')}</span>
            </div>
          )
        })}
      </div>
      <div className="vs-cutlist-shots">
        {sceneData.cut_list.map((cut, i) => (
          <div key={i} className="vs-cutlist-row">
            <select
              value={cut.shot_id}
              onChange={e => {
                const updated = { ...sceneData, cut_list: sceneData.cut_list.map((c, j) => j === i ? { ...c, shot_id: e.target.value } : c) }
                onChange(updated)
              }}
            >
              {Object.keys(sceneData.shots).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="vs-cut-frames">{cut.start_frame}–{cut.end_frame}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main VideoStudio ─────────────────────────────────────────────────────────

export function VideoStudio({ address }: { address: string }) {
  const [phase, setPhase]         = useState<'prompt' | 'editor'>('prompt')
  const [job,   setJob]           = useState<VideoJob | null>(null)
  const [activeScene, setActiveScene] = useState<number>(0)
  const [localSceneData, setLocalSceneData] = useState<Record<number, SceneData>>({})
  const [playing, setPlaying]     = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [exporting, setExporting]  = useState(false)
  const [exportId, setExportId]    = useState<string | null>(null)
  const [exportDone, setExportDone] = useState(false)
  const canvasRef = useRef<VideoCanvasHandle>(null)
  const pollRef   = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // Poll job status
  const pollJob = useCallback(async (jobId: string) => {
    try {
      const updated = await getVideoJob(jobId)
      setJob(updated)
    } catch {}
  }, [])

  useEffect(() => {
    if (!job?.id) return
    const needsPoll = job.status !== 'breakdown_done' ||
      job.scenes.some(s => s.status === 'generating')
    if (needsPoll) {
      pollRef.current = setInterval(() => pollJob(job.id), 2500)
    }
    return () => clearInterval(pollRef.current)
  }, [job, pollJob])

  // Auto-start first scene generation when breakdown is ready
  useEffect(() => {
    if (!job || job.status !== 'breakdown_done') return
    const firstPending = job.scenes.find(s => s.status === 'pending')
    if (firstPending && firstPending.scene_index === 0) {
      void handleGenerateScene(0)
    }
  }, [job?.status])

  async function handlePromptSubmit(prompt: string, chars: CharData[]) {
    const { job_id } = await initVideo({
      prompt,
      characters: chars.map(c => ({
        key: c.key, name: c.name, tier: c.tier, file: c.file, ext: c.ext ?? 'png',
        lore: c.lore, traits: c.traits, tagline: c.tagline, usedFor: c.usedFor,
      })),
      wallet: address,
    })
    const jobData = await getVideoJob(job_id)
    setJob(jobData)
    setPhase('editor')
  }

  async function handleGenerateScene(sceneIndex: number) {
    if (!job) return
    await triggerSceneGeneration(job.id, sceneIndex)
    setJob(prev => prev ? {
      ...prev,
      scenes: prev.scenes.map(s => s.scene_index === sceneIndex ? { ...s, status: 'generating' } : s),
    } : prev)
  }

  function getSceneData(sceneIndex: number): SceneData | null {
    if (localSceneData[sceneIndex]) return localSceneData[sceneIndex]
    return job?.scenes.find(s => s.scene_index === sceneIndex)?.data ?? null
  }

  async function handleSceneDataChange(sceneIndex: number, data: SceneData) {
    setLocalSceneData(prev => ({ ...prev, [sceneIndex]: data }))
    await patchScene(job!.id, sceneIndex, data)
  }

  async function handlePublish() {
    if (!job) return
    setPublishing(true)
    try {
      const breakdown = job.breakdown
      await publishVideo(job.id, address, breakdown?.title ?? 'Untitled')
    } finally {
      setPublishing(false)
    }
  }

  async function handleExport() {
    if (!job) return
    setExporting(true)
    try {
      const { export_id } = await startExport(job.id)
      setExportId(export_id)
      const poll = setInterval(async () => {
        const st = await getExportStatus(export_id)
        if (st.status === 'done') {
          clearInterval(poll)
          setExportDone(true)
          setExporting(false)
        } else if (st.status === 'failed') {
          clearInterval(poll)
          setExporting(false)
        }
      }, 3000)
    } catch {
      setExporting(false)
    }
  }

  const activeSceneObj = job?.scenes.find(s => s.scene_index === activeScene)
  const activeData     = getSceneData(activeScene)
  const allDone        = job?.scenes.every(s => s.status === 'done')
  const totalSeconds   = job?.scenes.reduce((a, s) => a + (getSceneData(s.scene_index)?.duration_seconds ?? 0), 0) ?? 0

  if (phase === 'prompt') {
    return <PromptScreen address={address} onSubmit={handlePromptSubmit} />
  }

  return (
    <div className="vs-editor">
      {/* ── Left: scene list ── */}
      <div className="vs-scene-list">
        <div className="vs-scene-list-header">
          <span>{job?.breakdown?.title ?? 'Untitled'}</span>
          <span className="vs-total-dur">{totalSeconds.toFixed(1)}s</span>
        </div>

        {job?.status !== 'breakdown_done' ? (
          <div className="vs-generating" style={{ padding: '24px 14px' }}>
            <div className="vs-spinner" />
            <p style={{ fontSize: '0.82rem', color: '#666', textAlign: 'center' }}>Writing your story…</p>
          </div>
        ) : (job?.scenes ?? []).map(scene => {
          const bd = job?.breakdown?.scenes.find(s => s.scene_index === scene.scene_index)
          return (
            <button
              key={scene.scene_index}
              className={`vs-scene-item ${activeScene === scene.scene_index ? 'active' : ''}`}
              onClick={() => { setActiveScene(scene.scene_index); setPlaying(false) }}
            >
              <div className="vs-scene-item-top">
                <span className="vs-scene-num">Scene {scene.scene_index + 1}</span>
                <SceneStatusBadge status={scene.status} />
              </div>
              {bd && (
                <div className="vs-scene-item-meta">
                  <span className="vs-scene-role">{bd.narrative_role}</span>
                  <span className="vs-scene-setting">{bd.setting_id.replace(/_/g, ' ')}</span>
                </div>
              )}
            </button>
          )
        })}

        <button
          className="vs-add-scene"
          onClick={() => {/* TODO: manual add scene */}}
        >+ Add Scene</button>
      </div>

      {/* ── Center: scene editor ── */}
      <div className="vs-scene-editor">
        {job?.status !== 'breakdown_done' && (
          <div className="vs-generating">
            <div className="vs-spinner" />
            <p>Writing your script…</p>
          </div>
        )}

        {job?.status === 'breakdown_done' && activeSceneObj?.status === 'pending' && (
          <div className="vs-generate-prompt">
            <p>Scene {activeScene + 1} not generated yet</p>
            <button className="vs-generate-btn" onClick={() => handleGenerateScene(activeScene)}>
              Generate Scene {activeScene + 1}
            </button>
          </div>
        )}

        {job?.status === 'breakdown_done' && activeSceneObj?.status === 'generating' && (
          <div className="vs-generating">
            <div className="vs-spinner" />
            <p>Generating scene assets — shots, layers, audio…</p>
          </div>
        )}

        {job?.status === 'breakdown_done' && activeSceneObj?.status === 'failed' && (
          <div className="vs-generate-prompt">
            <p>Generation failed</p>
            <button className="vs-generate-btn" onClick={() => handleGenerateScene(activeScene)}>
              Retry
            </button>
          </div>
        )}

        {job?.status === 'breakdown_done' && activeSceneObj?.status === 'done' && activeData && (
          <>
            <div className="vs-editor-section-title">Dialogue</div>
            <DialogueEditor
              sceneData={activeData}
              jobId={job!.id}
              sceneIndex={activeScene}
              onChange={d => handleSceneDataChange(activeScene, d)}
            />
            <div className="vs-editor-section-title">Cut List</div>
            <CutListEditor
              sceneData={activeData}
              onChange={d => handleSceneDataChange(activeScene, d)}
            />
          </>
        )}
      </div>

      {/* ── Right: canvas preview ── */}
      <div className="vs-preview-panel">
        <div className="vs-preview-header">
          {activeSceneObj?.status === 'done' && activeData && (
            <>
              <button className="vs-play-btn" onClick={() => setPlaying(p => !p)}>
                {playing ? '⏸' : '▶'}
              </button>
              <span className="vs-frame-counter">
                {currentFrame} / {activeData.total_frames} ({(currentFrame / 25).toFixed(1)}s)
              </span>
            </>
          )}
        </div>

        <div className="vs-canvas-wrap">
          {activeSceneObj?.status === 'done' && activeData ? (
            <VideoCanvas
              ref={canvasRef}
              jobId={job!.id}
              sceneData={activeData}
              sceneIndex={activeScene}
              playing={playing}
              onFrameChange={setCurrentFrame}
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <div className="vs-canvas-placeholder">
              {activeSceneObj?.status === 'generating' ? '⟳' : '▶'}
            </div>
          )}
        </div>

        {activeSceneObj?.status === 'done' && activeData && (
          <div className="vs-scrubber">
            <input
              type="range"
              min={0}
              max={activeData.total_frames - 1}
              value={currentFrame}
              onChange={e => {
                setPlaying(false)
                canvasRef.current?.seek(parseInt(e.target.value, 10))
              }}
            />
          </div>
        )}

        <div className="vs-preview-footer">
          <button
            className="vs-next-btn"
            disabled={!activeSceneObj || activeSceneObj.status !== 'done'}
            onClick={() => {
              const nextIdx = activeScene + 1
              const nextScene = job?.scenes.find(s => s.scene_index === nextIdx)
              if (nextScene) {
                setActiveScene(nextIdx)
                setPlaying(false)
                if (nextScene.status === 'pending') handleGenerateScene(nextIdx)
              }
            }}
          >→ Next Scene</button>

          {allDone && (
            <div className="vs-finish-actions">
              <button
                className="vs-publish-btn"
                onClick={handlePublish}
                disabled={publishing}
              >{publishing ? 'Publishing…' : 'Publish'}</button>
              <button
                className="vs-export-btn"
                onClick={handleExport}
                disabled={exporting}
              >{exporting ? 'Exporting…' : 'Export MP4'}</button>
              {exportDone && exportId && (
                <a className="vs-download-link" href={getExportDownloadUrl(exportId)} download>
                  ↓ Download
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
