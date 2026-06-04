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

export async function saveSkin(params: {
  wallet: string
  char_key: string
  char_name: string
  prompt: string
  skin_type: SkinRecord['skin_type']
  imageDataUrl: string
}): Promise<string | null> {
  try {
    const res = await fetch('/api/skins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[skin] POST /api/skins failed', res.status, body)
      return null
    }
    const data = await res.json()
    return data.id ?? null
  } catch (e) {
    console.warn('[skin] fetch error', e)
    return null
  }
}
