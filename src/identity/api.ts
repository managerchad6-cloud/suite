// Typed calls to the identity service (/api/identity). Shapes mirror apps/identity/README.md.
import { api } from '../api/client'

export type State = 'guest' | 'pending' | 'member'

export interface ImageState {
  status: 'none' | 'generating' | 'ready' | 'failed'
  url: string | null
  error?: string
}

export interface Profile {
  archetype: string
  description: string
  attributes: Record<string, string>
  updatedAt: string | null
  avatar: ImageState
  portrait: ImageState
  fallbackImageUrl: string
}

export interface Account {
  wallet: string
  state: Exclude<State, 'guest'>
  createdAt: string
  memberSince: string | null
  profile: Profile | null
}

export type Me =
  | { state: 'guest' }
  | {
      state: 'pending' | 'member'
      wallet: string
      account: Account
      onboarding: { interviewId: string; kind: 'onboarding' | 'retake'; turn: number } | null
      session: { expiresAt: string }
    }

export type SignedIn = Exclude<Me, { state: 'guest' }>

export interface Question {
  done: false
  type: 'single' | 'multi' | 'open'
  question: string
  options?: string[]
}

export interface Interview {
  id: string
  kind: 'onboarding' | 'retake'
  status: 'active' | 'completed' | 'abandoned'
  turn: number
  question: Question | null
  rerollsLeft: number | null
}

export interface Challenge {
  nonce: string
  message: string
  input: Record<string, string>
  expiresAt: string
}

export interface PublicProfile {
  wallet: string
  memberSince: string
  archetype: string
  description: string
  avatarUrl: string | null
  portraitUrl: string | null
  fallbackImageUrl: string
}

const ID = '/api/identity'

export const getMe = () => api<Me>(`${ID}/me`)
export const challenge = (wallet: string) => api<Challenge>(`${ID}/challenge`, { method: 'POST', body: { wallet } })
export const verify = (body: { nonce: string; signature: string; signedMessage?: string }) =>
  api<SignedIn>(`${ID}/verify`, { method: 'POST', body })
export const logout = () => api<{ state: 'guest' }>(`${ID}/logout`, { method: 'POST' })

export const getInterview = () => api<{ interview: Interview | null }>(`${ID}/onboarding`)
export const startOnboarding = () => api<{ interview: Interview }>(`${ID}/onboarding/start`, { method: 'POST' })
export const restartInterview = () => api<{ interview: Interview }>(`${ID}/onboarding/restart`, { method: 'POST' })
export const answerQuestion = (interview: Interview, answer: string) =>
  api<{ completed: boolean; interview: Interview; me?: SignedIn }>(`${ID}/onboarding/answer`, {
    method: 'POST', body: { interviewId: interview.id, turn: interview.turn, answer },
  })

export const startRetake = () => api<{ interview: Interview }>(`${ID}/profile/retake`, { method: 'POST' })
export const cancelRetake = () => api<{ interview: null }>(`${ID}/profile/retake/cancel`, { method: 'POST' })
export const reroll = (feedback?: string) =>
  api<{ interview: Interview; me: SignedIn }>(`${ID}/profile/reroll`, { method: 'POST', body: { feedback } })
export const retryAvatar = () => api<{ me: SignedIn }>(`${ID}/profile/avatar/retry`, { method: 'POST' })
export const requestPortrait = () => api<{ me: SignedIn }>(`${ID}/profile/portrait`, { method: 'POST' })

// ── Public profiles (anyone's avatar) ──────────────────────────────────────
const publicCache = new Map<string, Promise<PublicProfile | null>>()

/** A member's public profile, cached for the page's lifetime; null for non-members. */
export function getPublicProfile(wallet: string): Promise<PublicProfile | null> {
  let p = publicCache.get(wallet)
  if (!p) {
    p = api<PublicProfile>(`${ID}/profiles/${encodeURIComponent(wallet)}`).catch(() => null)
    publicCache.set(wallet, p)
  }
  return p
}

/** Best image for a profile: portrait, then generated avatar, then the archetype's stock art. */
export function bestImage(p: Pick<PublicProfile, 'portraitUrl' | 'avatarUrl' | 'fallbackImageUrl'>): string {
  return p.portraitUrl ?? p.avatarUrl ?? p.fallbackImageUrl
}

export function profileImage(p: Profile): string {
  return p.portrait.url ?? p.avatar.url ?? p.fallbackImageUrl
}
