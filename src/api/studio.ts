const BASE = ''

export interface StudioMeme {
  id: string
  wallet: string
  characters: string[]
  titles: string[]
  labels?: string[]
  labelLinks?: { text: string; charKey: string | null }[]
  created_at: string
  type: 'handmade'
}

export interface StudioMemesResponse {
  items: StudioMeme[]
  total: number
  page: number
  limit: number
  has_next: boolean
  has_prev: boolean
}

export function studioMemeImageUrl(id: string): string {
  return `${BASE}/handmade/${id}/image`
}

export async function fetchStudioMeme(id: string): Promise<StudioMeme> {
  const res = await fetch(`${BASE}/studio/memes/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Fetch meme failed: ${res.status}`)
  return res.json()
}

export async function fetchGalleryMemes(page = 1, limit = 40): Promise<StudioMemesResponse> {
  const res = await fetch(`${BASE}/studio/memes?page=${page}&limit=${limit}`)
  if (!res.ok) throw new Error(`Fetch gallery failed: ${res.status}`)
  return res.json()
}

export async function deleteStudioMeme(id: string, wallet: string): Promise<void> {
  const res = await fetch(`${BASE}/studio/memes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) throw new Error(`Delete meme failed: ${res.status}`)
}

export async function fetchStudioMemesByWallet(wallet: string, limit = 100): Promise<StudioMeme[]> {
  const res = await fetch(`${BASE}/studio/memes?wallet=${encodeURIComponent(wallet)}&limit=${limit}`)
  if (!res.ok) throw new Error(`Fetch studio memes failed: ${res.status}`)
  const data: StudioMemesResponse = await res.json()
  return data.items
}
