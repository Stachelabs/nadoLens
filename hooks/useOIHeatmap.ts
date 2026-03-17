import { useEffect, useMemo, useRef } from 'react'
import { useLiquidationStore } from '@/store/liquidationStore'
import { useOIStore } from '@/store/oiStore'
import { fromX18 } from '@/types/nado'
import type { OIBucket, LiquidationEvent } from '@/types/nado'

const BUCKET_SIZE = 100 // $100 price buckets
const SAVE_INTERVAL_MS = 30_000

function computeBuckets(events: LiquidationEvent[]): OIBucket[] {
  const map = new Map<number, { longUsd: number; shortUsd: number }>()

  for (const event of events) {
    const price = event.priceUsd ?? fromX18(event.price)
    if (price <= 0) continue

    const rawAmount = Math.abs(fromX18(event.amount))
    const amountUsd = event.amountUsd ?? rawAmount * price
    const side = event.side ?? (parseFloat(event.amount) >= 0 ? 'long' : 'short')
    const bucketLow = Math.floor(price / BUCKET_SIZE) * BUCKET_SIZE

    const bucket = map.get(bucketLow) ?? { longUsd: 0, shortUsd: 0 }
    if (side === 'long') bucket.longUsd += amountUsd
    else bucket.shortUsd += amountUsd
    map.set(bucketLow, bucket)
  }

  const buckets: Omit<OIBucket, 'risk_score'>[] = Array.from(map.entries()).map(
    ([priceLow, { longUsd, shortUsd }]) => ({
      price_low: priceLow,
      price_high: priceLow + BUCKET_SIZE,
      long_oi_usd: longUsd,
      short_oi_usd: shortUsd,
    })
  )

  const maxOI = Math.max(...buckets.map((b) => b.long_oi_usd + b.short_oi_usd), 1)

  return buckets
    .map((b) => ({
      ...b,
      risk_score: (b.long_oi_usd + b.short_oi_usd) / maxOI,
    }))
    .sort((a, b) => b.price_low - a.price_low)
}

export function useOIHeatmap(productId = 1): OIBucket[] {
  const events = useLiquidationStore((state) => state.events)
  const setBuckets = useOIStore((state) => state.setBuckets)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buckets = useMemo(() => computeBuckets(events), [events])

  useEffect(() => {
    setBuckets(buckets)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (buckets.length === 0) return
      fetch('/api/oi-heatmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, buckets }),
      }).catch(() => {})
    }, SAVE_INTERVAL_MS)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [buckets, productId, setBuckets])

  return buckets
}
