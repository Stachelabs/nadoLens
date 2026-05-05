'use client'

import { useEffect } from 'react'
import { useProtocolStore } from '@/store/protocolStore'
import { EnrichedTickersResponseSchema } from '@/lib/schemas/nado'

const POLL_MS = 30_000

export function useProtocolData(): void {
  const setTickers = useProtocolStore((s) => s.setTickers)
  const setTickersLoading = useProtocolStore((s) => s.setTickersLoading)
  const setTickersError = useProtocolStore((s) => s.setTickersError)

  useEffect(() => {
    const fetchTickers = async () => {
      setTickersLoading(true)
      try {
        const res = await fetch('/api/protocol/tickers')
        if (!res.ok) {
          setTickersError('Failed to load tickers')
          return
        }
        const raw: unknown = await res.json()
        const parsed = EnrichedTickersResponseSchema.safeParse(raw)
        if (!parsed.success) {
          setTickersError('Invalid tickers response')
          return
        }
        setTickers(parsed.data)
      } catch {
        setTickersError('Network error')
      }
    }

    void fetchTickers()
    const t1 = setInterval(() => { void fetchTickers() }, POLL_MS)
    return () => { clearInterval(t1) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
