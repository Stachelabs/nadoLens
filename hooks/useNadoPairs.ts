'use client'

import { useEffect, useState } from 'react'

export interface NadoPair {
  product_id: number
  pair: string
  symbol: string
}

const FALLBACK: NadoPair[] = [
  { product_id: 2, pair: 'BTCUSDT0', symbol: 'BTC' },
  { product_id: 4, pair: 'ETHUSDT0', symbol: 'ETH' },
  { product_id: 8, pair: 'SOLUSDT0', symbol: 'SOL' },
  { product_id: 10, pair: 'ARBUSDT0', symbol: 'ARB' },
  { product_id: 14, pair: 'BNBUSDT0', symbol: 'BNB' },
  { product_id: 16, pair: 'AVAXUSDT0', symbol: 'AVAX' },
  { product_id: 18, pair: 'OPUSDT0', symbol: 'OP' },
  { product_id: 20, pair: 'MATICUSDT0', symbol: 'MATIC' },
  { product_id: 22, pair: 'DOGEUSDT0', symbol: 'DOGE' },
  { product_id: 24, pair: 'LINKUSDT0', symbol: 'LINK' },
]

function parsePairs(data: unknown): NadoPair[] {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.pairs)
      ? (data as Record<string, unknown[]>).pairs
      : []
  return (arr as Record<string, unknown>[])
    .map((d) => {
      const id = typeof d.product_id === 'number' ? d.product_id : Number(d.id ?? 0)
      const pair = typeof d.pair === 'string' ? d.pair : ''
      const sym =
        typeof d.symbol === 'string'
          ? d.symbol
          : pair.replace('USDT0', '').replace('USDT', '')
      return { product_id: id, pair, symbol: sym }
    })
    .filter((p) => p.product_id > 0 && p.pair !== '')
}

export function useNadoPairs(): { pairs: NadoPair[]; loading: boolean } {
  const [pairs, setPairs] = useState<NadoPair[]>(FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pairs')
      .then((r) => r.json())
      .then((data: unknown) => {
        const parsed = parsePairs(data)
        if (parsed.length > 0) setPairs(parsed)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { pairs, loading }
}
