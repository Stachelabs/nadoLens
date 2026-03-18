'use client'

import { useEffect, useState } from 'react'
import type { PredictedLiqLevel } from '@/app/api/predicted-liquidations/route'

export interface PredictedLiqData {
  levels: PredictedLiqLevel[]
  oraclePrice: number
  totalAccountsScanned: number
  positionsFound: number
  loading: boolean
}

const POLL_INTERVAL = 5 * 60 * 1000

export function usePredictedLiquidations(productId: number): PredictedLiqData {
  const [data, setData] = useState<PredictedLiqData>({
    levels: [],
    oraclePrice: 0,
    totalAccountsScanned: 0,
    positionsFound: 0,
    loading: true,
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        setData((prev) => ({ ...prev, loading: true }))
        const res = await globalThis.fetch(`/api/predicted-liquidations?product_id=${productId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const json = (await res.json()) as Omit<PredictedLiqData, 'loading'>
        setData({
          ...json,
          loading: false,
        })
      } catch {
        setData((prev) => ({ ...prev, loading: false }))
      }
    }

    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [productId])

  return data
}
