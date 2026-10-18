import { useOutletContext, useParams, useNavigate, useSearchParams, useRouteError, Navigate } from 'react-router-dom'
import { Live } from './views/Live'
import { Memes } from './views/Memes'
import { Forum } from './views/Forum'
import { Vote } from './views/Vote'
import { Characters } from './views/Characters'
import { RetakeView } from './identity/RetakeView'
import { useIdentity } from './identity/IdentityProvider'
import { Profile } from './views/Profile'
import { MemeStudio } from './views/MemeStudio'
import { Feed } from './views/Feed'
import { Brackets } from './views/Brackets'
import { Treasury } from './views/Treasury'
import { MemePage } from './views/MemePage'
import { PublicProfile } from './views/PublicProfile'
import { VideoStudio } from './views/VideoStudio'
import { VideoFeed } from './views/VideoFeed'
import type { AppOutletContext } from './App'
import type { MemeSourceType } from './types/unified'
import { useBack } from './lib/links'

// Every page is open to everyone; participation inside them is locked for non-members.
// The two pages about *your* account (profile, retake) send non-members to the memes.

export function LiveRoute() {
  return <Live />
}

export function RetakeRoute() {
  const { status } = useIdentity()
  const navigate = useNavigate()
  if (status !== 'member') return <Navigate to="/memes" replace />
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <RetakeView onDone={() => navigate('/profile')} />
    </div>
  )
}

export function FeedRoute() {
  const navigate = useNavigate()
  return (
    <Feed
      onOpenItem={item => navigate(`/memes/${item.type}/${item.sourceId}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
      onRemix={id => navigate(`/studio/edit/${id}`)}
      onOpenStudio={() => navigate('/studio')}
      onOpenFactory={() => navigate('/factory')}
    />
  )
}

export function UnifiedDetailRoute() {
  const { source, id } = useParams<{ source: string; id: string }>()
  const src: MemeSourceType = source === 'studio' || source === 'factory' ? source : 'reddit'
  // Keyed so every meme starts clean (votes, nudges, scroll)
  return <MemePage key={`${src}:${id}`} source={src} id={id!} />
}

export function VoteRoute() {
  return <Vote />
}

export function CastRoute() {
  const { charKey } = useParams<{ charKey?: string }>()
  const navigate = useNavigate()
  return (
    <Characters
      initialChar={charKey ?? null}
      onSelectChar={key => navigate(key ? `/cast/${key}` : '/cast')}
      onOpenDetail={meme => navigate(`/memes/factory/${meme.job_id}`)}
      onOpenUnifiedItem={item => navigate(`/memes/${item.type}/${item.sourceId}`)}
    />
  )
}

export function PrizesRoute() {
  return <Brackets />
}

export function TreasuryRoute() {
  return <Treasury />
}

// /studio is the studio home, /studio/canvas the editor (so a reload stays on the canvas)
export function StudioRoute() {
  const { view } = useParams<{ view?: string }>()
  const navigate = useNavigate()
  if (view && view !== 'canvas') return <Navigate to="/studio" replace />
  return (
    <MemeStudio
      view={view === 'canvas' ? 'editor' : 'home'}
      onViewChange={v => navigate(v === 'editor' ? '/studio/canvas' : '/studio')}
      onPublished={id => navigate(`/memes/studio/${id}`)}
    />
  )
}

export function StudioEditRoute() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  return (
    <MemeStudio
      remixSourceId={id}
      view="editor"
      onViewChange={v => { if (v === 'home') navigate('/studio') }}
      onPublished={pubId => navigate(`/memes/studio/${pubId}`)}
    />
  )
}

export function FactoryRoute() {
  const navigate = useNavigate()
  return (
    <Memes
      onOpenDetail={meme => navigate(`/memes/factory/${meme.job_id}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
    />
  )
}

export function ProfileRoute() {
  const { status } = useIdentity()
  const navigate = useNavigate()
  if (status !== 'member') return <Navigate to="/memes" replace />

  return (
    <Profile
      onGoToOracle={() => navigate('/pfp')}
      onOpenMeme={(source, id) => navigate(`/memes/${source}/${id}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
      onViewPublic={w => navigate(`/u/${w}?as=public`)}
      onOpenStudio={() => navigate('/studio')}
      onOpenFactory={() => navigate('/factory')}
    />
  )
}

export function ForumRoute() {
  const navigate = useNavigate()
  return (
    <Forum
      view="index"
      onOpenBoard={id => navigate(`/forum/b/${id}`)}
    />
  )
}

export function ForumBoardRoute() {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  return (
    <Forum
      view="board"
      boardId={boardId}
      onOpenThread={id => navigate(`/forum/${id}`)}
      onBack={() => navigate('/forum')}
    />
  )
}

export function ForumThreadRoute() {
  const { threadId } = useParams<{ threadId: string }>()
  const back = useBack('/forum')
  return (
    <Forum
      view="thread"
      threadId={threadId}
      onBack={back}
    />
  )
}

// Video (hidden from the nav, not production-ready): its VideoServer has no identity support yet,
// so the studio is for members only and the wallet is passed as before.
export function VideoStudioRoute() {
  const { memberWallet } = useIdentity()
  if (!memberWallet) return <Navigate to="/videos" replace />
  return <VideoStudio address={memberWallet} />
}

export function VideoFeedRoute() {
  const { memberWallet } = useIdentity()
  return <VideoFeed address={memberWallet ?? ''} />
}

/** Something on the page broke: say so plainly, and offer a way out instead of a stack trace */
export function RouteError({ full = false }: { full?: boolean }) {
  const error = useRouteError() as Error | undefined
  console.error('[suite] page error:', error)
  return (
    <div className={`nf-page${full ? ' nf-page--full' : ''}`}>
      <div className="nf-emoji" aria-hidden>💥</div>
      <h1>This page tripped over itself</h1>
      <p>Something went wrong showing it. Reloading usually fixes it.</p>
      <div className="nf-actions">
        <button className="nf-btn nf-btn--gold" onClick={() => window.location.reload()}>Reload</button>
        <button className="nf-btn" onClick={() => { window.location.hash = '#/memes' }}>Go to the memes</button>
      </div>
    </div>
  )
}

/** A link to somewhere that isn't here (a mistyped or old link) */
export function NotFoundRoute() {
  const navigate = useNavigate()
  const back = useBack('/memes')
  return (
    <div className="nf-page">
      <div className="nf-emoji" aria-hidden>🫥</div>
      <h1>Nothing lives here</h1>
      <p>That link is mistyped, or the page moved.</p>
      <div className="nf-actions">
        <button className="nf-btn nf-btn--gold" onClick={() => navigate('/memes', { replace: true })}>Go to the memes</button>
        <button className="nf-btn" onClick={back}>Go back</button>
      </div>
    </div>
  )
}

export function PublicProfileRoute() {
  const { wallet } = useParams<{ wallet: string }>()
  const { openChat } = useOutletContext<AppOutletContext>()
  const { memberWallet } = useIdentity()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const own = wallet === memberWallet
  const back = useBack('/memes')
  // Your own public page is your control room, unless you asked to see it as others do
  if (own && params.get('as') !== 'public') return <Navigate to="/profile" replace />

  return (
    <PublicProfile
      wallet={wallet!}
      previewOwn={own}
      onBack={() => (own ? navigate('/profile') : back())}
      onOpenMeme={(source, id) => navigate(`/memes/${source}/${id}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
      onOpenMessages={openChat}
    />
  )
}
