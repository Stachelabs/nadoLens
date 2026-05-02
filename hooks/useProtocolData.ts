'use client'

import { useEffect } from 'react'
import { useProtocolStore } from '@/store/protocolStore'
import {
  EnrichedTickersResponseSchema,
  LiquidationFeedResponseSchema,
} from '@/lib/schemas/nado'

const POLL_MS = 30_000

export function useProtocolData(): void {
  const setTickers = useProtocolStore((s) => s.setTickers)
  const setTickersLoading = useProtocolStore((s) => s.setTickersLoading)
  const setTickersError = useProtocolStore((s) => s.setTickersError)
  const setLiquidations = useProtocolStore((s) => s.setLiquidations)
  const setLiquidationsLoading = useProtocolStore((s) => s.setLiquidationsLoading)

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

    const fetchLiquidations = async () => {
      setLiquidationsLoading(true)
      try {
        const res = await fetch('/api/protocol/liquidations')
        if (!res.ok) {
          setLiquidationsLoading(false)
          return
        }
        const raw: unknown = await res.json()
        const parsed = LiquidationFeedResponseSchema.safeParse({ liquidation_feed: raw })
        if (parsed.success) {
          setLiquidations(parsed.data.liquidation_feed)
        } else {
          setLiquidationsLoading(false)
        }
      } catch {
        setLiquidationsLoading(false)
      }
    }

    void fetchTickers()
    void fetchLiquidations()

    const t1 = setInterval(() => { void fetchTickers() }, POLL_MS)
    const t2 = setInterval(() => { void fetchLiquidations() }, POLL_MS)

    return () => {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
