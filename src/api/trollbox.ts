import { api } from './client'

// The trollbox: one global chat for the whole suite (memestudio-backend trollbox.js).
// History over REST, everything after that over one shared Server-Sent Events stream.

export interface TrollMessage {
  id: number
  wallet: string | null          // null for system messages
  kind: 'user' | 'system'
  body: string
  created_at: string
  payload?: Record<string, unknown>
}

export interface TrollHistory {
  items: TrollMessage[]
  more: boolean
  online: number
  you: { wallet: string; admin: boolean; muted_until: string | null } | null
}

export type TrollEvent =
  | { type: 'message'; message: TrollMessage }
  | { type: 'delete'; id: number }
  | { type: 'online'; count: number }
  | { type: 'connection'; live: boolean }

export const MAX_LEN = 280

export const fetchTrollHistory = (before?: number) =>
  api<TrollHistory>(`/api/trollbox${before ? `?before=${before}` : ''}`)

export const sendTroll = (body: string) =>
  api<TrollMessage>('/api/trollbox', { method: 'POST', body: { body } })

export const deleteTroll = (id: number) =>
  api<{ ok: true }>(`/api/trollbox/${id}`, { method: 'DELETE' })

export const muteTroll = (wallet: string, minutes: number) =>
  api<{ wallet: string; muted_until: string | null }>('/api/trollbox/mute', { method: 'POST', body: { wallet, minutes } })

// One EventSource for the page: opened by the first subscriber, closed after the last leaves.
// EventSource reconnects by itself and sends Last-Event-ID, so the server fills any gap.
type Handler = (e: TrollEvent) => void
let source: EventSource | null = null
const handlers = new Set<Handler>()
const emit = (e: TrollEvent) => handlers.forEach(h => h(e))

export function subscribeTrollbox(handler: Handler): () => void {
  handlers.add(handler)
  if (!source) {
    source = new EventSource('/api/trollbox/stream')
    source.onopen = () => emit({ type: 'connection', live: true })
    source.onerror = () => emit({ type: 'connection', live: false })
    source.addEventListener('message', e => {
      try { emit({ type: 'message', message: JSON.parse((e as MessageEvent).data) }) } catch { /* malformed */ }
    })
    source.addEventListener('delete', e => {
      try { emit({ type: 'delete', id: JSON.parse((e as MessageEvent).data).id }) } catch { /* malformed */ }
    })
    source.addEventListener('online', e => {
      try { emit({ type: 'online', count: JSON.parse((e as MessageEvent).data).count }) } catch { /* malformed */ }
    })
  }
  return () => {
    handlers.delete(handler)
    if (handlers.size === 0) { source?.close(); source = null }
  }
}
