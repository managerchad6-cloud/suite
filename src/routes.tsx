import { useOutletContext, useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom'
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
import { UnifiedMemeDetail } from './views/UnifiedMemeDetail'
import { PublicProfile } from './views/PublicProfile'
import { VideoStudio } from './views/VideoStudio'
import { VideoFeed } from './views/VideoFeed'
import type { AppOutletContext } from './App'
import type { MemeSourceType } from './types/unified'

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
  const navigate = useNavigate()

  const imageUrl =
    source === 'studio'  ? `/handmade/${id}/image` :
    source === 'factory' ? `/jobs/${id}/image`      :
                           `/memebank/${id}/image`

  const item = {
    key: `${source}:${id}` as string,
    type: source as MemeSourceType,
    sourceId: id!,
    imageUrl,
    title: '',
    meta: '',
    dateIso: '',
  }

  return (
    <UnifiedMemeDetail
      item={item}
      onBack={() => navigate(-1)}
      onOpenCharacter={name => navigate(`/cast/${name}`)}
      onRemix={remixId => navigate(`/studio/edit/${remixId}`)}
      onOpenSourceMeme={remixId => navigate(`/memes/studio/${remixId}`)}
    />
  )
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

export function StudioRoute() {
  const navigate = useNavigate()
  return (
    <MemeStudio
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
  const navigate = useNavigate()
  return (
    <Forum
      view="thread"
      threadId={threadId}
      onBack={() => navigate(-1)}
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

export function PublicProfileRoute() {
  const { wallet } = useParams<{ wallet: string }>()
  const { openChat } = useOutletContext<AppOutletContext>()
  const { memberWallet } = useIdentity()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const own = wallet === memberWallet
  // Your own public page is your control room, unless you asked to see it as others do
  if (own && params.get('as') !== 'public') return <Navigate to="/profile" replace />

  return (
    <PublicProfile
      wallet={wallet!}
      previewOwn={own}
      onBack={() => (own ? navigate('/profile') : navigate(-1))}
      onOpenMeme={(source, id) => navigate(`/memes/${source}/${id}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
      onOpenMessages={openChat}
    />
  )
}
