'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { CandlestickSchema, type Candlestick } from '@/lib/schemas/nado'

const CandlestickArraySchema = z.array(CandlestickSchema)

type State = {
  candlesticks: Candlestick[]
  loading: boolean
  error: string | null
}

export function useProtocolCandlesticks(productId: number | null): State {
  const cache = useRef<Map<number, Candlestick[]>>(new Map())
  const [state, setState] = useState<State>({
    candlesticks: [],
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (productId === null) return

    const cached = cache.current.get(productId)
    if (cached) {
      setState({ candlesticks: cached, loading: false, error: null })
      return
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    const controller = new AbortController()

    const load = async () => {
      try {
        const res = await fetch(
          `/api/protocol/candlesticks?product_id=${productId}&limit=30`,
          { signal: controller.signal },
        )
        if (!res.ok) {
          setState({ candlesticks: [], loading: false, error: 'Failed to load candlesticks' })
          return
        }
        const raw: unknown = await res.json()
        const parsed = CandlestickArraySchema.safeParse(raw)
        if (!parsed.success) {
          setState({ candlesticks: [], loading: false, error: 'Invalid candlesticks response' })
          return
        }
        cache.current.set(productId, parsed.data)
        setState({ candlesticks: parsed.data, loading: false, error: null })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setState({ candlesticks: [], loading: false, error: 'Network error' })
      }
    }

    void load()
    return () => controller.abort()
  }, [productId])

  return state
}
