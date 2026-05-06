'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'
import { MarketSnapshotSchema, EnrichedTickerSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'

export type ChartPoint = {
  ts: number
  date: string
  fees: number
  cumFees: number
  makerRebates: number
  netFees: number
  newUsers: number
  cumUsers: number
  dau: number
}

export type MarketSlice = { productId: string; volume: number }

export type ProtocolRevenueData = {
  fees24h: number
  totalFees: number
  makerRebates: number
  totalUsers: number
  newUsers24h: number
  avgFeesPerUser: number
  traders24h: number
  dailyChartData: ChartPoint[]
  weeklyChartData: ChartPoint[]
  feeDonutSlices: MarketSlice[]
  productNames: Record<string, string>
  loading: boolean
  backgroundLoading: boolean
  error: string | null
}

type MarketSnapshotType = z.infer<typeof MarketSnapshotSchema>

const MarketSnapshotsArraySchema = z.array(MarketSnapshotSchema)
const EnrichedTickersArraySchema = z.array(EnrichedTickerSchema)

function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ts * 1000))
}

function netTakerFees(snap: MarketSnapshotType): Record<string, number> {
  const takerFees = snap.cumulative_taker_fees ?? {}
  const seqFees = snap.cumulative_sequencer_fees ?? {}
  const result: Record<string, number> = {}
  for (const [id, val] of Object.entries(takerFees)) {
    const taker = fromX18BigInt(val)
    const seq = fromX18BigInt(seqFees[id] ?? '0')
    result[id] = taker - seq
  }
  return result
}

function sumNetFees(snap: MarketSnapshotType): number {
  return Object.values(netTakerFees(snap)).reduce((s, v) => s + v, 0)
}

function sumMakerRebates(snap: MarketSnapshotType): number {
  const makerFees = snap.cumulative_maker_fees ?? {}
  return Object.values(makerFees).reduce((s, v) => s + fromX18BigInt(v), 0)
}

function buildChartPoints(snapshots: MarketSnapshotType[]): ChartPoint[] {
  const ordered = [...snapshots].reverse()
  return ordered.map((snap, i) => {
    const cumFees = sumNetFees(snap)
    const prevCumFees = i > 0 ? sumNetFees(ordered[i - 1]!) : cumFees
    const fees = i > 0 ? cumFees - prevCumFees : 0

    const cumMaker = sumMakerRebates(snap)
    const prevCumMaker = i > 0 ? sumMakerRebates(ordered[i - 1]!) : cumMaker
    const makerRebates = i > 0 ? cumMaker - prevCumMaker : 0

    const netFees = fees + makerRebates

    const cumUsers = snap.cumulative_users
    const prevCumUsers = i > 0 ? ordered[i - 1]!.cumulative_users : cumUsers
    const newUsers = i > 0 ? cumUsers - prevCumUsers : 0

    return {
      ts: snap.timestamp,
      date: fmtDate(snap.timestamp),
      fees,
      cumFees,
      makerRebates,
      netFees,
      newUsers,
      cumUsers,
      dau: snap.daily_active_users,
    }
  })
}

function buildFeeDonutSlices(snap: MarketSnapshotType): MarketSlice[] {
  const net = netTakerFees(snap)
  return Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([productId, volume]) => ({ productId, volume }))
}

const INITIAL: ProtocolRevenueData = {
  fees24h: 0,
  totalFees: 0,
  makerRebates: 0,
  totalUsers: 0,
  newUsers24h: 0,
  avgFeesPerUser: 0,
  traders24h: 0,
  dailyChartData: [],
  weeklyChartData: [],
  feeDonutSlices: [],
  productNames: {},
  loading: true,
  backgroundLoading: true,
  error: null,
}

