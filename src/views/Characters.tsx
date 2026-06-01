import { useState, useEffect } from 'react'
import { MALE, FEMALE, DEITIES, CHARACTERS, type CharData, type Rarity } from '../data/characterLore'
import { fetchMemes, fetchMemesByCharacter, parseMemeId, imageUrl, handmadeImageUrl, type Meme } from '../api/memes'
import { fetchCharacters, unlockCharacter, setMainCharacter, MASTERY_LEVELS, RARITY_COLOR, type Character } from '../api/characters'

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

// ── Tagged memes grid ─────────────────────────────────────────────────────────

function TaggedMemes({ charName, charKey, onOpenDetail }: {
  charName: string
  charKey:  string
  onOpenDetail?: (m: Meme) => void
}) {
  const [memes, setMemes] = useState<Meme[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      // AI-generated memes (match by meme_id naming convention)
      fetchMemes(1, 100).then(data => {
        const userMemes = data.items.filter(m => m.wallet !== null)
        return userMemes.filter(m => {
          if (!m.meme_id) return false
          if (charName === 'Virgin') return m.meme_id.startsWith('virgin_')
          if (charName === 'Chad')   return m.meme_id.includes('_vs_chad_')
          const { virgin, chad } = parseMemeId(m.meme_id)
          return virgin === charName || chad === charName
        })
      }).catch(() => [] as Meme[]),
      // Hand-made memes tagged with this character key
      fetchMemesByCharacter(charKey).catch(() => [] as Meme[]),
    ]).then(([aiMemes, handmade]) => {
      // Deduplicate by job_id, hand-made after AI
      const seen = new Set<string>()
      const all: Meme[] = []
      for (const m of [...aiMemes, ...handmade]) {
        if (!seen.has(m.job_id)) { seen.add(m.job_id); all.push(m) }
      }
      setMemes(all)
    }).finally(() => setLoading(false))
  }, [charName, charKey])

  if (loading) return <div className="gallery-spinner" style={{ margin: '24px auto' }} />
  if (memes.length === 0) return (
    <p className="char-detail-no-memes">
      No memes tagged with {charName} yet — be the first to create one.
    </p>
  )

  return (
    <div className="char-detail-memes-grid">
      {memes.map(m => {
        const isHandmade = m.type === 'handmade'
        const { virgin, chad } = parseMemeId(m.meme_id)
        const src = isHandmade ? handmadeImageUrl(m.job_id) : imageUrl(m.job_id)
        const label = isHandmade
          ? `Hand-made · ${(m.characters ?? []).join(', ') || charName}`
          : `${virgin} vs ${chad}`
        return (
          <div
            key={m.job_id}
            className={`char-detail-meme-card ${onOpenDetail ? 'char-detail-meme-card--clickable' : ''}`}
            onClick={() => onOpenDetail?.(m)}
          >
            <img src={src} alt={label} className="char-detail-meme-img" />
            <div className="char-detail-meme-label">
              {isHandmade ? (
                <>
                  <span className="char-detail-meme-virgin" style={{ color: '#5aaeff' }}>Hand-made</span>
                  <span className="char-detail-meme-vs">·</span>
                  <span className="char-detail-meme-chad">{(m.characters ?? [charKey]).join(', ')}</span>
                </>
              ) : (
                <>
                  <span className="char-detail-meme-virgin">{virgin}</span>
                  <span className="char-detail-meme-vs">vs</span>
                  <span className="char-detail-meme-chad">{chad}</span>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Character detail ──────────────────────────────────────────────────────────

function CharacterDetail({ char, onBack, onOpenDetail, colState, wallet, onCollectionChange }: {
  char: CharData
  onBack: () => void
  onOpenDetail?: (m: Meme) => void
  colState?: Character
  wallet?: string
  onCollectionChange?: () => void
}) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const src      = `/assets/chars/${char.file}.${char.ext ?? 'png'}`
  const unlocked = !colState || colState.unlocked
  const isMain   = colState?.is_main

  async function handleUnlock() {
    if (!wallet || busy) return
    setBusy(true)
    try { await unlockCharacter(char.key, wallet); onCollectionChange?.() }
    catch (e: unknown) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  async function handleSetMain() {
    if (!wallet || busy) return
    setBusy(true)
    try { await setMainCharacter(char.key, wallet); onCollectionChange?.() }
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
          <p className="char-detail-tagline">"{char.tagline}"</p>
          <p className="char-detail-lore">{char.lore}</p>

          {unlocked && colState && (
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
          <TaggedMemes charName={char.name} charKey={char.key} onOpenDetail={onOpenDetail} />
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

  const unlocked   = !colState || colState.unlocked
  const isMain     = colState?.is_main
  const masteryLvl = colState?.mastery_level ?? 0

  const imgSrc = hovered && !templateFailed
    ? `/assets/chars/${char.file}_template.png`
    : `/assets/chars/${char.file}.${char.ext ?? 'png'}`

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

export function Characters({ onOpenDetail, initialChar, address }: {
  onOpenDetail?: (meme: Meme) => void
  initialChar?: string | null
  address?: string | null
}) {
  const [selected,  setSelected]  = useState<CharData | null>(() =>
    initialChar ? (CHARACTERS.find(c => c.name === initialChar) ?? null) : null
  )
  const [stateMap,  setStateMap]  = useState<Record<string, Character>>({})

  const loadCollection = () => {
    if (!address) return
    fetchCharacters(address).then(chars => {
      setStateMap(Object.fromEntries(chars.map(c => [c.id, c])))
    }).catch(() => {})
  }

  useEffect(() => { loadCollection() }, [address])  // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return (
      <CharacterDetail
        char={selected}
        onBack={() => setSelected(null)}
        onOpenDetail={onOpenDetail}
        colState={stateMap[selected.key]}
        wallet={address ?? undefined}
        onCollectionChange={loadCollection}
      />
    )
  }

  const unlockedCount = Object.values(stateMap).filter(s => s.unlocked).length

  return (
    <div className="characters-view">

      {address && (
        <div className="collection-header">
          <span className="collection-header-label">Collection</span>
          <span className="collection-header-count">
            {unlockedCount} / {CHARACTERS.length} unlocked
          </span>
        </div>
      )}

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Male</h2>
          <span className="characters-section-count">{MALE.length} characters</span>
        </div>
        <SpectrumRow chars={MALE} chadLabel="CHAD" virginLabel="VIRGIN" onSelect={setSelected} stateMap={stateMap} />
      </div>

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Female</h2>
          <span className="characters-section-count">{FEMALE.length} characters</span>
        </div>
        <SpectrumRow chars={FEMALE} chadLabel="STACY" virginLabel="WITCH" onSelect={setSelected} stateMap={stateMap} />
      </div>

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Rather Not Say</h2>
          <span className="characters-section-sub">Deities &amp; androgynous — above the spectrum</span>
        </div>
        <div className="char-row char-row--deities">
          {DEITIES.map(c => (
            <CharCard key={c.key} char={c} onSelect={() => setSelected(c)} colState={stateMap[c.key]} />
          ))}
        </div>
      </div>

    </div>
  )
}
