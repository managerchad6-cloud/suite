import { useState, useEffect, useCallback } from 'react'
import { fetchTweetMetrics, subscribeToMetrics, type TweetMetrics } from '../api/twitter'

export type MetricsMap = Map<string, TweetMetrics>

/** Live metrics for your own tweets; `wallet` is the signed-in member (null = nothing to load). */
export function useXMetrics(wallet: string | null | undefined): MetricsMap {
  const [metrics, setMetrics] = useState<MetricsMap>(new Map())

  const patch = useCallback((updates: TweetMetrics[]) => {
    setMetrics(prev => {
      const next = new Map(prev)
      for (const m of updates) next.set(m.tweet_id, m)
      return next
    })
  }, [])

  useEffect(() => {
    if (!wallet) return
    fetchTweetMetrics().then(patch)
    const unsub = subscribeToMetrics(m => patch([m]))
    return unsub
  }, [wallet, patch])

  return metrics
}
