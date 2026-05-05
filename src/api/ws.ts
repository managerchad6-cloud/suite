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

export type WsEvent =
  | { event: 'meme:intake-update'; data: MemeIntakeState }
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
