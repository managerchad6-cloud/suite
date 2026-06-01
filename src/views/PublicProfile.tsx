import { useState, useEffect } from 'react'
import { fetchMemesByWallet, imageUrl, parseMemeId, type Meme } from '../api/memes'
import { truncateAddress } from '../wallet'
import { CHARACTERS } from '../data/characterLore'

type RemoteProfile = { character: string; portraitDataUrl?: string } | null

async function fetchRemoteProfile(wallet: string): Promise<RemoteProfile> {
  try {
    const r = await fetch(`/profiles/${encodeURIComponent(wallet)}`)
    return r.ok ? r.json() : null
  } catch { return null }
}

interface Props {
  wallet: string
  onBack: () => void
  onOpenDetail?: (meme: Meme) => void
}

export function PublicProfile({ wallet, onBack, onOpenDetail }: Props) {
  const [profile, setProfile] = useState<RemoteProfile | undefined>(undefined)
  const [memes, setMemes]     = useState<Meme[]>([])
  const [memesLoading, setMemesLoading] = useState(true)

  useEffect(() => {
    fetchRemoteProfile(wallet).then(setProfile)
    fetchMemesByWallet(wallet)
      .then(setMemes)
      .catch(() => {})
      .finally(() => setMemesLoading(false))
  }, [wallet])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const charData  = profile ? CHARACTERS.find(c => c.key === profile.character) ?? null : null
  const avatar    = profile?.portraitDataUrl ?? (profile ? `/assets/chars/${profile.character}.png` : null)
  const charName  = charData?.name ?? profile?.character ?? null

  return (
    <div className="profile-page">

      <div className="pub-profile-topbar">
        <button className="char-detail-back" onClick={onBack}>← Back</button>
        <span className="pub-profile-wallet">{wallet}</span>
      </div>

      <div className="profile-hero">
        {profile === undefined ? (
          <div className="creator-avatar creator-avatar--pulse" style={{ width: 140, height: 140, borderRadius: 8 }} />
        ) : avatar ? (
          <img src={avatar} alt={charName ?? ''} className="profile-hero-avatar" />
        ) : (
          <div className="pub-profile-avatar-fallback">{wallet.slice(0, 2).toUpperCase()}</div>
        )}

        <div className="profile-hero-info">
          <p className="quiz-oracle-label">ARCHETYPE</p>
          {profile === undefined ? (
            <div className="pub-profile-loading-name" />
          ) : charName ? (
            <>
              <h1 className="profile-hero-name">{charName}</h1>
              {charData && <p className="profile-hero-desc" style={{ fontStyle: 'italic', color: 'var(--text-dim)' }}>"{charData.tagline}"</p>}
            </>
          ) : (
            <h1 className="profile-hero-name" style={{ color: 'var(--text-dim)', fontSize: 18 }}>No archetype yet</h1>
          )}
          <p className="pub-profile-addr">{truncateAddress(wallet)}</p>
        </div>
      </div>

      <div className="profile-section">
        <h3 className="profile-section-title">Memes ({memesLoading ? '…' : memes.length})</h3>
        {memesLoading ? (
          <p className="profile-section-empty">Loading…</p>
        ) : memes.length === 0 ? (
          <p className="profile-section-empty">No memes created yet.</p>
        ) : (
          <div className="profile-memes-grid">
            {memes.map(m => {
              const { virgin, chad } = parseMemeId(m.meme_id)
              return (
                <div
                  key={m.job_id}
                  className="profile-meme-card"
                  onClick={() => onOpenDetail?.(m)}
                  style={onOpenDetail ? { cursor: 'pointer' } : undefined}
                >
                  <img src={imageUrl(m.job_id)} alt={`${virgin} vs ${chad}`} className="profile-meme-img" />
                  <div className="profile-meme-footer">
                    <span className="profile-meme-label">
                      <span className="profile-meme-virgin">{virgin}</span>
                      <span className="profile-meme-vs"> vs </span>
                      <span className="profile-meme-chad">{chad}</span>
                    </span>
                    {m.vote_count > 0 && <span className="profile-meme-votes">↑ {m.vote_count}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
