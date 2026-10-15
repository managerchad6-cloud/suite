import { api } from './client'

export interface SkinRecord {
  id: string
  wallet: string
  char_key: string
  char_name: string
  prompt: string
  skin_type: 'reskin' | 'edit' | 'inaction_prop' | 'inaction_context' | 'inaction_scene'
  created_at: string
}

export function skinImageUrl(id: string): string {
  return `/api/skins/${encodeURIComponent(id)}/image`
}

export async function fetchCharSkins(
  charKey: string,
  search = '',
  offset = 0,
  limit = 40,
): Promise<{ items: SkinRecord[]; total: number; has_more: boolean }> {
  const q = new URLSearchParams({
    search,
    offset: String(offset),
    limit: String(limit),
  })
  const res = await fetch(`/api/skins/${encodeURIComponent(charKey)}/list?${q}`)
  if (!res.ok) return { items: [], total: 0, has_more: false }
  return res.json()
}

/** Save an AI skin to the shared databank, as the signed-in member. */
export async function saveSkin(params: {
  char_key: string
  char_name: string
  prompt: string
  skin_type: SkinRecord['skin_type']
  imageDataUrl: string
}): Promise<string | null> {
  try {
    return (await api<{ id?: string }>('/api/skins', { method: 'POST', body: params })).id ?? null
  } catch (e) {
    console.warn('[skin] save failed', e)
    return null
  }
}
