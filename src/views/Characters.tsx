import { useState } from 'react'
import { buildAttributePrompt } from '../data/attributes'
import { generatePfp } from '../api/pfp'

type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'

interface Char {
  name: string
  file: string
  ext?: string
  template?: string
  rarity: Rarity
}

const MALE: Char[] = [
  { name: 'Gigachad',  file: 'gigachad',  ext: 'webp', template: 'gigachad_template',  rarity: 'uncommon' },
  { name: 'Chad',      file: 'chad',                   template: 'chad_template',      rarity: 'common'   },
  { name: 'Thad',      file: 'thad',                   template: 'thad_template',      rarity: 'uncommon' },
  { name: 'Lad',       file: 'lad',                    template: 'lad_template',       rarity: 'rare'     },
  { name: 'Dad',       file: 'boomer',                 template: 'boomer_template',    rarity: 'rare'     },
  { name: 'Brad',      file: 'brad',                   template: 'brad_template',      rarity: 'uncommon' },
  { name: 'Basic',     file: 'basic',                  template: 'basic_template',     rarity: 'common'   },
  { name: 'Neckbeard', file: 'neckbeard',               template: 'neckbeard_template', rarity: 'uncommon' },
  { name: 'Incel',     file: 'incel',                  template: 'incel_template',     rarity: 'uncommon' },
  { name: 'Wizard',    file: 'wizard',                 template: 'wizard_template',    rarity: 'common'   },
  { name: 'Virgin',    file: 'virgin',                 template: 'virgin_template',    rarity: 'common'   },
]

const FEMALE: Char[] = [
  { name: 'Stacy',    file: 'stacy',    template: 'stacy_template',    rarity: 'common'   },
  { name: 'Tracy',    file: 'tracy',    template: 'tracy_template',    rarity: 'rare'     },
  { name: 'Lacy',     file: 'lacy',     template: 'lacy_template',     rarity: 'rare'     },
  { name: 'Brandy',   file: 'brandy',   template: 'brandy_template',   rarity: 'uncommon' },
  { name: 'Veronica', file: 'veronica', template: 'veronica_template', rarity: 'common'   },
  { name: 'Becky',    file: 'becky',    template: 'becky_template',    rarity: 'common'   },
  { name: 'Femcel',   file: 'femcel',   template: 'femcel_template',   rarity: 'uncommon' },
  { name: 'Legbeard', file: 'legbeard', template: 'legbeard_template', rarity: 'uncommon' },
  { name: 'Witch',    file: 'witch',    template: 'witch_template',    rarity: 'common'   },
]

const DEITIES: Char[] = [
  { name: 'Gad',     file: 'gad',     template: 'gad_template',     rarity: 'legendary' },
  { name: 'Zad',     file: 'zad',     template: 'zad_template',     rarity: 'rare'      },
  { name: 'Bad',     file: 'bad',     template: 'bad_template',     rarity: 'rare'      },
  { name: 'Gizzard', file: 'gizzard', template: 'gizzard_template', rarity: 'legendary' },
]

const RARITY_LABEL: Record<Rarity, string> = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  legendary: 'Legendary',
}

interface PfpResult {
  charName: string
  imageUrl: string
  attrs: Record<string, string>
}

function PfpModal({ result, onClose }: { result: PfpResult; onClose: () => void }) {
  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = result.imageUrl
    a.download = `${result.charName.toLowerCase()}_pfp.jpg`
    a.click()
  }

  return (
    <div className="pfp-modal-backdrop" onClick={onClose}>
      <div className="pfp-modal" onClick={e => e.stopPropagation()}>
        <button className="pfp-modal-close" onClick={onClose}>x</button>
        <h3 className="pfp-modal-title">{result.charName} PFP</h3>
        <img src={result.imageUrl} alt={`${result.charName} PFP`} className="pfp-modal-img" />
        <div className="pfp-modal-attrs">
          {Object.entries(result.attrs).map(([k, v]) => (
            <span key={k} className="pfp-attr-tag">
              <span className="pfp-attr-key">{k}</span> {v}
            </span>
          ))}
        </div>
        <button className="pfp-modal-download" onClick={handleDownload}>Download</button>
      </div>
    </div>
  )
}

function CharCard({ char }: { char: Char }) {
  const [hovered, setHovered]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<PfpResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const showTemplate = hovered && !!char.template
  const src = showTemplate
    ? `/assets/chars/${char.template}.png`
    : `/assets/chars/${char.file}.${char.ext ?? 'png'}`

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!char.template || loading) return
    setLoading(true)
    setError(null)
    try {
      const { prompt, attrs } = buildAttributePrompt(char.template)
      const imageUrl = await generatePfp(char.template, prompt)
      setResult({ charName: char.name, imageUrl, attrs })
    } catch (err: any) {
      setError(err.message ?? 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        className={`char-card char-card--${char.rarity}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {char.template && (
          <button
            className={`pfp-gen-btn${loading ? ' pfp-gen-btn--loading' : ''}`}
            onClick={handleGenerate}
            disabled={loading}
            title="Generate PFP"
          >
            {loading ? <span className="pfp-gen-spinner" /> : 'Generate PFP'}
          </button>
        )}

        <img
          src={src}
          alt={char.name}
          className={`char-card-img${showTemplate ? ' char-card-img--template' : ''}`}
          draggable={false}
        />

        <div className="char-card-footer">
          <span className="char-card-name">{char.name}</span>
          <span className={`char-card-rarity char-card-rarity--${char.rarity}`}>
            {RARITY_LABEL[char.rarity]}
          </span>
        </div>

        {error && <div className="pfp-gen-error">{error}</div>}
      </div>

      {result && <PfpModal result={result} onClose={() => setResult(null)} />}
    </>
  )
}

function SpectrumRow({ chars, chadLabel, virginLabel }: {
  chars: Char[]
  chadLabel: string
  virginLabel: string
}) {
  return (
    <div className="spectrum-row-wrap">
      <div className="spectrum-bar-row">
        <span className="spectrum-end spectrum-end--chad">{chadLabel}</span>
        <div className="spectrum-bar" />
        <span className="spectrum-end spectrum-end--virgin">{virginLabel}</span>
      </div>
      <div className="char-row">
        {chars.map(c => <CharCard key={c.file} char={c} />)}
      </div>
    </div>
  )
}

export function Characters() {
  return (
    <div className="characters-view">

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Male</h2>
          <span className="characters-section-count">{MALE.length} characters</span>
        </div>
        <SpectrumRow chars={MALE} chadLabel="CHAD" virginLabel="VIRGIN" />
      </div>

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Female</h2>
          <span className="characters-section-count">{FEMALE.length} characters</span>
        </div>
        <SpectrumRow chars={FEMALE} chadLabel="STACY" virginLabel="WITCH" />
      </div>

      <div className="characters-section">
        <div className="characters-section-header">
          <h2 className="characters-section-title">Rather Not Say</h2>
          <span className="characters-section-sub">Deities &amp; androgynous — above the spectrum</span>
        </div>
        <div className="char-row char-row--deities">
          {DEITIES.map(c => <CharCard key={c.file} char={c} />)}
        </div>
      </div>

    </div>
  )
}
