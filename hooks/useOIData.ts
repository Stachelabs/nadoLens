'use client'

import { useState, useEffect, useMemo } from 'react'
import { z } from 'zod'
import { MarketSnapshotSchema, FundingRatesResponseSchema, EnrichedTickerSchema } from '@/lib/schemas/nado'
import { fromX18BigInt } from '@/types/nado'

// ─── Public types ─────────────────────────────────────────────────────────────

export type OIDataState = {
  // OI section
  oiHistory: { timestamp: number; totalOI: number; btcOI: number; ethOI: number }[]
  oiByMarket: { name: string; value: number }[]  // top 15 by open_interest_usd
  totalOI: number
  btcOI: number
  ethOI: number
  // Funding section
  fundingRates: { symbol: string; productId: number; annualizedRate: number }[]  // sorted by |rate| desc
  fundingHistory: Record<string, { timestamp: number; rate: number }[]>  // keyed by symbol
  selectedFundingSymbol: string
  setSelectedFundingSymbol: (symbol: string) => void
  // Liquidations section
  liqHistory: { timestamp: number; daily: number; cumulative: number }[]
  liq24h: number | null
  liqTotal: number | null
  insuranceFundTotal: number | null  // mock: 1_334_835 (dollars)
  // Loading / error
  oiLoading: boolean
  fundingLoading: boolean
  liqLoading: boolean
  error: string | null
}

// ─── Internal schemas ─────────────────────────────────────────────────────────

const MarketSnapshotsArraySchema = z.array(MarketSnapshotSchema)
const EnrichedTickersArraySchema = z.array(EnrichedTickerSchema)

// ─── Timeframe → fetch params ─────────────────────────────────────────────────

type Timeframe = '24h' | '7d' | '30d' | '90d'

function timeframeToParams(timeframe: Timeframe): { count: number; granularity: number } {
  switch (timeframe) {
    case '24h': return { count: 24, granularity: 3600 }
    case '7d':  return { count: 7,  granularity: 86400 }
    case '30d': return { count: 31, granularity: 86400 }
    case '90d': return { count: 91, granularity: 86400 }
  }
}

// ─── Internal raw state ───────────────────────────────────────────────────────

type SnapshotData = {
  snapshots: z.infer<typeof MarketSnapshotSchema>[]
  tickers: z.infer<typeof EnrichedTickerSchema>[]
  productIdToSymbol: Map<number, string>
  btcProductId: number | null
  ethProductId: number | null
}

