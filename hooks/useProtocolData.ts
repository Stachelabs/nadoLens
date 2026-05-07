'use client'

import { useEffect } from 'react'
import { useProtocolStore } from '@/store/protocolStore'
import { EnrichedTickersResponseSchema } from '@/lib/schemas/nado'

const POLL_MS = 10 * 60_000

export function useProtocolData(): void {
  const setTickers = useProtocolStore((s) => s.setTickers)
  const setTickersLoading = useProtocolStore((s) => s.setTickersLoading)
  const setTickersError = useProtocolStore((s) => s.setTickersError)

  useEffect(() => {
    const controller = new AbortController()

    const fetchTickers = async () => {
      const hasCached = useProtocolStore.getState().tickers.length > 0
      if (!hasCached) setTickersLoading(true)

      try {
        const res = await fetch('/api/protocol/tickers', { signal: controller.signal })
        if (!res.ok) {
          if (!hasCached) setTickersError('Failed to load tickers')
          return
        }
        const raw: unknown = await res.json()
        const parsed = EnrichedTickersResponseSchema.safeParse(raw)
        if (!parsed.success) {
          if (!hasCached) setTickersError('Invalid tickers response')
          return
        }
        setTickers(parsed.data)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        if (!hasCached) setTickersError('Network error')
      }
    }

    void fetchTickers()
    const t1 = setInterval(() => { void fetchTickers() }, POLL_MS)
    return () => { clearInterval(t1); controller.abort() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
