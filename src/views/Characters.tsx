import { useState, useEffect } from 'react'
import { useMemberGate } from '../identity/gate'
import { MALE, FEMALE, DEITIES, CHARACTERS, EXTENDED_CAST, type CharData, type Rarity } from '../data/characterLore'
import { fetchMemes, fetchStudioMemesByCharacter, parseMemeId, imageUrl, handmadeImageUrl, type Meme } from '../api/memes'
import { studioMemeImageUrl } from '../api/studio'
import type { UnifiedMemeItem } from '../types/unified'
import { fetchCharacters, unlockCharacter, setMainCharacter, MASTERY_LEVELS, RARITY_COLOR, type Character } from '../api/characters'
import { fetchCharSkins, skinImageUrl, type SkinRecord } from '../api/skins'

const RARITY_LABEL: Record<Rarity, string> = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  legendary: 'Legendary',
}

const RANK_LABELS: Record<string, string> = {
  basic:'Basic', brad:'Brad', lad:'Lad', thad:'Thad', chad:'Chad', gigachad:'Gigachad', gad:'Gad',
  neckbeard:'Neckbeard', incel:'Incel', wizard:'Wizard', virgin_rank:'Virgin', transcendent:'Transcendent', gizzard:'Gizzard',
}

function MasteryBar({ xp, level }: { xp: number; level: number }) {
  const current  = MASTERY_LEVELS[level]
  const next     = MASTERY_LEVELS[level + 1]
  const progress = next ? ((xp - current.xp) / (next.xp - current.xp)) * 100 : 100
  return (
    <div className="mastery-bar-wrap">
      <div className="mastery-bar-track">
        <div className="mastery-bar-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <span className="mastery-bar-label">{current.name}{next ? ` → ${next.name}` : ' MAX'}</span>
    </div>
  )
}

// ── Skin gallery ──────────────────────────────────────────────────────────────

function SkinGallery({ charKey }: { charKey: string }) {
  const [skins, setSkins] = useState<SkinRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCharSkins(charKey, '', 0, 60).then(r => {
      setSkins(r.items)
      setLoading(false)
    })
  }, [charKey])

  if (loading) return <div className="char-skins-empty">Loading…</div>
  if (skins.length === 0) return <div className="char-skins-empty">No skins generated yet.</div>

  return (
    <div className="char-skins-grid">
      {skins.map(skin => (
        <div key={skin.id} className="char-skin-card" title={skin.prompt}>
          <img src={skinImageUrl(skin.id)} className="char-skin-thumb" alt={skin.prompt} loading="lazy" />
          <span className="char-skin-type">{skin.skin_type.replace('inaction_', '')}</span>
        </div>
      ))}
    </div>
  )
}

// ── Tagged memes grid ─────────────────────────────────────────────────────────

