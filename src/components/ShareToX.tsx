// Share a meme to X with the image attached: connect X once (OAuth popup), compose an X-style post,
// then a live tweet card with confetti and the XP milestones. The same flow as the feed's share.
import { useEffect, useRef, useState } from 'react'
import { fetchXStatus, postXTweet, subscribeToMetrics, X_AUTH_URL, type TweetMetrics } from '../api/twitter'
import { Confetti } from './Confetti'
import '../views/Feed.css'

export interface ShareableMeme {
  sourceId: string
  type: string
  title: string
  imageUrl: string
  wallet?: string | null
}

type Step = 'loading' | 'connect' | 'compose' | 'posting' | 'success'

export function ShareToX({ meme, onClose, onShared }: { meme: ShareableMeme; onClose: () => void; onShared?: () => void }) {
  const [step, setStep] = useState<Step>('loading')
  const [handle, setHandle] = useState<string | null>(null)
  const [text, setText] = useState(`${meme.title}\n\nhttps://virginvschad.vip/memes/${meme.type}/${meme.sourceId}\n\n#VirginVsChad #Memes $VVC`)
  const [community, setCommunity] = useState(false)
  const [tweet, setTweet] = useState<{ id: string; url: string } | null>(null)
  const [metrics, setMetrics] = useState<TweetMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchXStatus()
      .then(s => { if (s.connected && s.handle) { setHandle(s.handle); setStep('compose') } else setStep('connect') })
      .catch(() => setStep('connect'))
  }, [])

  // No page scroll behind the modal; Escape closes it (not while posting)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'posting') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose, step])

  // The compose box grows with its text
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 320) + 'px'
    el.style.overflowY = el.scrollHeight > 320 ? 'auto' : 'hidden'
  }
  useEffect(() => { if (step === 'compose') fit(area.current) }, [step])

  // Live counts on the posted tweet
  useEffect(() => {
    if (!tweet) return
    return subscribeToMetrics(m => { if (m.tweet_id === tweet.id) setMetrics(m) })
  }, [tweet])

  const connect = () => {
    window.open(X_AUTH_URL, 'x-oauth')
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'x_auth') return
      window.removeEventListener('message', onMsg)
      if (e.data.handle) { setHandle(e.data.handle); setStep('compose') }
      else setError(e.data.error || 'X connection failed')
    }
    window.addEventListener('message', onMsg)
  }

  const post = async () => {
    setStep('posting')
    setError(null)
    try {
      const r = await postXTweet({
        text,
        image_url: new URL(meme.imageUrl, window.location.origin).href,
        meme_id: meme.sourceId,
        meme_type: meme.type,
        creator_wallet: meme.wallet ?? undefined,
        share_in_community: community,
      })
      setTweet({ id: r.tweet_id, url: r.tweet_url })
      setHandle(r.handle)
      setStep('success')
      onShared?.()
    } catch (e) {
      setError((e as Error).message)
      setStep('compose')
    }
  }

  const initial = handle?.[0]?.toUpperCase() ?? '?'
  return (
    <div className="feed-share-backdrop" onClick={step === 'posting' ? undefined : onClose}>
      {step === 'success' && <Confetti pieces={90} />}
      <div className={`feed-share-modal${step === 'compose' || step === 'success' ? ' feed-share-modal--wide' : ''}`} onClick={e => e.stopPropagation()}>
        {step !== 'posting' && <button className="feed-share-close" onClick={onClose} aria-label="Close">✕</button>}

        {step === 'loading' && <div className="feed-share-spinner" />}

        {step === 'connect' && (
          <>
            <div className="feed-share-x-logo">𝕏</div>
            <h3 className="feed-share-title">Connect your X account</h3>
            <p className="feed-share-sub">One-time connection, then post memes to X in one click, with the image attached.</p>
            <button className="feed-share-btn feed-share-btn--primary" onClick={connect}>Connect X</button>
          </>
        )}

        {step === 'compose' && (
          <div className="feed-xcompose">
            <div className="feed-xcompose-row">
              <div className="feed-xcompose-avatar">{initial}</div>
              <div className="feed-xcompose-right">
                <div className="feed-xcompose-handle">@{handle}</div>
                <textarea ref={area} className="feed-xcompose-textarea" value={text} autoFocus
                  onChange={e => { fit(e.target); setText(e.target.value.slice(0, 280)) }} />
                <div className="feed-xcompose-img-wrap"><img src={meme.imageUrl} className="feed-xcompose-img" alt="meme preview" /></div>
              </div>
            </div>
            <label className="feed-xcompose-community">
              <input type="checkbox" checked={community} onChange={e => setCommunity(e.target.checked)} />
              Share in the VvC community
            </label>
            <div className="feed-xcompose-footer">
              <span className={`feed-xcompose-counter${text.length > 260 ? ' feed-xcompose-counter--warn' : ''}`}>{280 - text.length}</span>
              <button className="feed-xcompose-post-btn" onClick={post} disabled={!text.trim()}>Post</button>
            </div>
          </div>
        )}

        {step === 'posting' && (
          <>
            <div className="feed-share-x-logo">𝕏</div>
            <h3 className="feed-share-title">Posting…</h3>
            <p className="feed-share-sub">Uploading the image and posting to X.</p>
            <div className="feed-share-spinner" />
          </>
        )}

        {step === 'success' && (
          <>
            <div className="feed-xcard">
              <div className="feed-xcard-header">
                <div className="feed-xcard-avatar">{initial}</div>
                <div className="feed-xcard-meta">
                  <span className="feed-xcard-name">Virgin Vs Chad</span>
                  <span className="feed-xcard-handle">@{handle}</span>
                </div>
                <span className="feed-xcard-logo">𝕏</span>
              </div>
              <p className="feed-xcard-text">{text}</p>
              <img src={meme.imageUrl} className="feed-xcard-img" alt="meme" />
              <div className="feed-xcard-actions">
                <span className="feed-xcard-action">💬 <em>{(metrics?.reply_count ?? 0).toLocaleString()}</em></span>
                <span className="feed-xcard-action">🔁 <em>{(metrics?.retweet_count ?? 0).toLocaleString()}</em></span>
                <span className="feed-xcard-action">❤️ <em>{(metrics?.like_count ?? 0).toLocaleString()}</em></span>
                {(metrics?.impression_count ?? 0) > 0 && <span className="feed-xcard-action">👁 <em>{metrics!.impression_count.toLocaleString()}</em></span>}
              </div>
            </div>
            <div className="feed-share-rewards" style={{ marginTop: 4 }}>
              <span className="feed-share-reward-chip">10 likes → 75 XP</span>
              <span className="feed-share-reward-chip">50 likes → 200 XP</span>
              <span className="feed-share-reward-chip">10 RTs → 50 XP</span>
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {tweet && <a href={tweet.url} target="_blank" rel="noopener noreferrer" className="feed-share-btn feed-share-btn--post"
                style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>View on X ↗</a>}
              <button className="feed-share-btn feed-share-btn--secondary" onClick={onClose} style={{ flex: 1 }}>Done</button>
            </div>
          </>
        )}

        {error && <p className="feed-share-sub" style={{ color: '#f0a0a0' }}>{error}</p>}
      </div>
    </div>
  )
}
