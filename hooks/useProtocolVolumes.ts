'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'
import { MarketSnapshotSchema, EnrichedTickerSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'

export type ChartPoint = { date: string; volume: number; cumVol: number }
export type MarketSlice = { productId: string; volume: number }

export type ProtocolVolumesData = {
  volume24h: number
  allTimeVol: number
  dailyChartData: ChartPoint[]
  weeklyChartData: ChartPoint[]
  donut24h: MarketSlice[]
  donut7d: MarketSlice[]
  donut30d: MarketSlice[]
  donut90d: MarketSlice[]
  donutAllTime: MarketSlice[]
  productNames: Record<string, string>
  loading: boolean
  error: string | null
}

type MarketSnapshotType = z.infer<typeof MarketSnapshotSchema>

const MarketSnapshotsArraySchema = z.array(MarketSnapshotSchema)
const EnrichedTickersArraySchema = z.array(EnrichedTickerSchema)

function sumRecord(rec: Record<string, string>): number {
  return Object.values(rec).reduce((s, v) => s + fromX18BigInt(v), 0)
}

function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ts * 1000))
}

function buildChartPoints(snapshots: MarketSnapshotType[]): ChartPoint[] {
  const ordered = [...snapshots].reverse()
  return ordered.map((snap, i) => {
    const cumVol = sumRecord(snap.cumulative_volumes)
    const prevVol = i > 0 ? sumRecord(ordered[i - 1]!.cumulative_volumes) : cumVol
    const volume = i > 0 ? cumVol - prevVol : 0
    return { date: fmtDate(snap.timestamp), volume, cumVol }
  })
}

function buildDeltaSlices(
  latest: Record<string, string>,
  older: Record<string, string>,
): MarketSlice[] {
  const ids = new Set([...Object.keys(latest), ...Object.keys(older)])
  return [...ids].map((productId) => ({
    productId,
    volume: fromX18BigInt(latest[productId] ?? '0') - fromX18BigInt(older[productId] ?? '0'),
  }))
}

function buildAllTimeSlices(snap: MarketSnapshotType): MarketSlice[] {
  return Object.entries(snap.cumulative_volumes).map(([productId, val]) => ({
    productId,
    volume: fromX18BigInt(val),
  }))
}

function build30dSlices(snapshots: MarketSnapshotType[]): MarketSlice[] {
  if (snapshots.length === 0) return []
  if (snapshots.length === 1) return buildAllTimeSlices(snapshots[0]!)
  return buildDeltaSlices(
    snapshots[0]!.cumulative_volumes,
    snapshots[snapshots.length - 1]!.cumulative_volumes,
  )
}

const INITIAL: ProtocolVolumesData = {
  volume24h: 0,
  allTimeVol: 0,
  dailyChartData: [],
  weeklyChartData: [],
  donut24h: [],
  donut7d: [],
  donut30d: [],
  donut90d: [],
  donutAllTime: [],
  productNames: {},
  loading: true,
  error: null,
}

export function useProtocolVolumes(): ProtocolVolumesData {
  const [data, setData] = useState<ProtocolVolumesData>(INITIAL)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchAll = async () => {
      try {
        const [r24h, r7d, r30d, rAllTime, r90d, rTickers] = await Promise.all([
          fetch('/api/protocol/market-snapshots?count=2&granularity=86400', { signal }),
          fetch('/api/protocol/market-snapshots?count=2&granularity=604800', { signal }),
          fetch('/api/protocol/market-snapshots?count=31&granularity=86400', { signal }),
          fetch('/api/protocol/market-snapshots?count=24&granularity=604800', { signal }),
          fetch('/api/protocol/market-snapshots?count=2&granularity=7776000', { signal }),
          fetch('/api/protocol/tickers', { signal }),
        ])

        if (!r24h.ok || !r7d.ok || !r30d.ok || !rAllTime.ok || !r90d.ok || !rTickers.ok) {
          setData((prev) => ({ ...prev, loading: false, error: 'Failed to load volumes data' }))
          return
        }

        const [raw24h, raw7d, raw30d, rawAllTime, raw90d, rawTickers] = await Promise.all([
          r24h.json() as Promise<unknown>,
          r7d.json() as Promise<unknown>,
          r30d.json() as Promise<unknown>,
          rAllTime.json() as Promise<unknown>,
          r90d.json() as Promise<unknown>,
          rTickers.json() as Promise<unknown>,
        ])

        const p24h = MarketSnapshotsArraySchema.safeParse(raw24h)
        const p7d = MarketSnapshotsArraySchema.safeParse(raw7d)
        const p30d = MarketSnapshotsArraySchema.safeParse(raw30d)
        const pAllTime = MarketSnapshotsArraySchema.safeParse(rawAllTime)
        const p90d = MarketSnapshotsArraySchema.safeParse(raw90d)
        const pTickers = EnrichedTickersArraySchema.safeParse(rawTickers)

        if (!p24h.success || !p7d.success || !p30d.success || !pAllTime.success || !p90d.success || !pTickers.success) {
          setData((prev) => ({ ...prev, loading: false, error: 'Invalid volumes data' }))
          return
        }

        const snap24h = p24h.data
        const snap7d = p7d.data
        const snap30d = p30d.data
        const snapAllTime = pAllTime.data
        const snap90d = p90d.data

        const productNames: Record<string, string> = {}
        for (const t of pTickers.data) {
          productNames[String(t.product_id)] = t.symbol
        }

        const volume24h =
          snap24h.length >= 2
            ? sumRecord(snap24h[0]!.cumulative_volumes) - sumRecord(snap24h[1]!.cumulative_volumes)
            : snap24h.length === 1
              ? sumRecord(snap24h[0]!.cumulative_volumes)
              : 0

        const allTimeVol =
          snapAllTime.length > 0 ? sumRecord(snapAllTime[0]!.cumulative_volumes) : 0

        const donut24h =
          snap24h.length >= 2
            ? buildDeltaSlices(snap24h[0]!.cumulative_volumes, snap24h[1]!.cumulative_volumes)
            : snap24h.length === 1
              ? buildAllTimeSlices(snap24h[0]!)
              : []

        const donut7d =
          snap7d.length >= 2
            ? buildDeltaSlices(snap7d[0]!.cumulative_volumes, snap7d[1]!.cumulative_volumes)
            : snap7d.length === 1
              ? buildAllTimeSlices(snap7d[0]!)
              : []

        const donut90d =
          snap90d.length >= 2
            ? buildDeltaSlices(snap90d[0]!.cumulative_volumes, snap90d[1]!.cumulative_volumes)
            : snap90d.length === 1
              ? buildAllTimeSlices(snap90d[0]!)
              : []

        setData({
          volume24h,
          allTimeVol,
          dailyChartData: buildChartPoints(snap30d),
          weeklyChartData: buildChartPoints(snapAllTime),
          donut24h,
          donut7d,
          donut30d: build30dSlices(snap30d),
          donut90d,
          donutAllTime: snapAllTime.length > 0 ? buildAllTimeSlices(snapAllTime[0]!) : [],
          productNames,
          loading: false,
          error: null,
        })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setData((prev) => ({ ...prev, loading: false, error: 'Failed to load volumes data' }))
        }
      }
    }

    void fetchAll()
    return () => controller.abort()
  }, [])

  return data
}
