import type { DraftPayload } from '../api/memes'

export type SessionSnapshot = DraftPayload & { savedAt: string }

const DB_NAME    = 'vvc_studio'
const DB_VERSION = 1
const STORE      = 'sessions'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'wallet' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function saveSession(snapshot: SessionSnapshot): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(snapshot)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('[studioDb] saveSession failed:', e)
  }
}

export async function loadSession(wallet: string): Promise<SessionSnapshot | null> {
  try {
    const db = await openDb()
    return new Promise<SessionSnapshot | null>((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(wallet)
      req.onsuccess = () => resolve((req.result as SessionSnapshot) ?? null)
      req.onerror   = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[studioDb] loadSession failed:', e)
    return null
  }
}

export async function clearSession(wallet: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(wallet)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('[studioDb] clearSession failed:', e)
  }
}
