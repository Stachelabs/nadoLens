'use client'

import { useEffect, useState } from 'react'
import { FundingRatesResponseSchema, type FundingRateEntry } from '@/lib/schemas/nado'

type State = {
  rates: Record<string, FundingRateEntry>
  loading: boolean
  error: string | null
}

export function useProtocolFundingRates(productIds: number[]): State {
  const [state, setState] = useState<State>({
    rates: {},
    loading: false,
    error: null,
  })

  const key = [...productIds].sort((a, b) => a - b).join(',')

  useEffect(() => {
    if (productIds.length === 0) return

    setState((prev) => ({ ...prev, loading: true, error: null }))

    const controller = new AbortController()

    const load = async () => {
      try {
        const res = await fetch(`/api/protocol/funding-rates?product_ids=${key}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          setState({ rates: {}, loading: false, error: 'Failed to load funding rates' })
          return
        }
        const raw: unknown = await res.json()
        const parsed = FundingRatesResponseSchema.safeParse(raw)
        if (!parsed.success) {
          setState({ rates: {}, loading: false, error: 'Invalid funding rates response' })
          return
        }
        setState({ rates: parsed.data, loading: false, error: null })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setState({ rates: {}, loading: false, error: 'Network error' })
      }
    }

    void load()
    return () => controller.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
