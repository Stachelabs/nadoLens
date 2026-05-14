'use client'

import { useState, useEffect, useMemo } from 'react'
import type { MarketSnapshot } from '@/lib/schemas/nado'
import { fetchCachedSnapshots } from '@/lib/fetchCachedSnapshots'
import { useProtocolCacheStore, getSnapshotsFromBucket } from '@/store/protocolCacheStore'

export function useProtocolMarketSnapshots(count = 31, granularity = 86400, enabled = true) {
  const bucket = useProtocolCacheStore((s) => s.buckets[granularity])
  const cached = useMemo(() => getSnapshotsFromBucket(bucket, count), [bucket, count])
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const hit = getSnapshotsFromBucket(useProtocolCacheStore.getState().buckets[granularity], count)
    if (hit) {
      setSnapshots(hit)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    const load = async () => {
      try {
        const data = await fetchCachedSnapshots(count, granularity, controller.signal)
        setSnapshots(data)
        setError(null)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setError('Failed to load market snapshots')
      } finally {
        setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [count, granularity, enabled])

  if (cached) return { snapshots: cached, loading: false, error: null }
  return { snapshots, loading, error }
}
