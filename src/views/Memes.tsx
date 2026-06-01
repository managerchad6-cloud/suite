import { useState, useEffect } from 'react'
import { MemeCreator } from '../components/MemeCreator'
import { MemeGallery } from '../components/MemeGallery'
import { imageUrl, parseMemeId, fetchMetadata, type Meme, type JobMetadata } from '../api/memes'
import '../memes.css'

function hash(jobId: string): number {
  return jobId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

function sampleLabels(labels: string[], jobId: string, offset: number): string[] {
  const count = Math.min((hash(jobId) + offset) % 4, labels.length) // 0–3
  return labels.slice(0, count)
}

function isFreestyleMeme(jobId: string): boolean {
  return hash(jobId) % 2 === 0
}

function generateFreestylePrompt(
  virgin: string, chad: string,
  vLabels: string[], cLabels: string[],
  jobId: string
): string {
  const v = virgin.toLowerCase()
  const c = chad.toLowerCase()
  const vl = vLabels.slice(0, 2)
  const cl = cLabels.slice(0, 2)
  switch (hash(jobId) % 4) {
    case 0: return `virgin ${v} vs chad ${c}`
    case 1: return `${v} vs ${c}`
    case 2:
      if (vl.length && cl.length) return `${v} (${vl.join(', ')}) vs ${c} (${cl.join(', ')})`
      return `${v} and ${c}`
    default:
      return vl.length ? `${v} — ${vl[0]} vs ${c}` : `${v} and ${c}`
  }
}

export function Memes({ address, onOpenDetail, onOpenProfile, characterFilter, onClearCharacterFilter }: {
  address: string
  onOpenDetail?: (m: Meme) => void
  onOpenProfile?: (wallet: string) => void
  characterFilter?: string | null
  onClearCharacterFilter?: () => void
}) {
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [heroCreatorOpen, setHeroCreatorOpen] = useState(false)
  const [selectedMeme, setSelectedMeme] = useState<Meme | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<JobMetadata | null>(null)
  const [lightbox, setLightbox] = useState<{ jobId: string; virgin: string; chad: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox) { setLightbox(null); return }
        setCreatorOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    setSelectedMeta(null)
    if (!selectedMeme) return
    fetchMetadata(selectedMeme.job_id).then(m => { if (m) setSelectedMeta(m) })
  }, [selectedMeme?.job_id])

  const heroParsed = selectedMeme ? parseMemeId(selectedMeme.meme_id) : null

  const handleHeroClick = () => {
    if (!selectedMeme || !heroParsed) return
    setLightbox({ jobId: selectedMeme.job_id, virgin: heroParsed.virgin, chad: heroParsed.chad })
  }

  return (
    <div className="memes-view">

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img
              className="lightbox-img"
              src={imageUrl(lightbox.jobId)}
              alt={`Virgin ${lightbox.virgin} vs Chad ${lightbox.chad}`}
            />
            <div className="lightbox-caption">
              <span className="lightbox-virgin">Virgin {lightbox.virgin}</span>
              <span className="lightbox-vs">vs</span>
              <span className="lightbox-chad">Chad {lightbox.chad}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      {(selectedMeme && heroParsed || heroCreatorOpen) && (() => {
        const freestyle = selectedMeme ? isFreestyleMeme(selectedMeme.job_id) : false
        const sampledVL = selectedMeta && !freestyle ? sampleLabels(selectedMeta.virgin_labels, selectedMeme!.job_id, 0) : []
        const sampledCL = selectedMeta && !freestyle ? sampleLabels(selectedMeta.chad_labels, selectedMeme!.job_id, 7) : []
        const freestylePrompt = freestyle && selectedMeta && heroParsed
          ? generateFreestylePrompt(heroParsed.virgin, heroParsed.chad,
              sampleLabels(selectedMeta.virgin_labels, selectedMeme!.job_id, 3),
              sampleLabels(selectedMeta.chad_labels, selectedMeme!.job_id, 11),
              selectedMeme!.job_id)
          : ''
        return (
          <div className="gallery-hero">

            {/* Left — creator panel */}
            <div className="hero-recipe-panel">
              {heroCreatorOpen ? (
                <MemeCreator
                  key="hero-creator"
                  address={address}
                  onNeedConnect={() => {}}
                  variant="flat"
                />
              ) : selectedMeme && heroParsed ? (
                <MemeCreator
                  key={selectedMeme.job_id}
                  address={address}
                  onNeedConnect={() => {}}
                  variant="flat"
                  readOnly
                  onCreateOwn={() => setHeroCreatorOpen(true)}
                  initialVirgn={heroParsed.virgin}
                  initialChad={heroParsed.chad}
                  initialFormMode={freestyle ? 'freestyle' : 'manual'}
                  initialFreetext={freestylePrompt}
                  initialVirginLabels={sampledVL}
                  initialChadLabels={sampledCL}
                />
              ) : null}
            </div>

            {/* Right — meme image or template */}
            {heroCreatorOpen ? (
              <div className="hero-img-wrap hero-template-wrap">
                <div className="template-placeholder">
                  <div className="template-frame">
                    <div className="template-side">
                      <div className="template-side-label">VIRGIN</div>
                      <div className="template-figure virgin" />
                      <div className="template-stubs">
                        <div className="template-stub" /><div className="template-stub" /><div className="template-stub" />
                      </div>
                    </div>
                    <div className="template-vs-divider">VS</div>
                    <div className="template-side">
                      <div className="template-side-label">CHAD</div>
                      <div className="template-figure chad" />
                      <div className="template-stubs">
                        <div className="template-stub" /><div className="template-stub" /><div className="template-stub" />
                      </div>
                    </div>
                  </div>
                  <p className="template-caption">Give it a contrast. The AI fills in the rest.</p>
                </div>
              </div>
            ) : (
              <div className="hero-img-wrap" onClick={handleHeroClick}>
                <img
                  className="gallery-hero-img"
                  src={imageUrl(selectedMeme!.job_id)}
                  alt={`Virgin ${heroParsed!.virgin} vs Chad ${heroParsed!.chad}`}
                />
              </div>
            )}

          </div>
        )
      })()}

      {/* ── Gallery ── */}
      <MemeGallery
        address={address}
        onAutoSelect={(m) => { setSelectedMeme(m) }}
        onSelectMeme={(m) => { setSelectedMeme(m); setHeroCreatorOpen(false) }}
        onOpenDetail={onOpenDetail}
        onOpenProfile={onOpenProfile}
        characterFilter={characterFilter}
        onClearCharacterFilter={onClearCharacterFilter}
      />

      {/* ── Floating modal ── */}
      <div className={`creator-modal-float ${creatorOpen ? 'creator-modal-float--open' : ''}`}>
        <MemeCreator
          address={address}
          onNeedConnect={() => {}}
          onClose={() => setCreatorOpen(false)}
        />
      </div>

      {/* ── Round FAB ── */}
      <button
        className={`create-fab ${creatorOpen ? 'create-fab--open' : ''}`}
        onClick={() => setCreatorOpen((o) => !o)}
        aria-label="Create a meme"
      >
        {creatorOpen ? '✕' : '+'}
      </button>
    </div>
  )
}