function TaggedMemes({ charName, charKey, onOpenDetail, onOpenUnifiedItem }: {
  charName: string
  charKey:  string
  onOpenDetail?: (m: Meme) => void
  onOpenUnifiedItem?: (item: UnifiedMemeItem) => void
}) {
  const [studioMemes, setStudioMemes] = useState<{ id: string; characters: string[]; titles: string[] }[]>([])
  const [factoryMemes, setFactoryMemes] = useState<Meme[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      // Studio memes — keyed by exact character key stored at publish time
      fetchStudioMemesByCharacter(charKey).catch(() => []),
      // Factory AI memes — match by parsing the meme_id naming convention
      // (only Virgin/Chad get all factory memes; other chars only match when
      //  their name appears as the virgin/chad slot in the meme_id)
      fetchMemes(1, 100).then(data =>
        data.items.filter(m => {
          if (!m.meme_id || !m.wallet) return false
          if (charName === 'Virgin') return m.meme_id.startsWith('virgin_')
          if (charName === 'Chad')   return m.meme_id.includes('_vs_chad_')
          const { virgin, chad } = parseMemeId(m.meme_id)
          return virgin === charName || chad === charName
        })
      ).catch(() => [] as Meme[]),
    ]).then(([studio, factory]) => {
      setStudioMemes(studio)
      setFactoryMemes(factory)
    }).finally(() => setLoading(false))
  }, [charName, charKey])

  const total = studioMemes.length + factoryMemes.length
  if (loading) return <div className="gallery-spinner" style={{ margin: '24px auto' }} />
  if (total === 0) return (
    <p className="char-detail-no-memes">
      No memes with {charName} yet — be the first to create one in the Studio.
    </p>
  )

  return (
    <div className="char-detail-memes-grid">
      {studioMemes.map(m => {
        const charNames = m.characters.map(k => k.replace(/_/g, ' ')).join(', ')
        const title     = (m.titles[0] ?? '').trim() || charNames
        return (
          <div key={m.id} className="char-detail-meme-card char-detail-meme-card--clickable"
            onClick={() => onOpenUnifiedItem?.({
              key: `studio:${m.id}`, type: 'studio', sourceId: m.id,
              imageUrl: studioMemeImageUrl(m.id),
              title: (m.titles[0] ?? '').trim() || m.characters.map(k => k.replace(/_/g, ' ')).join(', '),
              meta: '', dateIso: '',
              characters: m.characters,
            })
          }>
            <img src={studioMemeImageUrl(m.id)} alt={charNames} className="char-detail-meme-img" />
            <div className="char-detail-meme-label">
              <span className="char-detail-meme-virgin" style={{ color: '#5aaeff' }}>Studio</span>
              <span className="char-detail-meme-vs">·</span>
              <span className="char-detail-meme-chad">{title}</span>
            </div>
          </div>
        )
      })}
      {factoryMemes.map(m => {
        const { virgin, chad } = parseMemeId(m.meme_id)
        const src = m.type === 'handmade' ? handmadeImageUrl(m.job_id) : imageUrl(m.job_id)
        return (
          <div key={m.job_id} className={`char-detail-meme-card ${onOpenDetail ? 'char-detail-meme-card--clickable' : ''}`}
            onClick={() => onOpenDetail?.(m)}>
            <img src={src} alt={`${virgin} vs ${chad}`} className="char-detail-meme-img" />
            <div className="char-detail-meme-label">
              <span className="char-detail-meme-virgin">{virgin}</span>
              <span className="char-detail-meme-vs">vs</span>
              <span className="char-detail-meme-chad">{chad}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function charImgSrc(char: CharData) {
  if (char.group === 'extended') return `/assets/cast/${char.file}.${char.ext ?? 'png'}`
  return `/assets/chars/${char.file}.${char.ext ?? 'png'}`
}

const STAT_LABELS: Record<string, string> = {
  height: 'Height', weight: 'Weight', physique: 'Physique',
  bulge_size: 'Bulge Size', cup_size: 'Cup Size',
  chadliness: 'Chadliness', staciness: 'Staciness',
  age_range: 'Age', birthday: 'Birthday',
  iq: 'IQ', profession: 'Profession',
  country_of_origin: 'Origin', date_created: 'Created',
  rank: 'Official Rank', canon: 'Canon',
  classification: 'Classification', sex: 'Sex', subtype: 'Subtype',
}

function StatsTable({ stats }: { stats: Record<string, string> }) {
  const entries = Object.entries(stats)
  if (entries.length === 0) return null
  return (
    <table className="char-stats-table">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <th>{STAT_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Character detail ──────────────────────────────────────────────────────────

function CharacterDetail({ char, onBack, onOpenDetail, onOpenUnifiedItem, colState, onCollectionChange }: {
  char: CharData
  onBack: () => void
  onOpenDetail?: (m: Meme) => void
  onOpenUnifiedItem?: (item: UnifiedMemeItem) => void
  colState?: Character
  onCollectionChange?: () => void
}) {
  const gate = useMemberGate()
  const wallet = gate.wallet
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const src      = charImgSrc(char)
  const unlocked = true
  const isMain   = colState?.is_main

  async function handleUnlock() {
    if (!wallet || busy) return
    setBusy(true)
    try { await unlockCharacter(char.key); onCollectionChange?.() }
    catch (e: unknown) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  async function handleSetMain() {
    if (!wallet || busy) return
    setBusy(true)
    try { await setMainCharacter(char.key); onCollectionChange?.() }
    finally { setBusy(false) }
  }

  return (
    <div className="char-detail">

      <div className="char-detail-topbar">
        <button className="char-detail-back" onClick={onBack}>← Back</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {unlocked && !isMain && wallet && (
            <button className="char-action-btn char-action-btn--main" onClick={handleSetMain} disabled={busy}>
              ☆ Set as Main
            </button>
          )}
          {unlocked && isMain && (
            <span className="char-main-badge">★ Your Main</span>
          )}
          {gate.locked && (
            <button className="char-action-btn char-action-btn--main" {...gate.lockProps('collect characters')} onClick={() => gate.join('collect characters')}>
              ☆ Set as Main
            </button>
          )}
          {!unlocked && colState?.can_unlock && wallet && (
            <button className="char-action-btn char-action-btn--unlock" onClick={handleUnlock} disabled={busy}>
              🔓 Unlock
            </button>
          )}
          {!unlocked && !colState?.can_unlock && (
            <span className="char-locked-req">
              Requires rank: <strong>{RANK_LABELS[colState?.unlock_rank ?? char.rarity] ?? colState?.unlock_rank}</strong>
            </span>
          )}
          <span className={`char-detail-rarity-badge char-detail-rarity-badge--${char.rarity}`}
            style={{ color: RARITY_COLOR[char.rarity] }}>
            {RARITY_LABEL[char.rarity]}
          </span>
        </div>
      </div>

      <div className="char-detail-header">
        <div className="char-detail-portrait-wrap">
          <img src={src} alt={char.name} className={`char-detail-portrait ${!unlocked ? 'char-detail-portrait--locked' : ''}`} />
          {!unlocked && <div className="char-detail-lock-overlay">🔒</div>}
        </div>
        <div className="char-detail-identity">
          <h1 className="char-detail-name">{char.name}</h1>
          <div className="char-detail-tier">{char.tier}</div>
          {char.tagline && <p className="char-detail-tagline">"{char.tagline}"</p>}
          {char.stats && Object.keys(char.stats).length > 0 && (
            <StatsTable stats={char.stats} />
          )}
          <p className="char-detail-lore">{char.lore}</p>
          {char.extraLore && <p className="char-detail-lore char-detail-lore--extra">{char.extraLore}</p>}

          {unlocked && colState && char.group !== 'extended' && (
            <div className="char-detail-mastery">
              <div className="char-detail-mastery-label">
                Mastery · <strong>{MASTERY_LEVELS[colState.mastery_level ?? 0]?.name}</strong>
                <span className="char-detail-uses">{colState.uses_count} uses</span>
              </div>
              <MasteryBar xp={colState.mastery_xp ?? 0} level={colState.mastery_level ?? 0} />
            </div>
          )}
        </div>
      </div>

      <div className="char-detail-body">

        <div className="char-detail-block">
          <h4 className="char-detail-block-title">Traits</h4>
          <div className="char-detail-traits">
            {char.traits.map(t => <span key={t} className="char-trait-chip">{t}</span>)}
          </div>
        </div>

        <div className="char-detail-block">
          <h4 className="char-detail-block-title">Used for</h4>
          <p className="char-detail-usedfor">{char.usedFor}</p>
        </div>

        <div className="char-detail-block">
          <h4 className="char-detail-block-title">
            Tagged Memes
            <span className="char-detail-block-sub"> — memes where {char.name} appears</span>
          </h4>
          <TaggedMemes charName={char.name} charKey={char.key} onOpenDetail={onOpenDetail} onOpenUnifiedItem={onOpenUnifiedItem} />
        </div>

        <div className="char-detail-block">
          <h4 className="char-detail-block-title">
            Generated Skins
            <span className="char-detail-block-sub"> — all AI looks for {char.name}</span>
          </h4>
          <SkinGallery charKey={char.key} />
        </div>

      </div>
    </div>
  )
}

// ── Character card ────────────────────────────────────────────────────────────

function CharCard({ char, onSelect, colState }: {
  char: CharData
  onSelect: () => void
  colState?: Character
}) {
  const [hovered, setHovered] = useState(false)
  const [templateFailed, setTemplateFailed] = useState(false)

  const unlocked   = true
  const isMain     = colState?.is_main
  const masteryLvl = colState?.mastery_level ?? 0

  const baseSrc     = charImgSrc(char)
  const templateSrc = char.group !== 'extended' ? `/assets/chars/${char.file}_template.png` : baseSrc
  const imgSrc      = hovered && !templateFailed ? templateSrc : baseSrc

  return (
    <div
      className={`char-card char-card--${char.rarity} ${!unlocked ? 'char-card--locked' : ''}`}
      onMouseEnter={() => { setHovered(true); setTemplateFailed(false) }}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      {isMain && <span className="char-card-main-star" title="Main character">★</span>}
      {!unlocked && <div className="char-card-lock">🔒</div>}
      <img
        src={imgSrc}
        alt={char.name}
        className={`char-card-img${hovered && !templateFailed ? ' char-card-img--template' : ''} ${!unlocked ? 'char-card-img--locked' : ''}`}
        draggable={false}
        onError={() => { if (hovered) setTemplateFailed(true) }}
      />
      <div className="char-card-footer">
        <span className="char-card-name">{char.name}</span>
        <span className={`char-card-rarity char-card-rarity--${char.rarity}`}>
          {RARITY_LABEL[char.rarity]}
        </span>
      </div>
      {unlocked && masteryLvl > 0 && (
        <div className="char-card-mastery-pips">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={`mastery-pip ${i < masteryLvl ? 'mastery-pip--filled' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Spectrum row ──────────────────────────────────────────────────────────────

function SpectrumRow({ chars, chadLabel, virginLabel, onSelect, stateMap }: {
  chars: CharData[]
  chadLabel: string
  virginLabel: string
  onSelect: (c: CharData) => void
  stateMap: Record<string, Character>
}) {
  return (
    <div className="spectrum-row-wrap">
      <div className="spectrum-bar-row">
        <span className="spectrum-end spectrum-end--chad">{chadLabel}</span>
        <div className="spectrum-bar" />
        <span className="spectrum-end spectrum-end--virgin">{virginLabel}</span>
      </div>
      <div className="char-row">
        {chars.map(c => (
          <CharCard key={c.key} char={c} onSelect={() => onSelect(c)} colState={stateMap[c.key]} />
        ))}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function Characters({ onOpenDetail, onOpenUnifiedItem, initialChar, onSelectChar }: {
  /** When given, opening/closing a character goes through the URL (/cast/:key) */
  onSelectChar?: (key: string | null) => void
  onOpenDetail?: (meme: Meme) => void
  onOpenUnifiedItem?: (item: UnifiedMemeItem) => void
  initialChar?: string | null
}) {
  const gate = useMemberGate()
  const address = gate.wallet
  const ALL_CHARS = [...CHARACTERS, ...EXTENDED_CAST]
  const findChar = (nameOrKey: string) =>
    ALL_CHARS.find(c => c.name === nameOrKey || c.key === nameOrKey ||
      c.name.toLowerCase() === nameOrKey.toLowerCase() ||
      c.key.toLowerCase() === nameOrKey.toLowerCase()) ?? null

  const [selected,  setSelected]  = useState<CharData | null>(() =>
    initialChar ? findChar(initialChar) : null
  )
  const [stateMap,  setStateMap]  = useState<Record<string, Character>>({})

  useEffect(() => {
    setSelected(initialChar ? findChar(initialChar) : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChar])

  /** Open a character: through the URL when the route manages it */
  const select = (c: CharData) => (onSelectChar ? onSelectChar(c.key) : setSelected(c))

  const loadCollection = () => {
    if (!address) return
    fetchCharacters().then(chars => {
      setStateMap(Object.fromEntries(chars.map(c => [c.id, c])))
    }).catch(() => {})
  }

  useEffect(() => { loadCollection() }, [address])  // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return (
      <CharacterDetail
        char={selected}
        onBack={() => (onSelectChar ? onSelectChar(null) : setSelected(null))}
        onOpenDetail={onOpenDetail}
        onOpenUnifiedItem={onOpenUnifiedItem}
        colState={stateMap[selected.key]}
        onCollectionChange={loadCollection}
      />
    )
  }

  const unlockedCount = Object.values(stateMap).filter(s => s.unlocked).length

  return (
    <div className="characters-view">

      {address ? (
        <div className="collection-header">
          <span className="collection-header-label">Collection</span>
          <span className="collection-header-count">
            {unlockedCount} / {CHARACTERS.length} unlocked
          </span>
        </div>
      ) : (
        <div className="collection-header">
          <span className="collection-header-label">Collection</span>
          <button className="char-action-btn" {...gate.lockProps('start your collection')} onClick={() => gate.join('start your collection')}>
            Start your collection
          </button>
        </div>
      )}

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Male</h2>
          <span className="characters-section-count">{MALE.length} characters</span>
        </div>
        <SpectrumRow chars={MALE} chadLabel="CHAD" virginLabel="VIRGIN" onSelect={select} stateMap={stateMap} />
      </div>

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Female</h2>
          <span className="characters-section-count">{FEMALE.length} characters</span>
        </div>
        <SpectrumRow chars={FEMALE} chadLabel="STACY" virginLabel="WITCH" onSelect={select} stateMap={stateMap} />
      </div>

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Rather Not Say</h2>
          <span className="characters-section-sub">Deities &amp; androgynous — above the spectrum</span>
        </div>
        <div className="char-row char-row--deities">
          {DEITIES.map(c => (
            <CharCard key={c.key} char={c} onSelect={() => select(c)} colState={stateMap[c.key]} />
          ))}
        </div>
      </div>

      <div className="characters-section characters-section--extended">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Extended Cast</h2>
          <span className="characters-section-count">{EXTENDED_CAST.length} characters</span>
        </div>
        <span className="characters-section-sub">Spin-offs, deities, and deep lore from the wider Chadiverse</span>
        <div className="char-row char-row--extended">
          {EXTENDED_CAST.map(c => (
            <CharCard key={c.key} char={c} onSelect={() => select(c)} colState={stateMap[c.key]} />
          ))}
        </div>
      </div>

    </div>
  )
}
