import { api } from './client'

const BASE = '';

export interface JobStatus {
  job_id: string;
  status: 'processing' | 'done' | 'failed';
  error?: string | null;
}

export interface JobMetadata {
  job_id: string;
  id: string;
  virgin_labels: string[];
  chad_labels: string[];
}

export interface Meme {
  job_id: string;
  meme_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  wallet: string | null;
  vote_count: number;
  // hand-made meme fields
  type?: 'ai' | 'handmade';
  characters?: string[];
}

export interface LeaderboardEntry {
  job_id: string;
  meme_id: string | null;
  wallet: string;
  vote_count: number;
  created_at: string;
}

export interface LeaderboardResponse {
  items: LeaderboardEntry[];
}

export interface MemesResponse {
  items: Meme[];
  total: number;
  page: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}

/** How a generation is paid: memestudio credits (a single-use token) or a USDC transaction. */
export type MemePayment = { credit_token: { wallet: string; ts: number; sig: string } } | { tx_signature: string }

// Generation acts as the signed-in member (session); the payment must be theirs too.
export function generateRaw(
  virgin: string,
  chad: string,
  payment: MemePayment,
  virgin_labels?: string[],
  chad_labels?: string[],
): Promise<{ job_id: string; status: string }> {
  return api(`${BASE}/generate/raw`, { method: 'POST', body: { virgin, chad, virgin_labels, chad_labels, ...payment } })
}

export function generateFreestyle(
  text: string,
  payment: MemePayment,
): Promise<{ job_id: string; status: string; parsed?: unknown }> {
  return api(`${BASE}/generate/freestyle`, { method: 'POST', body: { text, ...payment } })
}

export async function pollJob(job_id: string): Promise<JobStatus> {
  const res = await fetch(`${BASE}/jobs/${job_id}`);
  if (!res.ok) throw new Error('Job not found');
  return res.json();
}

export async function fetchMetadata(job_id: string): Promise<JobMetadata | null> {
  try {
    const res = await fetch(`${BASE}/jobs/${job_id}/metadata`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function imageUrl(job_id: string): string {
  return `${BASE}/jobs/${job_id}/image`;
}

export function handmadeImageUrl(job_id: string): string {
  return `${BASE}/handmade/${job_id}/image`;
}

export async function publishHandmade(params: {
  imageDataUrl: string;
  characters: string[];
  titles?: string[];
  labels?: string[];
  labelLinks?: { text: string; charKey: string | null }[];
  draftId?: string;
  remixedFrom?: string;
  draftPayloadInline?: unknown;
}): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/publish/handmade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Publish failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchMemesByCharacter(charKey: string): Promise<Meme[]> {
  try {
    const res = await fetch(`${BASE}/memes?character=${encodeURIComponent(charKey)}&status=done&limit=50`);
    if (!res.ok) return [];
    const data: MemesResponse = await res.json();
    return data.items;
  } catch {
    return [];
  }
}

/** Split free text into archetypes + labels (members only: it costs an LLM call). */
export function parse(text: string): Promise<{
  virgin: string
  chad: string
  virgin_labels: string[]
  chad_labels: string[]
}> {
  return api(`${BASE}/parse`, { method: 'POST', body: { text } })
}

export function buildTweetUrl(virgin: string, chad: string): string {
  const text = [
    `Virgin ${virgin} vs Chad ${chad}`,
    '',
    'Created with the $VVC Meme Factory.',
    '',
    'Create memes, get paid.',
    '',
    '#VirginVsChad #Memes $VVC',
  ].join('\n')
  const url = 'https://virginvschad.vip/memes'
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
}

export async function fetchMemes(page = 1, limit = 40): Promise<MemesResponse> {
  const res = await fetch(`${BASE}/memes?page=${page}&limit=${limit}&status=done`);
  if (!res.ok) throw new Error('Failed to fetch memes');
  return res.json();
}

export async function fetchMemesByWallet(wallet: string, limit = 100): Promise<Meme[]> {
  // Try backend wallet filter first; fall back to client-side filter
  const res = await fetch(`${BASE}/memes?limit=${limit}&status=done&wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) throw new Error('Failed to fetch memes');
  const data: MemesResponse = await res.json();
  // If backend doesn't support wallet filter it returns all — filter client-side
  return data.items.filter(m => m.wallet === wallet);
}

// The vote is cast as the signed-in member (session cookie), not by a per-vote wallet signature.
export function submitVote(job_id: string): Promise<{ job_id: string; vote_count: number; already_voted: boolean }> {
  return api(`${BASE}/jobs/${encodeURIComponent(job_id)}/vote`, { method: 'POST' })
}

export async function fetchLeaderboard(limit = 15): Promise<LeaderboardResponse> {
  const res = await fetch(`${BASE}/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

// ─── Draft API ───────────────────────────────────────────────────────────────

export interface DraftMeta {
  id: string
  wallet: string
  title: string
  thumbnail: string   // base64 JPEG data URL
  updatedAt: string
  canvasW: number
  canvasH: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DraftPayload extends DraftMeta {
  layers: any[]
  transforms: Record<string, any>
  bboxes: Record<string, any>
  textLayers: Record<string, any>
  charLayers: Record<string, any>
  polyLayers: Record<string, any>
  canvasData: Record<string, string>
  inActionSnapshots: Record<string, string>
  inActionHasSnapshot: Record<string, boolean>
}

// Drafts are the signed-in member's own: no wallet in requests, the session decides.
export function saveDraft(payload: Omit<DraftPayload, 'wallet'> & { wallet?: string }): Promise<{ id: string }> {
  return api(`${BASE}/drafts`, { method: 'POST', body: payload })
}

export function listDrafts(): Promise<DraftMeta[]> {
  return api(`${BASE}/drafts`)
}

export function fetchDraft(id: string): Promise<DraftPayload> {
  return api(`${BASE}/drafts/${encodeURIComponent(id)}`)
}

export async function deleteDraftById(id: string): Promise<void> {
  await api(`${BASE}/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ─── parseMemeId ─────────────────────────────────────────────────────────────

export function parseMemeId(id: string | null): { virgin: string; chad: string } {
  if (!id) return { virgin: 'Virgin', chad: 'Chad' };
  const m = id.match(/^virgin_(.+)_vs_chad_(.+)$/);
  if (!m) return { virgin: 'Virgin', chad: 'Chad' };
  const toTitle = (s: string) =>
    s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { virgin: toTitle(m[1]), chad: toTitle(m[2]) };
}
