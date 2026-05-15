import { forwardRef, useState, useEffect } from 'react'

const MEME_FACTORY = (import.meta as unknown as { env: Record<string, string> }).env.VITE_MEME_FACTORY_URL ?? ''

type MemeItem = {
  job_id:       string
  meme_id:      string | null
  status:       string
  created_at:   string
  wallet:       string | null
  vote_count:   number
}

type GalleryResponse = {
  items:    MemeItem[]
  total:    number
  has_next: boolean
}

export const MemeGallery = forwardRef<HTMLElement, { address: string }>(
  function MemeGallery({ address }, ref) {
    const [memes,   setMemes]   = useState<MemeItem[]>([])
    const [loading, setLoading] = useState(true)
    const [page,    setPage]    = useState(1)
    const [hasNext, setHasNext] = useState(false)

    const load = async (p: number) => {
      setLoading(true)
      try {
        const res: GalleryResponse = await fetch(
          `${MEME_FACTORY}/memes?status=done&limit=12&page=${p}`
        ).then(r => r.json())
        setMemes(p === 1 ? res.items : prev => [...prev, ...res.items])
        setHasNext(res.has_next)
        setPage(p)
      } catch { /* silently ignore */ }
      finally { setLoading(false) }
    }

    useEffect(() => { load(1) }, [])

    return (
      <section ref={ref} className="mg-wrap">
        <div className="mg-header">
          <span className="mg-title">RECENT MEMES</span>
        </div>

        {loading && page === 1 ? (
          <div className="mg-loading"><div className="mc-spinner" /></div>
        ) : memes.length === 0 ? (
          <div className="mg-empty">No memes yet — generate the first one above.</div>
        ) : (
          <>
            <div className="mg-grid">
              {memes.map(m => (
                <MemeCard key={m.job_id} item={m} currentWallet={address} />
              ))}
            </div>
            {hasNext && (
              <div className="mg-more-wrap">
                <button
                  className="mg-more-btn"
                  onClick={() => load(page + 1)}
                  disabled={loading}
                >
                  {loading ? '…' : 'LOAD MORE'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    )
  }
)

function MemeCard({ item, currentWallet }: { item: MemeItem; currentWallet: string }) {
  const [votes, setVotes]   = useState(item.vote_count)
  const [voted, setVoted]   = useState(false)
  const [voting, setVoting] = useState(false)
  const isOwn = item.wallet === currentWallet

  const handleVote = async () => {
    if (voted || voting) return
    setVoting(true)
    try {
      const res = await fetch(`${MEME_FACTORY}/jobs/${item.job_id}/vote`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: currentWallet }),
      })
      if (res.ok) {
        const data = (await res.json()) as { vote_count: number; already_voted: boolean }
        setVotes(data.vote_count)
        setVoted(true)
      }
    } catch { /* silently ignore */ }
    finally { setVoting(false) }
  }

  return (
    <div className={`mg-card ${isOwn ? 'mg-card-own' : ''}`}>
      <div className="mg-img-wrap">
        <img
          className="mg-img"
          src={`${MEME_FACTORY}/jobs/${item.job_id}/image`}
          alt="meme"
          loading="lazy"
        />
      </div>
      <div className="mg-card-footer">
        <div className="mg-card-meta">
          {isOwn && <span className="mg-badge-own">YOURS</span>}
          <span className="mg-date">
            {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <button
          className={`mg-vote-btn ${voted ? 'mg-vote-btn-voted' : ''}`}
          onClick={handleVote}
          disabled={voted || voting}
          title={voted ? 'Voted' : 'Upvote'}
        >
          {voting ? '…' : `${votes} ↑`}
        </button>
      </div>
    </div>
  )
}