export function useProtocolRevenue(): ProtocolRevenueData {
  const [data, setData] = useState<ProtocolRevenueData>(INITIAL)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchAll = async () => {
      try {
        const f24h = fetch('/api/protocol/market-snapshots?count=2&granularity=86400', { signal })
        const f30d = fetch('/api/protocol/market-snapshots?count=31&granularity=86400', { signal })
        const fTickers = fetch('/api/protocol/tickers', { signal })
        const f91d = fetch('/api/protocol/market-snapshots?count=91&granularity=86400', { signal })
        const fAllTime = fetch('/api/protocol/market-snapshots?count=24&granularity=604800', { signal })
        f91d.catch(() => {}); fAllTime.catch(() => {})

        const [r24h, r30d, rTickers] = await Promise.all([f24h, f30d, fTickers])

        if (!r24h.ok || !r30d.ok || !rTickers.ok) {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Failed to load revenue data' }))
          return
        }

        const [raw24h, raw30d, rawTickers] = await Promise.all([
          r24h.json() as Promise<unknown>,
          r30d.json() as Promise<unknown>,
          rTickers.json() as Promise<unknown>,
        ])

        const p24h = MarketSnapshotsArraySchema.safeParse(raw24h)
        const p30d = MarketSnapshotsArraySchema.safeParse(raw30d)
        const pTickers = EnrichedTickersArraySchema.safeParse(rawTickers)

        if (!p24h.success || !p30d.success || !pTickers.success) {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Invalid revenue data' }))
          return
        }

        const snap24h = p24h.data
        const snap30d = p30d.data

        const productNames: Record<string, string> = {}
        for (const t of pTickers.data) {
          productNames[String(t.product_id)] = t.symbol
        }

        const fees24h =
          snap24h.length >= 2
            ? sumNetFees(snap24h[0]!) - sumNetFees(snap24h[1]!)
            : snap24h.length === 1
              ? sumNetFees(snap24h[0]!)
              : 0

        const latestSnap = snap30d[0] ?? snap24h[0]
        const totalFees = latestSnap ? sumNetFees(latestSnap) : 0
        const makerRebates = latestSnap ? Math.abs(sumMakerRebates(latestSnap)) : 0

        const totalUsers = latestSnap?.cumulative_users ?? 0
        const newUsers24h =
          snap24h.length >= 2
            ? snap24h[0]!.cumulative_users - snap24h[1]!.cumulative_users
            : 0
        const traders24h = snap24h[0]?.daily_active_users ?? 0
        const avgFeesPerUser = totalUsers > 0 ? totalFees / totalUsers : 0

        const feeDonutSlices = latestSnap ? buildFeeDonutSlices(latestSnap) : []

        setData((prev) => ({
          ...prev,
          fees24h,
          totalFees,
          makerRebates,
          totalUsers,
          newUsers24h,
          avgFeesPerUser,
          traders24h,
          dailyChartData: buildChartPoints(snap30d),
          feeDonutSlices,
          productNames,
          loading: false,
          backgroundLoading: true,
          error: null,
        }))

        const [r91d, rAllTime] = await Promise.all([f91d, fAllTime])

        if (!r91d.ok || !rAllTime.ok) {
          setData((prev) => ({ ...prev, backgroundLoading: false }))
          return
        }

        const [raw91d, rawAllTime] = await Promise.all([
          r91d.json() as Promise<unknown>,
          rAllTime.json() as Promise<unknown>,
        ])

        const p91d = MarketSnapshotsArraySchema.safeParse(raw91d)
        const pAllTime = MarketSnapshotsArraySchema.safeParse(rawAllTime)

        if (!p91d.success || !pAllTime.success) {
          setData((prev) => ({ ...prev, backgroundLoading: false }))
          return
        }

        const snap91d = p91d.data
        const snapAllTime = pAllTime.data

        const latestAllTime = snapAllTime[0]
        const updatedTotalFees = latestAllTime ? sumNetFees(latestAllTime) : totalFees
        const updatedMakerRebates = latestAllTime ? Math.abs(sumMakerRebates(latestAllTime)) : makerRebates
        const updatedTotalUsers = latestAllTime?.cumulative_users ?? totalUsers
        const updatedAvgFees = updatedTotalUsers > 0 ? updatedTotalFees / updatedTotalUsers : 0
        const updatedFeeDonut = latestAllTime ? buildFeeDonutSlices(latestAllTime) : feeDonutSlices

        setData((prev) => ({
          ...prev,
          totalFees: updatedTotalFees,
          makerRebates: updatedMakerRebates,
          totalUsers: updatedTotalUsers,
          avgFeesPerUser: updatedAvgFees,
          feeDonutSlices: updatedFeeDonut,
          dailyChartData: buildChartPoints(snap91d),
          weeklyChartData: buildChartPoints(snapAllTime),
          backgroundLoading: false,
        }))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Failed to load revenue data' }))
        }
      }
    }

    void fetchAll()
    return () => controller.abort()
  }, [])

  return data
}
