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

export async function getMyVideoVote(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/votes/${address}`)
    if (!res.ok) return null
    return (await res.json()).votedFor ?? null
  } catch { return null }
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

export async function getMyRoadmapVotes(address: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/api/roadmap/votes/${address}`)
    if (!res.ok) return []
    return (await res.json()).voted ?? []
  } catch { return [] }
}

export function voteRoadmap(itemId: string) {
  return api(`${BASE}/api/roadmap/vote`, { method: 'POST', body: { itemId } })
}
