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

export async function generateRaw(
  virgin: string,
  chad: string,
  wallet?: string,
  signature?: string,
  virgin_labels?: string[],
  chad_labels?: string[],
  tx_signature?: string,
): Promise<{ job_id: string; status: string }> {
  const res = await fetch(`${BASE}/generate/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ virgin, chad, wallet, signature, virgin_labels, chad_labels, tx_signature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Submit failed: ${res.status}`);
  }
  return res.json();
}

export async function generateFreestyle(
  text: string,
  wallet?: string,
  signature?: string,
  tx_signature?: string,
): Promise<{ job_id: string; status: string; parsed?: unknown }> {
  const res = await fetch(`${BASE}/generate/freestyle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, wallet, signature, tx_signature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.detail === 'string'
        ? err.detail
        : `Submit failed: ${res.status}`
    );
  }
  return res.json();
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

export async function parse(text: string): Promise<{
  virgin: string
  chad: string
  virgin_labels: string[]
  chad_labels: string[]
}> {
  const res = await fetch(`${BASE}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      typeof err.detail === 'string'
        ? err.detail
        : 'Could not parse your idea. Try being more specific.'
    )
  }
  return res.json()
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

export async function submitVote(
  job_id: string,
  wallet: string,
  signature: string
): Promise<{ job_id: string; vote_count: number; already_voted: boolean }> {
  const res = await fetch(`${BASE}/jobs/${job_id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Vote failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchLeaderboard(limit = 15): Promise<LeaderboardResponse> {
  const res = await fetch(`${BASE}/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

export function parseMemeId(id: string | null): { virgin: string; chad: string } {
  if (!id) return { virgin: 'Virgin', chad: 'Chad' };
  const m = id.match(/^virgin_(.+)_vs_chad_(.+)$/);
  if (!m) return { virgin: 'Virgin', chad: 'Chad' };
  const toTitle = (s: string) =>
    s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { virgin: toTitle(m[1]), chad: toTitle(m[2]) };
}
