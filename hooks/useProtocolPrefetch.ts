'use client'

import { useEffect } from 'react'
import { fetchCachedSnapshots } from '@/lib/fetchCachedSnapshots'
import { useProtocolCacheStore } from '@/store/protocolCacheStore'
import { useProtocolStore } from '@/store/protocolStore'
import { EnrichedTickersResponseSchema } from '@/lib/schemas/nado'

export function useProtocolPrefetch(): void {
  useEffect(() => {
    if (useProtocolCacheStore.getState().prefetched) return

    const controller = new AbortController()
    const { signal } = controller

    const prefetch = async () => {
      try {
        const [dailyResult, hourlyResult] = await Promise.allSettled([
          fetchCachedSnapshots(92, 86400, signal, { upgradeToCanonical: true }),
          fetchCachedSnapshots(25, 3600, signal, { upgradeToCanonical: true }),
        ])

        const criticalOk =
          dailyResult.status === 'fulfilled' && hourlyResult.status === 'fulfilled'

        if (criticalOk) {
          useProtocolCacheStore.getState().setPrefetched()
        }

        const hasTickers = useProtocolStore.getState().tickers.length > 0
        if (!hasTickers) {
          fetch('/api/protocol/tickers', { signal })
            .then(async (res) => {
              if (!res.ok) return
              const raw: unknown = await res.json()
              const parsed = EnrichedTickersResponseSchema.safeParse(raw)
              if (parsed.success) {
                useProtocolStore.getState().setTickers(parsed.data)
              }
            })
            .catch(() => {})
        }
      } catch {
        // Prefetch is best-effort — never block app startup
      }
    }

    void prefetch()
    return () => controller.abort()
  }, [])
}
