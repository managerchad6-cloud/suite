import { useState, useEffect, useCallback } from 'react'
import { fetchMyShares, type TweetShare } from '../api/twitter'
import './TwitterConnect.css'

function ShareLink({ share }: { share: TweetShare }) {
  if (!share.tweet_id) return null
  const url = share.tweet_url ?? `https://twitter.com/i/web/status/${share.tweet_id}`
  return (
    <a className="twc-share-link" href={url} target="_blank" rel="noopener noreferrer">
      View tweet ↗
    </a>
  )
}

interface Props {
  wallet: string
}

export function TwitterConnect({ wallet }: Props) {
  const [shares,    setShares]    = useState<TweetShare[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showShares, setShowShares] = useState(false)

  const refresh = useCallback(async () => {
    const sh = await fetchMyShares(wallet)
    setShares(sh)
    setLoading(false)
  }, [wallet])

  useEffect(() => { refresh() }, [refresh])

  if (loading) return <div className="twc-loading">Loading…</div>

  const tracked = shares.filter(s => s.tweet_id)

  return (
    <div className="twc-root">
      <div className="twc-info-row">
        <div className="twc-x-logo twc-x-logo--sm">𝕏</div>
        <p className="twc-info-text">
          Share memes to X directly from the feed — hit the 𝕏 button on any meme to post.
        </p>
      </div>

      <div className="twc-connected">
        <div className="twc-rewards-list">
          <span className="twc-reward-chip">10 likes → 75 XP + 15 credits</span>
          <span className="twc-reward-chip">50 likes → 200 XP + 40 credits</span>
          <span className="twc-reward-chip">100 likes → 500 XP + 100 credits</span>
          <span className="twc-reward-chip">1K likes → 1,500 XP + 300 credits</span>
          <span className="twc-reward-chip">10 RTs → 50 XP + 10 credits</span>
          <span className="twc-reward-chip">100 RTs → 250 XP + 50 credits</span>
        </div>

        {tracked.length > 0 && (
          <div className="twc-stats-row">
            <div className="twc-stat">
              <span className="twc-stat-num">{tracked.length}</span>
              <span className="twc-stat-label">Shared</span>
            </div>
          </div>
        )}

        {shares.length > 0 && (
          <>
            <div className="twc-shares-header">
              <button className="twc-shares-toggle" onClick={() => setShowShares(v => !v)}>
                {showShares ? 'Hide' : 'Show'} share history ({shares.length})
              </button>
            </div>
            {showShares && (
              <div className="twc-shares-list">
                {shares.map(s => (
                  <div key={s.id} className="twc-share-item">
                    <span className="twc-share-meme">{s.meme_id}</span>
                    {s.tweet_id
                      ? <ShareLink share={s} />
                      : <span className="twc-metric twc-metric--pending">Pending</span>
                    }
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {shares.length === 0 && (
          <p className="twc-no-shares">No shares yet — hit the 𝕏 button on any meme in the feed.</p>
        )}
      </div>
    </div>
  )
}
