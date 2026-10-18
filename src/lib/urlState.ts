// Screen state that belongs in the URL (a tab, a sort, a page), so a reload, the back button or a
// shared link lands on the same screen. Defaults stay out of the URL to keep links clean.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key) as T | null
  const value = raw !== null && (!allowed || allowed.includes(raw)) ? raw : fallback
  const set = useCallback((v: T) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (v === fallback) next.delete(key); else next.set(key, v)
      return next
    }, { replace: true })
  }, [key, fallback, setParams])
  return [value, set]
}

/** A number in the URL (e.g. ?page=3), at least `min` */
export function useUrlNumber(key: string, fallback: number, min = 1): [number, (v: number) => void] {
  const [raw, setRaw] = useUrlState<string>(key, String(fallback))
  const n = Number.parseInt(raw, 10)
  const value = Number.isFinite(n) && n >= min ? n : fallback
  return [value, useCallback((v: number) => setRaw(String(v)), [setRaw])]
}
