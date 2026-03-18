'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useLiquidationStore } from '@/store/liquidationStore'
import { useOIStore } from '@/store/oiStore'
import { fromX18 } from '@/types/nado'
import type { LiquidationEvent } from '@/types/nado'

export interface HeatmapCell {
  timeMs: number
  priceLow: number
  priceHigh: number
  longUsd: number
  shortUsd: number
  intensity: number
}

const SAVE_INTERVAL_MS = 30_000

function medianPrice(events: LiquidationEvent[]): number {
  const prices = events
    .map((e) => e.priceUsd ?? fromX18(e.price))
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
  if (prices.length === 0) return 0
  return prices[Math.floor(prices.length / 2)]
}

function computePriceStep(median: number): number {
  if (median <= 0) return 100
  return Math.pow(10, Math.floor(Math.log10(median / 20)))
}

function computeTimeStep(rangeMs: number): number {
  if (rangeMs < 2 * 3600_000) return 5 * 60_000
  if (rangeMs < 12 * 3600_000) return 30 * 60_000
  if (rangeMs < 48 * 3600_000) return 2 * 3600_000
  if (rangeMs < 7 * 86400_000) return 12 * 3600_000
  return 24 * 3600_000
}

function compute(
  events: LiquidationEvent[],
  productId: number
): { cells: HeatmapCell[]; timeStepMs: number } {
  const filtered =
    productId > 0
      ? events.filter((e) => e.product_ids.includes(productId))
      : events

  if (filtered.length === 0) return { cells: [], timeStepMs: 3600_000 }

  const decoded = filtered
    .map((e) => ({
      timeMs: parseInt(e.timestamp) / 1_000_000,
      price: e.priceUsd ?? fromX18(e.price),
      amountUsd:
        e.amountUsd ?? Math.abs(fromX18(e.amount)) * (e.priceUsd ?? fromX18(e.price)),
      side: e.side ?? (parseFloat(e.amount) >= 0 ? 'long' : 'short'),
    }))
    .filter((d) => d.price > 0 && isFinite(d.timeMs) && d.timeMs > 0)

  if (decoded.length === 0) return { cells: [], timeStepMs: 3600_000 }

  const times = decoded.map((d) => d.timeMs)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const rangeMs = Math.max(maxTime - minTime, 60_000)

  const timeStep = computeTimeStep(rangeMs)
  const priceStep = computePriceStep(medianPrice(filtered))

  const map = new Map<
    string,
    { timeMs: number; priceLow: number; longUsd: number; shortUsd: number }
  >()

  for (const d of decoded) {
    const tBucket = Math.floor(d.timeMs / timeStep) * timeStep
    const pBucket = Math.floor(d.price / priceStep) * priceStep
    const key = `${tBucket}_${pBucket}`
    const cell = map.get(key) ?? {
      timeMs: tBucket,
      priceLow: pBucket,
      longUsd: 0,
      shortUsd: 0,
    }
    if (d.side === 'long') cell.longUsd += d.amountUsd
    else cell.shortUsd += d.amountUsd
    map.set(key, cell)
  }

  const entries = Array.from(map.values())
  const maxUsd = Math.max(
    ...entries.map((c) => c.longUsd + c.shortUsd),
    1
  )

  const cells: HeatmapCell[] = entries.map((c) => ({
    ...c,
    priceHigh: c.priceLow + priceStep,
    intensity: Math.log1p(c.longUsd + c.shortUsd) / Math.log1p(maxUsd),
  }))

  return { cells, timeStepMs: timeStep }
}

export function useOIHeatmap(
  productId: number
): { cells: HeatmapCell[]; timeStepMs: number } {
  const events = useLiquidationStore((s) => s.events)
  const setBuckets = useOIStore((s) => s.setBuckets)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const result = useMemo(() => compute(events, productId), [events, productId])

  // Save aggregated price buckets to oiStore (backward compat)
  useEffect(() => {
    const priceMap = new Map<number, { longUsd: number; shortUsd: number }>()
    for (const c of result.cells) {
      const existing = priceMap.get(c.priceLow) ?? { longUsd: 0, shortUsd: 0 }
      existing.longUsd += c.longUsd
      existing.shortUsd += c.shortUsd
      priceMap.set(c.priceLow, existing)
    }
    const maxOI = Math.max(
      ...Array.from(priceMap.values()).map((v) => v.longUsd + v.shortUsd),
      1
    )
    const priceStep = result.cells.length > 0 ? result.cells[0].priceHigh - result.cells[0].priceLow : 100
    const buckets = Array.from(priceMap.entries()).map(([priceLow, { longUsd, shortUsd }]) => ({
      price_low: priceLow,
      price_high: priceLow + priceStep,
      long_oi_usd: longUsd,
      short_oi_usd: shortUsd,
      risk_score: (longUsd + shortUsd) / maxOI,
    }))
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
  }, [result.cells, productId, setBuckets])

  return result
}
