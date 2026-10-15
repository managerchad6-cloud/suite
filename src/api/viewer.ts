import { api } from './client'

const BASE = ''

export interface Video {
  file: string
  title: string
  id: string
  arc: string
  cls?: string
  available: boolean
  votes: number
}

export interface RoadmapItem {
  id: string
  title: string
  votes: number
  description?: string
}

export async function getRanks(): Promise<Video[]> {
  const res = await fetch(`${BASE}/api/ranks`)
  if (!res.ok) throw new Error('Failed to fetch ranks')
  return (await res.json()).ranks ?? []
}

/** The signed-in member's video vote (null for guests). */
export async function getMyVideoVote(): Promise<string | null> {
  try { return (await api<{ votedFor: string | null }>(`${BASE}/api/vote/mine`)).votedFor ?? null } catch { return null }
}

// Votes are cast as the signed-in member (session cookie), not by a per-vote wallet signature.
export function voteVideo(videoFile: string) {
  return api(`${BASE}/api/vote`, { method: 'POST', body: { videoFile } })
}

export async function getRoadmap(): Promise<RoadmapItem[]> {
  const res = await fetch(`${BASE}/api/roadmap`)
  if (!res.ok) throw new Error('Failed to fetch roadmap')
  return (await res.json()).items ?? []
}

/** The signed-in member's roadmap votes ([] for guests). */
export async function getMyRoadmapVotes(): Promise<string[]> {
  try { return (await api<{ voted: string[] }>(`${BASE}/api/roadmap/mine`)).voted ?? [] } catch { return [] }
}

export function voteRoadmap(itemId: string) {
  return api(`${BASE}/api/roadmap/vote`, { method: 'POST', body: { itemId } })
}
