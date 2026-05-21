'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'
import { MarketSnapshotSchema, EnrichedTickerSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'
import { useProtocolStore } from '@/store/protocolStore'
import { fetchCachedSnapshots } from '@/lib/fetchCachedSnapshots'

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
  hourlyChartData: ChartPoint[]
  dailyChartData: ChartPoint[]
  weeklyChartData: ChartPoint[]
  feeDonutSlices: MarketSlice[]
  productNames: Record<string, string>
  loading: boolean
  backgroundLoading: boolean
  error: string | null
}

type MarketSnapshotType = z.infer<typeof MarketSnapshotSchema>

const EnrichedTickersArraySchema = z.array(EnrichedTickerSchema)

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

function buildChartPoints(snapshots: MarketSnapshotType[], dateFn = fmtDate): ChartPoint[] {
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
      date: dateFn(snap.timestamp),
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
  hourlyChartData: [],
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
  const cachedTickers = useProtocolStore((s) => s.tickers)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchAll = async () => {
      try {
        // Fire all snapshot fetches (cache-aware) + tickers simultaneously
        const p24h = fetchCachedSnapshots(2, 86400, signal)
        const pHourly = fetchCachedSnapshots(25, 3600, signal)
        const p30d = fetchCachedSnapshots(31, 86400, signal)
        const fTickers = cachedTickers.length > 0 ? null : fetch('/api/protocol/tickers', { signal })
        const p91d = fetchCachedSnapshots(91, 86400, signal).catch(() => null)
        const pAllTime = fetchCachedSnapshots(24, 604800, signal).catch(() => null)

        // Wave 1 — render 30d view
        const [snap24h, snapHourly, snap30d, rTickers] = await Promise.all([
          p24h, pHourly, p30d, fTickers ?? Promise.resolve(null),
        ])

        if (rTickers && !rTickers.ok) {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Failed to load revenue data' }))
          return
        }

        const rawTickers = rTickers
          ? await (rTickers.json() as Promise<unknown>)
          : (cachedTickers as unknown)
        const pTickers = EnrichedTickersArraySchema.safeParse(rawTickers)

        if (!pTickers.success) {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Invalid revenue data' }))
          return
        }

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

        const knownProduct = (s: MarketSlice) => s.productId in productNames
        const feeDonutSlices = latestSnap ? buildFeeDonutSlices(latestSnap).filter(knownProduct) : []

        setData((prev) => ({
          ...prev,
          fees24h,
          totalFees,
          makerRebates,
          totalUsers,
          newUsers24h,
          avgFeesPerUser,
          traders24h,
          hourlyChartData: buildChartPoints(snapHourly, fmtHour),
          dailyChartData: buildChartPoints(snap30d),
          feeDonutSlices,
          productNames,
          loading: false,
          backgroundLoading: true,
          error: null,
        }))

        // Wave 2 — extend with 91d + all-time
        const [snap91d, snapAllTime] = await Promise.all([p91d, pAllTime])

        if (!snap91d || !snapAllTime) {
          setData((prev) => ({ ...prev, backgroundLoading: false }))
          return
        }

        const latestAllTime = snapAllTime[0]
        const updatedTotalFees = latestAllTime ? sumNetFees(latestAllTime) : totalFees
        const updatedMakerRebates = latestAllTime ? Math.abs(sumMakerRebates(latestAllTime)) : makerRebates
        const updatedTotalUsers = latestAllTime?.cumulative_users ?? totalUsers
        const updatedAvgFees = updatedTotalUsers > 0 ? updatedTotalFees / updatedTotalUsers : 0
        const updatedFeeDonut = latestAllTime ? buildFeeDonutSlices(latestAllTime).filter(knownProduct) : feeDonutSlices

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
        if (!(e instanceof Error) || e.name !== 'AbortError') {
          setData((prev) => ({ ...prev, loading: false, backgroundLoading: false, error: 'Failed to load revenue data' }))
        }
      }
    }

    void fetchAll()
    return () => controller.abort()
  }, [])

  return data
}
