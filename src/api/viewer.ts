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

export async function voteVideo(address: string, videoFile: string, signature: string) {
  const res = await fetch(`${BASE}/api/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, videoFile, signature }),
  })
  if (!res.ok) throw new Error('Vote failed')
  return res.json()
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

export async function voteRoadmap(address: string, itemId: string, signature: string) {
  const res = await fetch(`${BASE}/api/roadmap/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, itemId, signature }),
  })
  if (!res.ok) throw new Error('Vote failed')
  return res.json()
}
