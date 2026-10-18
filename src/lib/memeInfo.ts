// What we know about a meme, the same shape whatever made it (Factory, Studio, meme bank), plus
// the tier ladder. Shared by the meme page and the feed.
import { useEffect, useState } from 'react'
import { fetchStudioMeme, type StudioMeme } from '../api/studio'
import { fetchMetadata, parseMemeId, type JobMetadata } from '../api/memes'
import type { MemeSourceType, MemeTier } from '../types/unified'

// ── What we know about the meme, the same shape whatever made it ─────────────

export interface Side { name: string; labels: string[]; char?: string }

export interface MemeInfo {
  /** Two sides for a matchup (Virgin X vs Chad Y), or one per character for Studio memes */
  sides: Side[]
  /** One-line title for sharing and the tab */
  title: string
  wallet: string | null
  createdAt: string | null
  characters: string[]
  remixedFrom: { id: string; title: string | null } | null
  hasDraft: boolean
}

export const EMPTY: MemeInfo = { sides: [], title: '', wallet: null, createdAt: null, characters: [], remixedFrom: null, hasDraft: false }
export const pretty = (s: string) => s.replace(/_/g, ' ')

export function fromStudio(m: StudioMeme): MemeInfo {
  const byChar = new Map<string, string[]>()
  for (const { text, charKey } of m.labelLinks ?? []) {
    const k = charKey ?? ''
    byChar.set(k, [...(byChar.get(k) ?? []), text])
  }
  const titles = m.titles.filter(Boolean)
  // Titles run left to right across the meme; `characters` doesn't follow that order, so match each
  // title to a character by name ("chad corner dealer" → chad), then the rest in label order
  const order = [...new Set([...(m.labelLinks ?? []).map(l => l.charKey).filter((k): k is string => !!k), ...m.characters])]
  const titleOf = new Map<string, string>()
  const left = titles.filter(t => {
    const k = order.find(c => !titleOf.has(c) && t.toLowerCase().includes(pretty(c).toLowerCase()))
    if (k) titleOf.set(k, t)
    return !k
  })
  for (const c of order) if (!titleOf.has(c) && left.length) titleOf.set(c, left.shift()!)
  const sides: Side[] = order.map(c => ({ name: titleOf.get(c) ?? pretty(c), char: c, labels: byChar.get(c) ?? [] }))
  for (const t of left) sides.push({ name: t, labels: [] })
  // Labels that weren't tied to a character, or the older flat list
  const loose = [...(byChar.get('') ?? []), ...(m.labelLinks?.length ? [] : m.labels ?? [])]
  if (loose.length) sides.push({ name: 'Also', labels: loose })
  return {
    sides,
    title: (titles.length ? titles : m.characters.map(pretty)).join(' vs ') || 'A Studio meme',
    wallet: m.wallet, createdAt: m.created_at, characters: m.characters,
    remixedFrom: m.remixed_from ? { id: m.remixed_from, title: m.remixed_from_meta?.title ?? null } : null,
    hasDraft: !!m.has_draft,
  }
}

export function fromFactory(meta: JobMetadata | null, wallet: string | null): MemeInfo {
  const { virgin, chad } = parseMemeId(meta?.id ?? null)
  return {
    ...EMPTY,
    sides: [
      { name: `Virgin ${virgin}`, labels: meta?.virgin_labels ?? [], char: 'virgin' },
      { name: `Chad ${chad}`, labels: meta?.chad_labels ?? [], char: 'chad' },
    ],
    title: `Virgin ${virgin} vs Chad ${chad}`,
    wallet,
  }
}

export function useMeme(source: MemeSourceType, id: string) {
  const [info, setInfo] = useState<MemeInfo | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let live = true
    if (source === 'studio') {
      fetchStudioMeme(id).then(m => live && setInfo(fromStudio(m)), () => live && setMissing(true))
    } else if (source === 'factory') {
      Promise.all([
        fetchMetadata(id),
        fetch(`/jobs/${encodeURIComponent(id)}`).then(r => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ wallet?: string | null; status?: string } | null>,
      ]).then(([meta, job]) => {
        if (!live) return
        if (!meta && !job) { setMissing(true); return }
        setInfo(fromFactory(meta, job?.wallet ?? null))
      })
    } else {
      setInfo({ ...EMPTY, title: 'From the meme bank' })
    }
    return () => { live = false }
  }, [source, id])
  return { info, missing }
}

// ── Tiers: where this meme is, and how far to the next one ───────────────────

export const TIERS: Record<MemeTier, { icon: string; label: string; color: string }> = {
  fresh:     { icon: '🌱', label: 'Fresh',     color: '#7bd88f' },
  rising:    { icon: '📈', label: 'Rising',    color: '#4dc8ff' },
  hot:       { icon: '🔥', label: 'Hot',       color: '#ff7a3d' },
  legendary: { icon: '👑', label: 'Legendary', color: '#F0A020' },
  pantheon:  { icon: '🏛', label: 'Pantheon',  color: '#e7c6ff' },
}
// Vote totals each tier needs (the score and pace rules sit on top of these)
export const NEXT: Partial<Record<MemeTier, { tier: MemeTier; votes: number; from: number }>> = {
  fresh:  { tier: 'rising',    votes: 10,  from: 0 },
  rising: { tier: 'hot',       votes: 100, from: 10 },
  hot:    { tier: 'legendary', votes: 500, from: 100 },
}
// XP a scout earns for upvoting while Fresh, once the meme climbs
export const SCOUT = [['Rising', 20], ['Hot', 50], ['Legendary', 200]] as const

/** How tiers rank, for spotting a climb */
export const TIER_RANK: Record<MemeTier, number> = { fresh: 0, rising: 1, hot: 2, legendary: 3, pantheon: 4 }

/** "Virgin Script Kiddie" → kicker "Virgin", name "Script Kiddie" */
export function splitSide(name: string) {
  const m = name.match(/^(Virgin|Chad)\s+(.+)$/)
  return m ? { kicker: m[1], rest: m[2] } : { kicker: null, rest: name }
}

/** One-line title for a list item: "Virgin X vs Chad Y" for Factory, the titles for Studio */
export function itemTitle(source: MemeSourceType, raw: { meme_id?: string | null; titles?: string[]; characters?: string[] }) {
  if (source === 'factory') { const { virgin, chad } = parseMemeId(raw.meme_id ?? null); return `Virgin ${virgin} vs Chad ${chad}` }
  const t = (raw.titles ?? []).filter(Boolean)
  return (t.length ? t : (raw.characters ?? []).map(pretty)).join(' vs ') || 'A Studio meme'
}
