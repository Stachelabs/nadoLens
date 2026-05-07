'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'
import { MarketSnapshotSchema, EnrichedTickerSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'
import { useProtocolStore } from '@/store/protocolStore'

// ─── Types ──────────────────────────────────────────────────────────────────────

export type TVLChartPoint = {
  ts: number
  date: string
  tvl: number
  deposits: number
  borrows: number
  inflows: number
  outflows: number
  netFlows: number
}

export type AssetRatePoint = {
  ts: number
  date: string
  rate: number
}

export type TVLAsset = {
  productId: string
  name: string
  deposits: number
  borrows: number
  depositAPR: number
  borrowAPR: number
  depositHistory: AssetRatePoint[]
  borrowHistory: AssetRatePoint[]
  depositHistoryWeekly: AssetRatePoint[]
  borrowHistoryWeekly: AssetRatePoint[]
}

export type ProtocolTVLData = {
  tvl: number
  inflows24h: number
  outflows24h: number
  hourlyChartData: TVLChartPoint[]
  dailyChartData: TVLChartPoint[]
  weeklyChartData: TVLChartPoint[]
  spotAssets: TVLAsset[]
  productNames: Record<string, string>
  loading: boolean
  backgroundLoading: boolean
  error: string | null
}

type Snap = z.infer<typeof MarketSnapshotSchema>

const SnapsArray = z.array(MarketSnapshotSchema)
const TickersArray = z.array(EnrichedTickerSchema)

// ─── Helpers ────────────────────────────────────────────────────────────────────

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

function annualizeRate(dailyRate: number): number {
  return Math.pow(1 + dailyRate, 365) - 1
}

function sumProductUsd(
  record: Record<string, string> | undefined,
  prices: Record<string, string> | undefined,
): number {
  if (!record || !prices) return 0
  return Object.entries(record).reduce((sum, [id, val]) => {
    const amount = fromX18BigInt(val)
    const price = fromX18BigInt(prices[id] ?? '0')
    return sum + amount * price
  }, 0)
}

function flowsDelta(
  curr: Snap,
  prev: Snap,
  field: 'cumulative_inflows' | 'cumulative_outflows',
): number {
  const currFlows = curr[field] ?? {}
  const prevFlows = prev[field] ?? {}
  const prices = curr.oracle_prices ?? {}
  let total = 0
  for (const id of Object.keys(currFlows)) {
    const delta = fromX18BigInt(currFlows[id] ?? '0') - fromX18BigInt(prevFlows[id] ?? '0')
    total += delta * fromX18BigInt(prices[id] ?? '0')
  }
  return total
}

function buildChartPoints(snapshots: Snap[], dateFn = fmtDate): TVLChartPoint[] {
  const ordered = [...snapshots].reverse()
  return ordered.map((snap, i) => {
    const tvl = fromX18BigInt(snap.tvl)
    const deposits = sumProductUsd(snap.total_deposits, snap.oracle_prices)
    const borrows = sumProductUsd(snap.total_borrows, snap.oracle_prices)

    const inflows = i > 0 ? flowsDelta(snap, ordered[i - 1]!, 'cumulative_inflows') : 0
    const outflows = i > 0 ? flowsDelta(snap, ordered[i - 1]!, 'cumulative_outflows') : 0

    return {
      ts: snap.timestamp,
      date: dateFn(snap.timestamp),
      tvl,
      deposits,
      borrows,
      inflows,
      outflows,
      netFlows: inflows + outflows,
    }
  })
}

function buildRateHistory(snapshots: Snap[], productId: string, field: 'deposit_rates' | 'borrow_rates'): AssetRatePoint[] {
  const ordered = [...snapshots].reverse()
  return ordered.map((s) => ({
    ts: s.timestamp,
    date: fmtDate(s.timestamp),
    rate: annualizeRate(fromX18BigInt((s[field] ?? {})[productId] ?? '0')),
  }))
}

function buildSpotAssets(
  latest: Snap,
  productNames: Record<string, string>,
  dailySnapshots: Snap[],
  weeklySnapshots: Snap[],
): TVLAsset[] {
  const deposits = latest.total_deposits ?? {}
  const borrows = latest.total_borrows ?? {}
  const depRates = latest.deposit_rates ?? {}
  const borRates = latest.borrow_rates ?? {}
  const prices = latest.oracle_prices ?? {}

  return Object.keys(deposits)
    .map((productId) => {
      const price = fromX18BigInt(prices[productId] ?? '0')
      const depositAmt = fromX18BigInt(deposits[productId] ?? '0') * price
      const borrowAmt = fromX18BigInt(borrows[productId] ?? '0') * price

      const name = (productNames[productId] ?? `Product ${productId}`)
        .replace(/-(SPOT|PERP)$/i, '')

      const dailyDep = fromX18BigInt(depRates[productId] ?? '0')
      const dailyBor = fromX18BigInt(borRates[productId] ?? '0')

      return {
        productId,
        name,
        deposits: depositAmt,
        borrows: borrowAmt,
        depositAPR: annualizeRate(dailyDep),
        borrowAPR: annualizeRate(dailyBor),
        depositHistory: buildRateHistory(dailySnapshots, productId, 'deposit_rates'),
        borrowHistory: buildRateHistory(dailySnapshots, productId, 'borrow_rates'),
        depositHistoryWeekly: buildRateHistory(weeklySnapshots, productId, 'deposit_rates'),
        borrowHistoryWeekly: buildRateHistory(weeklySnapshots, productId, 'borrow_rates'),
      }
    })
    .filter((a) => a.deposits > 0)
    .sort((a, b) => b.deposits - a.deposits)
}

// ─── Initial state ──────────────────────────────────────────────────────────────

const INITIAL: ProtocolTVLData = {
  tvl: 0,
  inflows24h: 0,
  outflows24h: 0,
  hourlyChartData: [],
  dailyChartData: [],
  weeklyChartData: [],
  spotAssets: [],
  productNames: {},
  loading: true,
  backgroundLoading: true,
  error: null,
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useProtocolTVL(): ProtocolTVLData {
  const [data, setData] = useState<ProtocolTVLData>(INITIAL)
  const cachedTickers = useProtocolStore((s) => s.tickers)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchAll = async () => {
      try {
        // Wave 1 — immediate
        const f24h = fetch('/api/protocol/market-snapshots?count=2&granularity=86400', { signal })
        const fHourly = fetch('/api/protocol/market-snapshots?count=25&granularity=3600', { signal })
        const f30d = fetch('/api/protocol/market-snapshots?count=31&granularity=86400', { signal })
        const fTickers = cachedTickers.length > 0 ? null : fetch('/api/protocol/tickers', { signal })

        // Wave 2 — fire early, await later
        const f91d = fetch('/api/protocol/market-snapshots?count=91&granularity=86400', { signal })
        const fAllTime = fetch('/api/protocol/market-snapshots?count=24&granularity=604800', { signal })
        f91d.catch(() => {}); fAllTime.catch(() => {})

        const [r24h, rHourly, r30d, rTickers] = await Promise.all([f24h, fHourly, f30d, fTickers ?? Promise.resolve(null)])

        if (!r24h.ok || !r30d.ok || (rTickers && !rTickers.ok)) {
          setData((p) => ({ ...p, loading: false, backgroundLoading: false, error: 'Failed to load TVL data' }))
          return
        }

        const [raw24h, rawHourly, raw30d, rawTickers] = await Promise.all([
          r24h.json() as Promise<unknown>,
          rHourly.ok ? (rHourly.json() as Promise<unknown>) : Promise.resolve([]),
          r30d.json() as Promise<unknown>,
          rTickers ? (rTickers.json() as Promise<unknown>) : Promise.resolve(cachedTickers as unknown),
        ])

        const pHourly = SnapsArray.safeParse(rawHourly)

        const p24h = SnapsArray.safeParse(raw24h)
        const p30d = SnapsArray.safeParse(raw30d)
        const pTickers = TickersArray.safeParse(rawTickers)

        if (!p24h.success || !p30d.success || !pTickers.success) {
          setData((p) => ({ ...p, loading: false, backgroundLoading: false, error: 'Invalid TVL data' }))
          return
        }

        const snap24h = p24h.data
        const snap30d = p30d.data

        const productNames: Record<string, string> = {}
        for (const t of pTickers.data) {
          productNames[String(t.product_id)] = t.symbol
        }

        const latest = snap24h[0]
        const tvl = latest ? fromX18BigInt(latest.tvl) : 0

        let inflows24h = 0
        let outflows24h = 0
        if (snap24h.length >= 2) {
          inflows24h = flowsDelta(snap24h[0]!, snap24h[1]!, 'cumulative_inflows')
          outflows24h = flowsDelta(snap24h[0]!, snap24h[1]!, 'cumulative_outflows')
        }

        const spotAssets = latest ? buildSpotAssets(latest, productNames, snap30d, []) : []

        setData((p) => ({
          ...p,
          tvl,
          inflows24h,
          outflows24h,
          hourlyChartData: pHourly.success ? buildChartPoints(pHourly.data, fmtHour) : [],
          dailyChartData: buildChartPoints(snap30d),
          spotAssets,
          productNames,
          loading: false,
          backgroundLoading: true,
          error: null,
        }))

        // Wave 2 — background
        const [r91d, rAllTime] = await Promise.all([f91d, fAllTime])

        if (!r91d.ok || !rAllTime.ok) {
          setData((p) => ({ ...p, backgroundLoading: false }))
          return
        }

        const [raw91d, rawAllTime] = await Promise.all([
          r91d.json() as Promise<unknown>,
          rAllTime.json() as Promise<unknown>,
        ])

        const p91d = SnapsArray.safeParse(raw91d)
        const pAllTime = SnapsArray.safeParse(rawAllTime)

        if (!p91d.success || !pAllTime.success) {
          setData((p) => ({ ...p, backgroundLoading: false }))
          return
        }

        const updatedAssets = latest ? buildSpotAssets(latest, productNames, p91d.data, pAllTime.data) : spotAssets

        setData((p) => ({
          ...p,
          dailyChartData: buildChartPoints(p91d.data),
          weeklyChartData: buildChartPoints(pAllTime.data),
          spotAssets: updatedAssets,
          backgroundLoading: false,
        }))
      } catch (e) {
        if (!(e instanceof Error) || e.name !== 'AbortError') {
          setData((p) => ({ ...p, loading: false, backgroundLoading: false, error: 'Failed to load TVL data' }))
        }
      }
    }

    void fetchAll()
    return () => controller.abort()
  }, [])

  return data
}
