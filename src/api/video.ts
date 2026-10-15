const BASE = 'http://localhost:3017'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CharacterInput {
  key: string
  name: string
  tier: string
  lore: string
  traits: string[]
  tagline: string
  usedFor: string
}

export interface DialogueTurn {
  turn: number
  speaker: string
  text: string
  emotion: string
  is_inner_thought?: boolean
}

export interface SceneMeta {
  scene_index: number
  setting_id: string
  setting_description: string
  characters_present: string[]
  mood: string
  narrative_role: string
  shot_types: string[]
  dialogue: DialogueTurn[]
}

export interface CharacterBibleEntry {
  name: string
  appearance: string
  voice_character: string
  spectrum_position: string
}

export interface VideoBreakdown {
  title: string
  logline: string
  character_bible: Record<string, CharacterBibleEntry>
  scenes: SceneMeta[]
}

export interface LayerDef {
  id: string
  file: string
  z_index: number
  position?: [number, number]
  scale?: [number, number]
  keyframes?: Array<{ frame: number; property: string; value: number; easing?: string }>
  rotation?: string | null
}

export interface CutEntry {
  shot_id: string
  start_frame: number
  end_frame: number
  transition: 'cut' | 'dissolve'
}

export interface AudioCue {
  turn: number
  file: string
  start_frame: number
  speaker: string
  duration_s?: number
}

export interface ExpressionEvent {
  frame: number
  character: string
  emotion: string
  file: string
}

export interface WiggleAssignment {
  layer_id: string
  start_frame: number
  end_frame: number
  expression: string
}

export interface SkinDef {
  character: string
  emotion: string
  file: string
}

export interface SceneData {
  scene_index: number
  setting_id: string
  setting_description: string
  fps: number
  total_frames: number
  duration_seconds: number
  shots: Record<string, { file: string }>
  cut_list: CutEntry[]
  layer_stack: LayerDef[]
  expression_events: ExpressionEvent[]
  wiggle_assignments: WiggleAssignment[]
  audio_track: AudioCue[]
  audio_cues: AudioCue[]
  skins: SkinDef[]
  characters: string[]
  dialogue: DialogueTurn[]
}

export interface VideoScene {
  id: string
  job_id: string
  scene_index: number
  status: 'pending' | 'generating' | 'done' | 'failed'
  data: SceneData | null
  created_at: string
  updated_at: string
}

export interface VideoJob {
  id: string
  wallet: string
  prompt: string
  status: string
  breakdown: VideoBreakdown | null
  scenes: VideoScene[]
  created_at: string
  updated_at: string
}

export interface PublishedVideo {
  id: string
  job_id: string
  wallet: string
  title: string
  scene_count: number
  duration_s: number
  created_at: string
  vote_count?: number
  scenes?: VideoScene[]
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function initVideo(params: {
  prompt: string
  characters: CharacterInput[]
  wallet: string
}): Promise<{ job_id: string; status: string }> {
  const r = await fetch(`${BASE}/video/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getVideoJob(jobId: string): Promise<VideoJob> {
  const r = await fetch(`${BASE}/video/jobs/${jobId}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function triggerSceneGeneration(jobId: string, sceneIndex: number): Promise<void> {
  const r = await fetch(`${BASE}/video/jobs/${jobId}/scene/${sceneIndex}`, { method: 'POST' })
  if (!r.ok) throw new Error(await r.text())
}

export async function getScene(jobId: string, sceneIndex: number): Promise<VideoScene> {
  const r = await fetch(`${BASE}/video/jobs/${jobId}/scene/${sceneIndex}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function patchScene(jobId: string, sceneIndex: number, patch: Partial<SceneData>): Promise<void> {
  const r = await fetch(`${BASE}/video/jobs/${jobId}/scene/${sceneIndex}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error(await r.text())
}

export async function regenAudioLine(jobId: string, sceneIndex: number, params: {
  turn_index: number
  text: string
  speaker: string
}): Promise<{ file: string; duration_s: number }> {
  const r = await fetch(`${BASE}/video/jobs/${jobId}/scene/${sceneIndex}/regen-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function publishVideo(jobId: string, wallet: string, title: string): Promise<{ video_id: string }> {
  const r = await fetch(`${BASE}/video/publish/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, title }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getCommunityFeed(params?: { limit?: number; offset?: number }): Promise<{
  videos: PublishedVideo[]
  limit: number
  offset: number
}> {
  const qs = new URLSearchParams()
  if (params?.limit)  qs.set('limit',  String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const r = await fetch(`${BASE}/videos?${qs}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getPublishedVideo(videoId: string): Promise<PublishedVideo> {
  const r = await fetch(`${BASE}/videos/${videoId}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function voteVideo(videoId: string, wallet: string, direction: 1 | -1): Promise<{ votes: number }> {
  const r = await fetch(`${BASE}/videos/${videoId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, direction }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function startExport(jobId: string): Promise<{ export_id: string; status: string }> {
  const r = await fetch(`${BASE}/video/export/${jobId}`, { method: 'POST' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getExportStatus(exportId: string): Promise<{ status: string; file_path?: string }> {
  const r = await fetch(`${BASE}/video/export/${exportId}/status`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export function getExportDownloadUrl(exportId: string): string {
  return `${BASE}/video/export/${exportId}/file`
}

export function getAssetUrl(jobId: string, sceneIndex: number, file: string): string {
  return `${BASE}/jobs/${jobId}/scene_${sceneIndex}/${file}`
}
