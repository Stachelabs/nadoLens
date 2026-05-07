'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'
import { MarketSnapshotSchema, EnrichedTickerSchema, ProductsIdsResponseSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'
import { useProtocolStore } from '@/store/protocolStore'

export type ChartPoint = { ts: number; date: string; volume: number; cumVol: number; cumPerpVol: number; cumSpotVol: number; perpVol: number; spotVol: number }
export type MarketSlice = { productId: string; volume: number }

export type ProtocolVolumesData = {
  volume24h: number
  allTimeVol: number
  hourlyChartData: ChartPoint[]
  dailyChartData: ChartPoint[]
  weeklyChartData: ChartPoint[]
  donut24h: MarketSlice[]
  donut7d: MarketSlice[]
  donut30d: MarketSlice[]
  donut60d: MarketSlice[]
  donut90d: MarketSlice[]
  donutAllTime: MarketSlice[]
  productNames: Record<string, string>
  loading: boolean
  backgroundLoading: boolean
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

function fmtHour(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts * 1000))
}

function buildChartPoints(
  snapshots: MarketSnapshotType[],
  spotIds: Set<string> = new Set(),
  dateFn = fmtDate,
): ChartPoint[] {
  const ordered = [...snapshots].reverse()
  return ordered.map((snap, i) => {
    const cumVol = sumRecord(snap.cumulative_volumes)
    const prevVol = i > 0 ? sumRecord(ordered[i - 1]!.cumulative_volumes) : cumVol
    const volume = i > 0 ? cumVol - prevVol : 0
    let cumPerpVol = 0
    let cumSpotVol = 0
    for (const [id, val] of Object.entries(snap.cumulative_volumes)) {
      const v = fromX18BigInt(val)
      if (spotIds.has(id)) cumSpotVol += v
      else cumPerpVol += v
    }
    let prevCumPerpVol = cumPerpVol
    let prevCumSpotVol = cumSpotVol
    if (i > 0) {
      prevCumPerpVol = 0
      prevCumSpotVol = 0
      for (const [id, val] of Object.entries(ordered[i - 1]!.cumulative_volumes)) {
        const v = fromX18BigInt(val)
        if (spotIds.has(id)) prevCumSpotVol += v
        else prevCumPerpVol += v
      }
    }
    const perpVol = i > 0 ? cumPerpVol - prevCumPerpVol : 0
    const spotVol = i > 0 ? cumSpotVol - prevCumSpotVol : 0
    return { ts: snap.timestamp, date: dateFn(snap.timestamp), volume, cumVol, cumPerpVol, cumSpotVol, perpVol, spotVol }
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
  hourlyChartData: [],
  dailyChartData: [],
  weeklyChartData: [],
  donut24h: [],
  donut7d: [],
  donut30d: [],
  donut60d: [],
  donut90d: [],
  donutAllTime: [],
  productNames: {},
  loading: true,
  backgroundLoading: true,
  error: null,
}

export function useProtocolVolumes(): ProtocolVolumesData {
  const [data, setData] = useState<ProtocolVolumesData>(INITIAL)
  const cachedTickers = useProtocolStore((s) => s.tickers)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchAll = async () => {
      try {
        // Start ALL fetches simultaneously — priority and background fire at the same time.
        const f24h = fetch('/api/protocol/market-snapshots?count=2&granularity=86400', { signal })
        const fHourly = fetch('/api/protocol/market-snapshots?count=25&granularity=3600', { signal })
        const f30d = fetch('/api/protocol/market-snapshots?count=31&granularity=86400', { signal })
        const fTickers = cachedTickers.length > 0 ? null : fetch('/api/protocol/tickers', { signal })
        const fProducts = fetch('/api/protocol/products', { signal })
        const f7d = fetch('/api/protocol/market-snapshots?count=2&granularity=604800', { signal })
        const f91d = fetch('/api/protocol/market-snapshots?count=91&granularity=86400', { signal })
        const fAllTime = fetch('/api/protocol/market-snapshots?count=24&granularity=604800', { signal })
        const f90d = fetch('/api/protocol/market-snapshots?count=2&granularity=7776000', { signal })
        // Side-chain error handlers to prevent unhandled rejection during Wave 1
        f7d.catch(() => {}); f91d.catch(() => {}); fAllTime.catch(() => {}); f90d.catch(() => {})

        // Wave 1 — render 30d view as soon as priority group resolves
        const [r24h, rHourly, r30d, rTickers, rProducts] = await Promise.all([f24h, fHourly, f30d, fTickers ?? Promise.resolve(null), fProducts])

        if (!r24h.ok || !r30d.ok || (rTickers && !rTickers.ok) || !rProducts.ok) {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Failed to load volumes data' }))
          return
        }

        const [raw24h, rawHourly, raw30d, rawTickers, rawProducts] = await Promise.all([
          r24h.json() as Promise<unknown>,
          rHourly.ok ? (rHourly.json() as Promise<unknown>) : Promise.resolve([]),
          r30d.json() as Promise<unknown>,
          rTickers ? (rTickers.json() as Promise<unknown>) : Promise.resolve(cachedTickers as unknown),
          rProducts.json() as Promise<unknown>,
        ])

        const pHourly = MarketSnapshotsArraySchema.safeParse(rawHourly)

        const p24h = MarketSnapshotsArraySchema.safeParse(raw24h)
        const p30d = MarketSnapshotsArraySchema.safeParse(raw30d)
        const pTickers = EnrichedTickersArraySchema.safeParse(rawTickers)

        if (!p24h.success || !p30d.success || !pTickers.success) {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Invalid volumes data' }))
          return
        }

        const snap24h = p24h.data
        const snap30d = p30d.data

        const productNames: Record<string, string> = {}
        for (const t of pTickers.data) {
          productNames[String(t.product_id)] = t.symbol
        }
        const pProducts = ProductsIdsResponseSchema.safeParse(rawProducts)
        const productsData = pProducts.success ? pProducts.data : { spot_ids: [], perp_ids: [] }
        const spotIds = new Set((productsData.spot_ids ?? []).map(String))

        const volume24h =
          snap24h.length >= 2
            ? sumRecord(snap24h[0]!.cumulative_volumes) - sumRecord(snap24h[1]!.cumulative_volumes)
            : snap24h.length === 1
              ? sumRecord(snap24h[0]!.cumulative_volumes)
              : 0

        // Use most recent daily snapshot for allTimeVol (background wave will refine with weekly)
        const allTimeVol = snap30d.length > 0 ? sumRecord(snap30d[0]!.cumulative_volumes) : 0

        const donut24h =
          snap24h.length >= 2
            ? buildDeltaSlices(snap24h[0]!.cumulative_volumes, snap24h[1]!.cumulative_volumes)
            : snap24h.length === 1
              ? buildAllTimeSlices(snap24h[0]!)
              : []

        setData((prev) => ({
          ...prev,
          volume24h,
          allTimeVol,
          hourlyChartData: pHourly.success ? buildChartPoints(pHourly.data, spotIds, fmtHour) : [],
          dailyChartData: buildChartPoints(snap30d, spotIds),
          donut24h,
          donut30d: build30dSlices(snap30d.slice(0, 31)),
          productNames,
          loading: false,
          backgroundLoading: true,
          error: null,
        }))

        // Wave 2 — extend with remaining timeframes
        const [r7d, r91d, rAllTime, r90d] = await Promise.all([f7d, f91d, fAllTime, f90d])

        if (!r7d.ok || !r91d.ok || !rAllTime.ok || !r90d.ok) {
          setData((prev) => ({ ...prev, backgroundLoading: false }))
          return
        }

        const [raw7d, raw91d, rawAllTime, raw90d] = await Promise.all([
          r7d.json() as Promise<unknown>,
          r91d.json() as Promise<unknown>,
          rAllTime.json() as Promise<unknown>,
          r90d.json() as Promise<unknown>,
        ])

        const p7d = MarketSnapshotsArraySchema.safeParse(raw7d)
        const p91d = MarketSnapshotsArraySchema.safeParse(raw91d)
        const pAllTime = MarketSnapshotsArraySchema.safeParse(rawAllTime)
        const p90d = MarketSnapshotsArraySchema.safeParse(raw90d)

        if (!p7d.success || !p91d.success || !pAllTime.success || !p90d.success) {
          setData((prev) => ({ ...prev, backgroundLoading: false }))
          return
        }

        const snap7d = p7d.data
        const snap91d = p91d.data
        const snapAllTime = pAllTime.data
        const snap90d = p90d.data

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

        setData((prev) => ({
          ...prev,
          allTimeVol: snapAllTime.length > 0 ? sumRecord(snapAllTime[0]!.cumulative_volumes) : prev.allTimeVol,
          dailyChartData: buildChartPoints(snap91d, spotIds),
          weeklyChartData: buildChartPoints(snapAllTime, spotIds),
          donut7d,
          donut60d: build30dSlices(snap91d.slice(0, 61)),
          donut90d,
          donutAllTime: snapAllTime.length > 0 ? buildAllTimeSlices(snapAllTime[0]!) : [],
          backgroundLoading: false,
        }))
      } catch (e) {
        if (!(e instanceof Error) || e.name !== 'AbortError') {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Failed to load volumes data' }))
        }
      }
    }

    void fetchAll()
    return () => controller.abort()
  }, [])

  return data
}
