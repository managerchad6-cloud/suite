export interface MemeVoteItem {
  id: string
  number: number
  userId: string
  description: string
  votes: number
}

export interface MimoStatus {
  mimoEnabled: boolean
  votingState: 'idle' | 'voting' | 'rolling'
  pool: MemeVoteItem[]
  countdownEndsAt: number | null
}

export interface MemeIntakeState {
  items: { id: string; text: string; userId: string; description: string; receivedAt: number }[]
  auto: boolean
  mimo: MimoStatus
}

/**
 * Where a viewer's chat message is, keyed by the id POST /api/chat returned.
 * shown (on the stream overlay) → review (director's inbox) | held (after a video reaction) |
 * dropped (spam filter) → forming (being voiced) → ready (queued, queueMs ahead) → on-air
 */
export type ChatStage = 'shown' | 'review' | 'held' | 'dropped' | 'forming' | 'ready' | 'on-air'
export interface ChatStatus { id: string; stage: ChatStage; at: number; reason?: string; queueMs?: number }

export type WsEvent =
  | { event: 'meme:intake-update'; data: MemeIntakeState }
  | { event: 'chat:status'; data: ChatStatus }
  | { event: string; data: unknown }

type Handler = (e: WsEvent) => void

export class OrchestratorWS {
  private ws: WebSocket | null = null
  private handlers: Handler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private url: string

  constructor(url: string) {
    this.url = url
    this.connect()
  }

  private connect() {
    if (this.destroyed) return
    try {
      this.ws = new WebSocket(this.url)
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsEvent
          this.handlers.forEach((h) => h(msg))
        } catch { /* malformed */ }
      }
      this.ws.onclose = () => {
        if (!this.destroyed) this.reconnectTimer = setTimeout(() => this.connect(), 3000)
      }
      this.ws.onerror = () => this.ws?.close()
    } catch { /* ws unavailable, retry */ }
  }

  on(handler: Handler): () => void {
    this.handlers.push(handler)
    return () => { this.handlers = this.handlers.filter((h) => h !== handler) }
  }

  destroy() {
    this.destroyed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}

// One socket for every Live panel: opened by the first subscriber, closed after the last leaves
let shared: OrchestratorWS | null = null
let subscribers = 0

export function subscribeOrchestrator(url: string, handler: Handler): () => void {
  shared ??= new OrchestratorWS(url)
  subscribers++
  const off = shared.on(handler)
  return () => {
    off()
    if (--subscribers === 0) { shared?.destroy(); shared = null }
  }
}
