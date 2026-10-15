import { useEffect, useState } from 'react'
import { listDrafts, deleteDraftById, fetchDraft, type DraftMeta, type DraftPayload } from '../api/memes'
import { fetchStudioMemesByWallet, studioMemeImageUrl, deleteStudioMeme, type StudioMeme } from '../api/studio'
import { truncateAddress } from '../wallet'
import { hasUserGeminiKey } from '../api/pfp'
import { GeminiKeyModal } from '../components/GeminiKeyModal'
import { useMemberGate } from '../identity/gate'
import '../studio-home.css'

interface Props {
  onNew: () => void
  onOpenDraft: (payload: DraftPayload) => void
  onImportVvc?: (payload: DraftPayload) => void
}

export function StudioHome({ onNew, onOpenDraft, onImportVvc }: Props) {
  // Everyone sees the studio; only members can open the editor or have drafts
  const gate = useMemberGate()
  const address = gate.wallet
  const [drafts,         setDrafts]         = useState<DraftMeta[]>([])
  const [draftsLoading,  setDraftsLoading]  = useState(true)
  const [published,      setPublished]      = useState<StudioMeme[]>([])
  const [pubLoading,     setPubLoading]     = useState(true)
  const [openingId,      setOpeningId]      = useState<string | null>(null)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)
  const [deletingPubId,  setDeletingPubId]  = useState<string | null>(null)
  const [showKeyModal,   setShowKeyModal]   = useState(false)
  const [ownKeyActive,   setOwnKeyActive]   = useState(() => hasUserGeminiKey())

  useEffect(() => {
    if (!address) {
      setDrafts([]); setDraftsLoading(false)
      setPublished([]); setPubLoading(false)
      return
    }
    listDrafts(address)
      .then(setDrafts)
      .catch(() => setDrafts([]))
      .finally(() => setDraftsLoading(false))

    fetchStudioMemesByWallet(address, 100)
      .then(setPublished)
      .catch(() => setPublished([]))
      .finally(() => setPubLoading(false))
  }, [address])

  async function handleOpenDraft(id: string) {
    if (openingId || !address) return
    setOpeningId(id)
    try {
      const payload = await fetchDraft(id, address)
      onOpenDraft(payload)
    } catch (err) {
      console.error('Failed to open draft:', err)
    } finally {
      setOpeningId(null)
    }
  }

  async function handleDeleteDraft(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!address || deletingId || !confirm('Delete this draft?')) return
    setDeletingId(id)
    try {
      await deleteDraftById(id, address)
      setDrafts(prev => prev.filter(d => d.id !== id))
    } catch (err) {
      console.error('Failed to delete draft:', err)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleDeleteMeme(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!address || deletingPubId || !confirm('Delete this published meme? This cannot be undone.')) return
    setDeletingPubId(id)
    try {
      await deleteStudioMeme(id, address)
      setPublished(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Failed to delete meme:', err)
    } finally {
      setDeletingPubId(null)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  async function handleImportVvc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as DraftPayload
      ;(onImportVvc ?? onOpenDraft)(payload)
    } catch {
      alert('Could not open .vvc file — make sure it is an Embedded format file.')
    }
  }

  return (
    <div className="sh-root">
      <div className="sh-header">
        <div className="sh-header-text">
          <h1 className="sh-title">Meme Studio</h1>
          <p className="sh-sub">{address ? truncateAddress(address) : 'Build memes by hand, layer by layer.'}</p>
        </div>
        <div className="sh-header-btns">
          <button className="sh-new-btn" {...gate.lockProps('create')} onClick={gate.guard(onNew, 'create')}>
            <span className="sh-new-icon">+</span>
            New Document
          </button>
          {gate.locked ? (
            <button className="sh-import-btn" {...gate.lockProps('open projects')} onClick={() => gate.join('open projects')}>
              📂 Open .vvc
            </button>
          ) : (
            <label className="sh-import-btn" title="Open a .vvc project file">
              <input type="file" accept=".vvc" style={{ display: 'none' }} onChange={handleImportVvc} />
              📂 Open .vvc
            </label>
          )}
        </div>
      </div>

      {gate.locked && (
        <section className="sh-section">
          <h2 className="sh-section-title">Your work</h2>
          <p className="sh-empty">Members' drafts and published memes live here.</p>
          <button className="sh-new-btn" onClick={() => gate.join('create')} style={{ marginTop: 12, width: 'fit-content' }}>
            Join to start creating
          </button>
        </section>
      )}

      {!gate.locked && <>
      {/* ── Gemini API Key ── */}
      <div className={`sh-apikey-card ${ownKeyActive ? 'sh-apikey-card--active' : ''}`}>
        <div className="sh-apikey-left">
          <span className="sh-apikey-icon">{ownKeyActive ? '🔑' : '🔒'}</span>
          <div className="sh-apikey-text">
            {ownKeyActive ? (
              <>
                <span className="sh-apikey-label sh-apikey-label--on">Your Gemini key is active</span>
                <span className="sh-apikey-sub">AI actions use your key — VVC credits are not deducted</span>
              </>
            ) : (
              <>
                <span className="sh-apikey-label">Use your own Gemini API key</span>
                <span className="sh-apikey-sub">Bypass VVC credits — your key stays in the browser only</span>
              </>
            )}
          </div>
        </div>
        <button className="sh-apikey-btn" onClick={() => setShowKeyModal(true)}>
          {ownKeyActive ? 'Manage' : 'Add Key'}
        </button>
      </div>

      {showKeyModal && (
        <GeminiKeyModal
          onClose={() => setShowKeyModal(false)}
          onChanged={() => setOwnKeyActive(hasUserGeminiKey())}
        />
      )}

      {/* ── Drafts ── */}
      <section className="sh-section">
        <h2 className="sh-section-title">Drafts</h2>
        {draftsLoading ? (
          <p className="sh-empty">Loading…</p>
        ) : drafts.length === 0 ? (
          <p className="sh-empty">No saved drafts yet. Start creating and hit Save.</p>
        ) : (
          <div className="sh-grid">
            {drafts.map(d => (
              <div
                key={d.id}
                className={`sh-card ${openingId === d.id ? 'sh-card--loading' : ''}`}
                onClick={() => handleOpenDraft(d.id)}
              >
                <div className="sh-card-thumb">
                  {d.thumbnail
                    ? <img src={d.thumbnail} alt={d.title} />
                    : <div className="sh-card-thumb-empty" />
                  }
                  {openingId === d.id && <div className="sh-card-overlay">Opening…</div>}
                </div>
                <div className="sh-card-info">
                  <span className="sh-card-title">{d.title}</span>
                  <span className="sh-card-date">{formatDate(d.updatedAt)}</span>
                </div>
                <button
                  className="sh-card-delete"
                  onClick={e => handleDeleteDraft(e, d.id)}
                  disabled={deletingId === d.id}
                  title="Delete draft"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Published ── */}
      <section className="sh-section">
        <h2 className="sh-section-title">Published</h2>
        {pubLoading ? (
          <p className="sh-empty">Loading…</p>
        ) : published.length === 0 ? (
          <p className="sh-empty">Nothing published yet.</p>
        ) : (
          <div className="sh-grid sh-grid--published">
            {published.map(m => (
              <div key={m.id} className="sh-card sh-card--pub">
                <div className="sh-card-thumb">
                  <img src={studioMemeImageUrl(m.id)} alt={m.id} loading="lazy" />
                </div>
                <button
                  className="sh-card-delete"
                  onClick={e => handleDeleteMeme(e, m.id)}
                  disabled={deletingPubId === m.id}
                  title="Delete meme"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </section>
      </>}
    </div>
  )
}
