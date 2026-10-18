// Links to suite pages for outside the app (tweets, copy link). The suite uses hash routing, and
// plain paths like /memes are API routes on the server, so a shareable link is always /#/….
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export const SUITE_ORIGIN: string = import.meta.env.VITE_PUBLIC_ORIGIN || 'https://suite.virginvschad.vip'

export const memeLink = (source: string, id: string) => `${SUITE_ORIGIN}/#/memes/${source}/${encodeURIComponent(id)}`
export const profileLink = (wallet: string) => `${SUITE_ORIGIN}/#/u/${encodeURIComponent(wallet)}`

/**
 * Back that never leaves the suite: one step back when we got here from inside the app, otherwise
 * (a shared link opened in a new tab) to `fallback`.
 */
export function useBack(fallback: string) {
  const navigate = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}
