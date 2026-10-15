// The one way the suite talks to its own backends.
//
// - Same-origin only; the session lives in HttpOnly cookies set by identity, never in JS.
// - API reads are never served from the HTTP cache.
// - Errors are ApiError with the server's {code, message}.
// - A service answering 401 means the 15-minute access token ran out: renew it once through
//   identity and retry. If that fails the session is over ('vvc:signed-out').
// - A 403 membership_required opens the Join flow ('vvc:join-required').

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const SIGNED_OUT_EVENT = 'vvc:signed-out'
export const JOIN_REQUIRED_EVENT = 'vvc:join-required'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  method?: Method
  body?: unknown
  signal?: AbortSignal
}

let refreshing: Promise<boolean> | null = null

/** Renew the access token (once at a time, however many requests hit a 401 together). */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/identity/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(r => r.ok, () => false)
    .finally(() => { setTimeout(() => { refreshing = null }, 0) })
  return refreshing
}

async function send(path: string, { method = 'GET', body, signal }: RequestOptions): Promise<Response> {
  return fetch(path, {
    method,
    signal,
    credentials: 'same-origin',
    cache: method === 'GET' ? 'no-store' : undefined,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function toError(res: Response): Promise<ApiError> {
  // Services disagree on the field name: identity {message}, memestudio/MF {detail}, livestream {error}
  const data = await res.json().catch(() => null) as { code?: string; message?: string; detail?: string; error?: string } | null
  const message = data?.message ?? data?.detail ?? data?.error ?? `Request failed (${res.status})`
  return new ApiError(res.status, data?.code ?? `http_${res.status}`, message)
}

/** JSON request to one of our own services. Resolves with the parsed body (undefined for 204). */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options)

  // Identity renews its own sessions; everyone else may need a fresh access token
  if (res.status === 401 && !path.startsWith('/api/identity/')) {
    if (await refreshSession()) res = await send(path, options)
    if (res.status === 401) window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
  }

  if (!res.ok) {
    const err = await toError(res)
    if (err.status === 403 && err.code === 'membership_required') {
      window.dispatchEvent(new CustomEvent(JOIN_REQUIRED_EVENT, { detail: { reason: null } }))
    }
    throw err
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