type FundingData = {
  rates: z.infer<typeof FundingRatesResponseSchema>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOIData(timeframe: Timeframe): OIDataState {
  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null)
  const [fundingData, setFundingData] = useState<FundingData | null>(null)
  const [oiLoading, setOiLoading] = useState(true)
  const [fundingLoading, setFundingLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFundingSymbol, setSelectedFundingSymbol] = useState('')

  // ─── Fetch snapshots + tickers (OI, liquidations, funding history) ──────────
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    setOiLoading(true)

    const load = async () => {
      try {
        const { count, granularity } = timeframeToParams(timeframe)

        const [snapshotsRes, tickersRes] = await Promise.all([
          fetch(`/api/protocol/market-snapshots?count=${count}&granularity=${granularity}`, { signal }),
          fetch('/api/protocol/tickers', { signal }),
        ])

        if (!snapshotsRes.ok || !tickersRes.ok) {
          setError('Failed to load OI data')
          setOiLoading(false)
          return
        }

        const [rawSnapshots, rawTickers] = await Promise.all([
          snapshotsRes.json() as Promise<unknown>,
          tickersRes.json() as Promise<unknown>,
        ])

        const parsedSnapshots = MarketSnapshotsArraySchema.safeParse(rawSnapshots)
        const parsedTickers = EnrichedTickersArraySchema.safeParse(rawTickers)

        if (!parsedSnapshots.success || !parsedTickers.success) {
          setError('Invalid OI data response')
          setOiLoading(false)
          return
        }

        const productIdToSymbol = new Map<number, string>()
        let btcProductId: number | null = null
        let ethProductId: number | null = null

        for (const ticker of parsedTickers.data) {
          productIdToSymbol.set(ticker.product_id, ticker.symbol)
          if (ticker.symbol === 'BTC-PERP') btcProductId = ticker.product_id
          if (ticker.symbol === 'ETH-PERP') ethProductId = ticker.product_id
        }

        // Sort ascending so oldest snapshot is first — downstream diffs and chart axes are correct
        const sortedSnapshots = [...parsedSnapshots.data].sort((a, b) => a.timestamp - b.timestamp)

        setSnapshotData({
          snapshots: sortedSnapshots,
          tickers: parsedTickers.data,
          productIdToSymbol,
          btcProductId,
          ethProductId,
        })
        setOiLoading(false)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setError('Failed to load OI data')
        setOiLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [timeframe])

  // ─── Fetch current funding rates (needs product_ids from tickers) ───────────
  useEffect(() => {
    if (!snapshotData) return

    const controller = new AbortController()
    const { signal } = controller

    setFundingLoading(true)

    const load = async () => {
      try {
        const productIds = snapshotData.tickers.map((t) => t.product_id)
        if (productIds.length === 0) {
          setFundingData({ rates: {} })
          setFundingLoading(false)
          return
        }

        const res = await fetch(
          `/api/protocol/funding-rates?product_ids=${productIds.join(',')}`,
          { signal },
        )

        if (!res.ok) {
          // Non-fatal — funding section shows empty but other sections still render
          setFundingData({ rates: {} })
          setFundingLoading(false)
          return
        }

        const raw: unknown = await res.json()
        const parsed = FundingRatesResponseSchema.safeParse(raw)

        if (!parsed.success) {
          setFundingData({ rates: {} })
          setFundingLoading(false)
          return
        }

        setFundingData({ rates: parsed.data })
        setFundingLoading(false)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setFundingData({ rates: {} })
        setFundingLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [snapshotData])

  // ─── OI history (memoized) ────────────────────────────────────────────────────

  const oiHistory = useMemo(() => {
    if (!snapshotData) return []

    const { snapshots, btcProductId, ethProductId } = snapshotData

    return snapshots.map((snap) => {
      let totalOI = 0
      let btcOI = 0
      let ethOI = 0

      for (const [productIdStr, val] of Object.entries(snap.open_interests)) {
        const v = fromX18BigInt(val)
        totalOI += v
        const productId = Number(productIdStr)
        if (productId === btcProductId) btcOI = v
        if (productId === ethProductId) ethOI = v
      }

      return { timestamp: snap.timestamp, totalOI, btcOI, ethOI }
    })
  }, [snapshotData])

  // ─── OI stat values (last snapshot) ──────────────────────────────────────────

  const { totalOI, btcOI, ethOI } = useMemo(() => {
    if (oiHistory.length === 0) return { totalOI: 0, btcOI: 0, ethOI: 0 }
    const last = oiHistory[oiHistory.length - 1]!
    return { totalOI: last.totalOI, btcOI: last.btcOI, ethOI: last.ethOI }
  }, [oiHistory])

  // ─── OI by market (top 15 from tickers, memoized) ────────────────────────────

  const oiByMarket = useMemo(() => {
    if (!snapshotData) return []

    return [...snapshotData.tickers]
      .sort((a, b) => {
        const aOI = a.open_interest_usd != null ? Number(a.open_interest_usd) : 0
        const bOI = b.open_interest_usd != null ? Number(b.open_interest_usd) : 0
        return bOI - aOI
      })
      .slice(0, 15)
      .map((ticker) => ({
        name: ticker.symbol.replace('-PERP', ''),
        value: ticker.open_interest_usd != null ? Number(ticker.open_interest_usd) : 0,
      }))
  }, [snapshotData])

  // ─── Current funding rates (annualized, sorted by |rate| desc, memoized) ─────

  const fundingRates = useMemo(() => {
    if (!fundingData || !snapshotData) return []

    const result: { symbol: string; productId: number; annualizedRate: number }[] = []

    for (const entry of Object.values(fundingData.rates)) {
      const symbol = snapshotData.productIdToSymbol.get(entry.product_id) ?? String(entry.product_id)
      // funding_rate_x18 is the 24h (daily) rate — annualize by multiplying by 365
      const annualizedRate = fromX18BigInt(entry.funding_rate_x18) * 365 * 100
      result.push({ symbol, productId: entry.product_id, annualizedRate })
    }

    return result.sort((a, b) => Math.abs(b.annualizedRate) - Math.abs(a.annualizedRate))
  }, [fundingData, snapshotData])

  // ─── Historical funding rates from snapshots (memoized) ──────────────────────

  const fundingHistory = useMemo(() => {
    if (!snapshotData || fundingRates.length === 0) return {}

    const topSymbols = new Set(fundingRates.map((r) => r.symbol))
    // Build symbol → productId map for efficient lookup
    const symbolToProductId = new Map<string, number>()
    for (const r of fundingRates) {
      symbolToProductId.set(r.symbol, r.productId)
    }

    const history: Record<string, { timestamp: number; rate: number }[]> = {}

    for (const snap of snapshotData.snapshots) {
      if (!snap.funding_rates) continue

      for (const symbol of topSymbols) {
        const productId = symbolToProductId.get(symbol)
        if (productId == null) continue

        const rawRate = snap.funding_rates[String(productId)]
        if (!rawRate) continue

        const rate = fromX18BigInt(rawRate) * 365 * 100

        if (!history[symbol]) history[symbol] = []
        history[symbol]!.push({ timestamp: snap.timestamp, rate })
      }
    }

    return history
  }, [snapshotData, fundingRates])

  // ─── Liquidation history (memoized) ──────────────────────────────────────────

  const liqHistory = useMemo(() => {
    if (!snapshotData) return []

    const { snapshots } = snapshotData
    if (snapshots.length === 0) return []

    // Check if any snapshot has cumulative_liquidation_amounts
    const hasLiqData = snapshots.some((s) => s.cumulative_liquidation_amounts != null)

    if (!hasLiqData) return []

    const cumulatives = snapshots.map((snap) => {
      let cumulative = 0
      if (snap.cumulative_liquidation_amounts) {
        for (const val of Object.values(snap.cumulative_liquidation_amounts)) {
          cumulative += fromX18BigInt(val)
        }
      }
      return { timestamp: snap.timestamp, cumulative }
    })

    return cumulatives.map((point, i) => {
      // i=0: no prior snapshot in window, daily unknown — use 0 to avoid inflating the first bar
      const daily = i === 0 ? 0 : point.cumulative - cumulatives[i - 1]!.cumulative
      return { timestamp: point.timestamp, daily, cumulative: point.cumulative }
    })
  }, [snapshotData])

  // ─── Liq stats (from last snapshot) ──────────────────────────────────────────

  const { liq24h, liqTotal } = useMemo(() => {
    if (liqHistory.length === 0) {
      return { liq24h: null, liqTotal: null }
    }
    const last = liqHistory[liqHistory.length - 1]!
    return { liq24h: last.daily, liqTotal: last.cumulative }
  }, [liqHistory])

  // ─── Auto-select first funding symbol on load ─────────────────────────────────

  useEffect(() => {
    if (fundingRates.length > 0 && selectedFundingSymbol === '') {
      setSelectedFundingSymbol(fundingRates[0]!.symbol)
    }
  }, [fundingRates, selectedFundingSymbol])

  return {
    // OI
    oiHistory,
    oiByMarket,
    totalOI,
    btcOI,
    ethOI,
    // Funding
    fundingRates,
    fundingHistory,
    selectedFundingSymbol,
    setSelectedFundingSymbol,
    // Liquidations
    liqHistory,
    liq24h,
    liqTotal,
    // TODO: proxy POST gateway.prod.nado.xyz/v1/query {type:"insurance"} when route is added
    insuranceFundTotal: null,
    // Loading / error
    oiLoading,
    fundingLoading,
    liqLoading: oiLoading, // liq data comes from the same snapshot fetch
    error,
  }
}
