'use client'

import { useState, useEffect, useRef } from 'react'
import { z } from 'zod'
import { MarketSnapshotSchema, type MarketSnapshot } from '@/lib/schemas/nado'

const MarketSnapshotsArraySchema = z.array(MarketSnapshotSchema)

export function useProtocolMarketSnapshots(count = 31, granularity = 86400) {
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<MarketSnapshot[] | null>(null)

  useEffect(() => {
    if (cacheRef.current) {
      setSnapshots(cacheRef.current)
      setLoading(false)
      return
    }

    const controller = new AbortController()

    const fetchSnapshots = async () => {
      try {
        const res = await fetch(
          `/api/protocol/market-snapshots?count=${count}&granularity=${granularity}`,
          { signal: controller.signal },
        )
        if (!res.ok) {
          setError('Failed to load market snapshots')
          setLoading(false)
          return
        }
        const raw: unknown = await res.json()
        const parsed = MarketSnapshotsArraySchema.safeParse(raw)
        if (!parsed.success) {
          setError('Invalid snapshots data')
          setLoading(false)
          return
        }
        cacheRef.current = parsed.data
        setSnapshots(parsed.data)
        setError(null)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError('Failed to load market snapshots')
        }
      } finally {
        setLoading(false)
      }
    }

    void fetchSnapshots()
    return () => controller.abort()
  }, [count, granularity])

  return { snapshots, loading, error }
}
