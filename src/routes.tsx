import { useOutletContext, useParams, useNavigate, Navigate } from 'react-router-dom'
import { Live } from './views/Live'
import { Memes } from './views/Memes'
import { Forum } from './views/Forum'
import { Vote } from './views/Vote'
import { Characters } from './views/Characters'
import { Quiz } from './views/Quiz'
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

export function LiveRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  return <Live address={address} />
}

export function PfpRoute() {
  const { address, setProfile } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Quiz address={address} onProfileUpdate={setProfile} onComplete={() => navigate('/live')} />
    </div>
  )
}

export function FeedRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <Feed
      address={address}
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
  const { address } = useOutletContext<AppOutletContext>()
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
      address={address}
      onBack={() => navigate(-1)}
      onOpenCharacter={name => navigate(`/cast/${name}`)}
      onRemix={remixId => navigate(`/studio/edit/${remixId}`)}
      onOpenSourceMeme={remixId => navigate(`/memes/studio/${remixId}`)}
    />
  )
}

export function VoteRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  return <Vote address={address} />
}

export function CastRoute() {
  const { charKey } = useParams<{ charKey?: string }>()
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <Characters
      address={address}
      initialChar={charKey ?? null}
      onOpenDetail={meme => navigate(`/memes/factory/${meme.job_id}`)}
      onOpenUnifiedItem={item => navigate(`/memes/${item.type}/${item.sourceId}`)}
    />
  )
}

export function PrizesRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  return <Brackets address={address} />
}

export function TreasuryRoute() {
  return <Treasury />
}

export function StudioRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <MemeStudio
      address={address}
      onPublished={id => navigate(`/memes/studio/${id}`)}
    />
  )
}

export function StudioEditRoute() {
  const { id } = useParams<{ id: string }>()
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <MemeStudio
      address={address}
      remixSourceId={id}
      onPublished={pubId => navigate(`/memes/studio/${pubId}`)}
    />
  )
}

export function FactoryRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <Memes
      address={address}
      onOpenDetail={meme => navigate(`/memes/factory/${meme.job_id}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
    />
  )
}

export function ProfileRoute() {
  const { address, profile } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()

  return (
    <Profile
      address={address}
      profile={profile}
      onGoToOracle={() => navigate('/pfp')}
      onOpenDetail={meme => navigate(`/memes/factory/${meme.job_id}`)}
      onOpenStudioMeme={id => navigate(`/memes/studio/${id}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
    />
  )
}

export function ForumRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <Forum
      view="index"
      address={address}
      onOpenBoard={id => navigate(`/forum/b/${id}`)}
    />
  )
}

export function ForumBoardRoute() {
  const { boardId } = useParams<{ boardId: string }>()
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <Forum
      view="board"
      address={address}
      boardId={boardId}
      onOpenThread={id => navigate(`/forum/${id}`)}
      onBack={() => navigate('/forum')}
    />
  )
}

export function ForumThreadRoute() {
  const { threadId } = useParams<{ threadId: string }>()
  const { address } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()
  return (
    <Forum
      view="thread"
      address={address}
      threadId={threadId}
      onBack={() => navigate(-1)}
    />
  )
}

export function VideoStudioRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  return <VideoStudio address={address} />
}

export function VideoFeedRoute() {
  const { address } = useOutletContext<AppOutletContext>()
  return <VideoFeed address={address} />
}

export function PublicProfileRoute() {
  const { wallet } = useParams<{ wallet: string }>()
  const { address, openChat } = useOutletContext<AppOutletContext>()
  const navigate = useNavigate()

  if (wallet === address) return <Navigate to="/profile" replace />

  return (
    <PublicProfile
      wallet={wallet!}
      address={address}
      onBack={() => navigate(-1)}
      onOpenDetail={meme => navigate(`/memes/factory/${meme.job_id}`)}
      onOpenProfile={w => navigate(`/u/${w}`)}
      onOpenMessages={openChat}
    />
  )
}
