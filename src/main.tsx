import { Buffer } from 'buffer'
if (!('Buffer' in globalThis)) (globalThis as unknown as Record<string, unknown>).Buffer = Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import './identity/identity.css'
import App from './App'
import { IdentityProvider } from './identity/IdentityProvider'
import {
  LiveRoute, RetakeRoute, FeedRoute, UnifiedDetailRoute,
  VoteRoute, CastRoute, PrizesRoute, TreasuryRoute,
  StudioRoute, StudioEditRoute,
  FactoryRoute, ForumRoute, ForumBoardRoute, ForumThreadRoute,
  ProfileRoute, PublicProfileRoute, HomeRoute, BagRoute,
  VideoStudioRoute, VideoFeedRoute, NotFoundRoute, RouteError,
} from './routes'

;[
  new FontFace('BradBunR', "url('/assets/BradBunR.woff2') format('woff2')", { weight: 'normal', style: 'normal' }),
  new FontFace('Friendszone', "url('/assets/Friendszone.ttf') format('truetype')", { weight: 'normal', style: 'normal' }),
].forEach(f => f.load().then(loaded => document.fonts.add(loaded)).catch(() => {}))

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError full />,
    children: [
      // A page that breaks shows the error inside the layout, so the nav stays
      { errorElement: <RouteError />, children: [
        { index: true,               element: <HomeRoute /> },
        { path: 'bag',               element: <BagRoute /> },
        { path: 'live',              element: <LiveRoute /> },
        { path: 'pfp',               element: <RetakeRoute /> },
        { path: 'memes',             element: <FeedRoute /> },
        { path: 'memes/:source/:id', element: <UnifiedDetailRoute /> },
        { path: 'vote',              element: <VoteRoute /> },
        { path: 'cast',              element: <CastRoute /> },
        { path: 'cast/:charKey',     element: <CastRoute /> },
        { path: 'prizes',            element: <PrizesRoute /> },
        { path: 'treasury',          element: <TreasuryRoute /> },
        { path: 'studio/:view?',     element: <StudioRoute /> },
        { path: 'studio/edit/:id',   element: <StudioEditRoute /> },
        { path: 'factory',           element: <FactoryRoute /> },
        { path: 'forum',               element: <ForumRoute /> },
        { path: 'forum/b/:boardId',    element: <ForumBoardRoute /> },
        { path: 'forum/:threadId',     element: <ForumThreadRoute /> },
        { path: 'profile',           element: <ProfileRoute /> },
        { path: 'u/:wallet',         element: <PublicProfileRoute /> },
        { path: 'video',             element: <VideoStudioRoute /> },
        { path: 'videos',            element: <VideoFeedRoute /> },
        { path: '*',                 element: <NotFoundRoute /> },
      ] },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IdentityProvider>
      <RouterProvider router={router} />
    </IdentityProvider>
  </StrictMode>,
)
