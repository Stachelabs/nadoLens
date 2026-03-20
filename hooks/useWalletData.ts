'use client'

import { useEffect, useRef, useState } from 'react'
import { fromX18 } from '@/types/nado'
import type { Position, TradeMatch, WalletStats } from '@/types/nado'
import { NadoSubaccountDataSchema, ArchiveMatchesResponseSchema } from '@/lib/schemas/nado'

const ARCHIVE_URL = 'https://archive.prod.nado.xyz/indexer'
const POSITIONS_POLL_MS = 30_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSubaccount(address: string): string {
  const addr = address.toLowerCase().replace('0x', '')
  if (addr.length === 64) return `0x${addr}` // already bytes32
  return `0x${addr}64656661756c740000000000`
}

export function productName(id: number): string {
  const names: Record<number, string> = {
    2: 'BTC-PERP', 4: 'ETH-PERP', 8: 'SOL-PERP', 10: 'ARB-PERP',
    14: 'BNB-PERP', 16: 'AVAX-PERP', 18: 'OP-PERP', 20: 'MATIC-PERP',
    22: 'DOGE-PERP', 24: 'LINK-PERP', 90: 'BTC-PERP',
  }
  return names[id] ?? `Perp #${id}`
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parsePositions(raw: unknown): { positions: Position[]; equityUsd: number; availableMargin: number; healthScore: number } {
  const fallback = { positions: [], equityUsd: 0, availableMargin: 0, healthScore: 1 }
  if (!raw || typeof raw !== 'object') return fallback

  // Gateway wraps in { status, data: { ... } } — unwrap if needed
  const r = raw as Record<string, unknown>
  const inner = r.data ?? raw

  const result = NadoSubaccountDataSchema.safeParse(inner)
  if (!result.success) return fallback

  const data = result.data

  const perpProducts = data.perp_products
  const spotProducts = data.spot_products
  const perpBalances = data.perp_balances
  const spotBalances = data.spot_balances
  const healths = data.healths

  const perpProductMap = new Map(perpProducts.map((p) => [p.product_id, p]))
  const spotProductMap = new Map(spotProducts.map((p) => [p.product_id, p]))

  const positions: Position[] = perpBalances
    .filter((b) => parseFloat(b.balance?.amount ?? '0') !== 0)
    .map((b): Position => {
      const market = perpProductMap.get(b.product_id)
      const amount = fromX18(b.balance.amount)
      const markPrice = market ? fromX18(market.oracle_price_x18) : 0
      const isLong = amount >= 0
      const maintWeight = market
        ? isLong
          ? fromX18(market.risk.long_weight_maintenance_x18)
          : fromX18(market.risk.short_weight_maintenance_x18)
        : 0.9875
      const maintMarginRate = 1 - Math.min(maintWeight, 1)
      const leverage = 10
      const liquidationPrice = isLong
        ? markPrice * (1 - 1 / leverage + maintMarginRate)
        : markPrice * (1 + 1 / leverage - maintMarginRate)
      const unrealizedPnl = fromX18(b.balance.v_quote_balance) + amount * markPrice
      return {
        product_id: b.product_id,
        pair: productName(b.product_id),
        amount,
        entry_price: markPrice,
        mark_price: markPrice,
        unrealized_pnl: unrealizedPnl,
        liquidation_price: Math.max(0, liquidationPrice),
        margin_used: Math.max(0, Math.abs(amount) * markPrice * maintMarginRate),
        maint_weight: maintWeight,
        isolated: false,
      }
    })

  const totalCollateral = spotBalances.reduce((s, sb) => {
    const bal = fromX18(sb.balance?.amount ?? '0')
    const market = spotProductMap.get(sb.product_id)
    const price = market?.oracle_price_x18 ? fromX18(market.oracle_price_x18) : 1
    return s + Math.max(0, bal) * price
  }, 0)
  const totalMaintMargin = positions.reduce((s, p) => s + p.margin_used, 0)
  const totalNotional = positions.reduce((s, p) => s + Math.abs(p.amount) * p.mark_price, 0)
  const maintMarginUsage = totalNotional > 0 ? totalMaintMargin / totalNotional : 0
  const availableMargin = Math.max(0, totalCollateral - totalMaintMargin)
  const unrealizedTotal = positions.reduce((s, p) => s + p.unrealized_pnl, 0)

  let healthScore = Math.max(0, Math.min(1, 1 - maintMarginUsage))
  const maintHealth = healths[1]
  if (maintHealth) {
    const assets = fromX18(maintHealth.assets)
    const liabilities = fromX18(maintHealth.liabilities)
    if (assets > 0) healthScore = Math.max(0, Math.min(1, (assets - liabilities) / assets))
  }

  return { positions, equityUsd: totalCollateral + unrealizedTotal, availableMargin, healthScore }
}

function estimateTimeSec(submissionIdx: string, newestIdx: number): number {
  const diff = newestIdx - parseInt(submissionIdx)
  return Math.floor(Date.now() / 1000) - diff * 2 // Ink L2 ≈ 2s/block
}

function parseMatches(raw: unknown): TradeMatch[] {
  const result = ArchiveMatchesResponseSchema.safeParse(raw)
  if (!result.success) return []

  const matches = result.data.matches
  if (matches.length === 0) return []

  const newestIdx = Math.max(...matches.map((m) => parseInt(m.submission_idx)))

  return matches.map((m): TradeMatch => {
    const productId =
      m.pre_balance?.base?.perp?.product_id ??
      m.post_balance?.base?.perp?.product_id ??
      0
    const baseFilled = parseFloat(m.base_filled ?? '0')
    const side: 'long' | 'short' = baseFilled >= 0 ? 'long' : 'short'
    const timeSec = estimateTimeSec(m.submission_idx, newestIdx)

    return {
      timestamp: (timeSec * 1_000_000_000).toFixed(0), // nanoseconds string
      product_id: productId,
      pair: productName(productId),
      amount: m.base_filled ?? '0',
      price: m.order?.priceX18 ?? '0',
      realized_pnl: m.realized_pnl ?? '0',
      closed_amount: m.closed_amount ?? '0',
      fee: m.fee ?? '0',
      side,
    }
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface WalletData {
  stats: WalletStats | null
  trades: TradeMatch[]
  loading: boolean
  error: string | null
}

export function useWalletData(rawAddress: string): WalletData {
  const [data, setData] = useState<WalletData>({
    stats: null,
    trades: [],
    loading: true,
    error: null,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const subaccount = toSubaccount(rawAddress)

  useEffect(() => {
    if (!rawAddress) return

    let cancelled = false

    // Fetch matches once
    const fetchMatches = async (): Promise<TradeMatch[]> => {
      try {
        const res = await fetch(ARCHIVE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matches: { subaccount, limit: 200 } }),
        })
        if (!res.ok) return []
        const raw: unknown = await res.json()
        return parseMatches(raw)
      } catch {
        return []
      }
    }

    // Fetch positions (polled)
    const fetchPositions = async (): Promise<{
      positions: Position[]
      equityUsd: number
      availableMargin: number
      healthScore: number
    }> => {
      try {
        const res = await fetch(`/api/wallet/${subaccount}?query=subaccount_info`, {
          cache: 'no-store',
        })
        if (!res.ok) return { positions: [], equityUsd: 0, availableMargin: 0, healthScore: 1 }
        const raw: unknown = await res.json()
        return parsePositions(raw)
      } catch {
        return { positions: [], equityUsd: 0, availableMargin: 0, healthScore: 1 }
      }
    }

    const init = async () => {
      const [positionData, trades] = await Promise.all([fetchPositions(), fetchMatches()])
      if (cancelled) return

      const winningTrades = trades.filter((t) => parseFloat(t.realized_pnl) > 0)
      const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0
      const totalPnlUsd = trades.reduce((s, t) => s + fromX18(t.realized_pnl), 0)
      const totalVolumeUsd = trades.reduce(
        (s, t) => s + Math.abs(fromX18(t.amount)) * fromX18(t.price),
        0
      )
      const avgTradeSizeUsd = trades.length > 0 ? totalVolumeUsd / trades.length : 0

      setData({
        stats: {
          address: rawAddress,
          health_score: positionData.healthScore,
          total_equity_usd: positionData.equityUsd,
          available_margin: positionData.availableMargin,
          positions: positionData.positions,
          trades,
          win_rate: winRate,
          total_pnl_usd: totalPnlUsd,
          total_volume_usd: totalVolumeUsd,
          avg_trade_size_usd: avgTradeSizeUsd,
        },
        trades,
        loading: false,
        error: null,
      })

      // Poll positions every 30s
      intervalRef.current = setInterval(async () => {
        if (cancelled) return
        const pd = await fetchPositions()
        setData((prev) => ({
          ...prev,
          stats: prev.stats
            ? {
                ...prev.stats,
                positions: pd.positions,
                total_equity_usd: pd.equityUsd,
                available_margin: pd.availableMargin,
                health_score: pd.healthScore,
              }
            : null,
        }))
      }, POSITIONS_POLL_MS)
    }

    void init().catch(() => {
      if (!cancelled) setData((p) => ({ ...p, loading: false, error: 'Failed to load wallet data' }))
    })

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [rawAddress, subaccount])

  return data
}
