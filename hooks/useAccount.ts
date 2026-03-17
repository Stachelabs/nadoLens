'use client'

import { useEffect, useRef } from 'react'
import { useAccount as useWagmiAccount } from 'wagmi'
import type { Address } from 'viem'
import { useAccountStore } from '@/store/accountStore'
import { fromX18 } from '@/types/nado'
import type { AccountHealth, Position, RiskLevel } from '@/types/nado'
import { productName } from '@/hooks/useWalletData'

const POLL_INTERVAL = 10_000

// Convert EVM address → Nado bytes32 subaccount (default name = "default\0\0\0\0\0")
function toSubaccount(address: Address): string {
  const addr = address.toLowerCase().replace('0x', '')
  return `0x${addr}64656661756c740000000000`
}

function riskFromUsage(usage: number): RiskLevel {
  if (usage > 0.66) return 'danger'
  if (usage > 0.33) return 'warning'
  return 'safe'
}

// ─── Nado gateway response types ─────────────────────────────────────────────

interface NadoRisk {
  long_weight_maintenance_x18: string
  short_weight_maintenance_x18: string
}

interface NadoPerpProduct {
  product_id: number
  oracle_price_x18: string
  risk: NadoRisk
}

interface NadoSpotProduct {
  product_id: number
  oracle_price_x18: string
}

interface NadoPerpBalance {
  product_id: number
  balance: {
    amount: string
    v_quote_balance: string
  }
}

interface NadoSpotBalance {
  product_id: number
  balance: {
    amount: string
  }
}

interface NadoHealth {
  assets: string
  liabilities: string
  health: string
}

interface NadoSubaccountData {
  perp_products?: NadoPerpProduct[]
  spot_products?: NadoSpotProduct[]
  perp_balances?: NadoPerpBalance[]
  spot_balances?: NadoSpotBalance[]
  healths?: NadoHealth[]
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseSubaccountInfo(
  raw: unknown
): { health: AccountHealth; positions: Position[] } | null {
  if (!raw || typeof raw !== 'object') return null

  const r = raw as Record<string, unknown>
  // Gateway wraps in { status, data: { ... } }
  const data = (r.data ?? r) as NadoSubaccountData
  if (!data || typeof data !== 'object') return null

  const perpProducts = data.perp_products ?? []
  const spotProducts = data.spot_products ?? []
  const perpBalances = data.perp_balances ?? []
  const spotBalances = data.spot_balances ?? []
  const healths = data.healths ?? []

  // Build lookup maps: product_id → market data
  const perpProductMap = new Map(perpProducts.map((p) => [p.product_id, p]))
  const spotProductMap = new Map(spotProducts.map((p) => [p.product_id, p]))

  // ─── Positions from perp_balances ─────────────────────────────────────────
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
        margin_used: Math.abs(amount) * markPrice * maintMarginRate,
        maint_weight: maintWeight,
        isolated: false,
      }
    })

  // ─── Collateral from spot_balances ────────────────────────────────────────
  const totalCollateral = spotBalances.reduce((s, sb) => {
    const bal = fromX18(sb.balance?.amount ?? '0')
    const market = spotProductMap.get(sb.product_id)
    const price = market?.oracle_price_x18 ? fromX18(market.oracle_price_x18) : 1
    return s + Math.max(0, bal) * price
  }, 0)

  // ─── Health ───────────────────────────────────────────────────────────────
  const totalNotional = positions.reduce((s, p) => s + Math.abs(p.amount) * p.mark_price, 0)
  const totalMaintMargin = positions.reduce((s, p) => s + p.margin_used, 0)
  const maintMarginUsage = totalNotional > 0 ? totalMaintMargin / totalNotional : 0
  const availableMargin = Math.max(0, totalCollateral - totalMaintMargin)
  const dropTolerance = totalNotional > 0 ? (availableMargin / totalNotional) * 100 : 100

  // healths[1] = maintenance health (index 1)
  let healthScore = Math.max(0, Math.min(1, 1 - maintMarginUsage))
  const maintHealth = healths[1]
  if (maintHealth) {
    const assets = fromX18(maintHealth.assets)
    const liabilities = fromX18(maintHealth.liabilities)
    if (assets > 0) {
      healthScore = Math.max(0, Math.min(1, (assets - liabilities) / assets))
    }
  }

  const health: AccountHealth = {
    health_score: healthScore,
    total_collateral_usd: totalCollateral,
    maintenance_margin: totalMaintMargin,
    maint_margin_usage: maintMarginUsage,
    available_margin: availableMargin,
    total_notional: totalNotional,
    risk_level: riskFromUsage(maintMarginUsage),
    drop_tolerance: dropTolerance,
  }

  return { health, positions }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccount(): void {
  const { address, isConnected } = useWagmiAccount()
  const { setHealth, setPositions, setAddress, clear } = useAccountStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isConnected || !address) {
      clear()
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    setAddress(address)
    const subaccount = toSubaccount(address)

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/wallet/${subaccount}?query=subaccount_info`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const raw: unknown = await res.json()
        const parsed = parseSubaccountInfo(raw)
        if (parsed) {
          setHealth(parsed.health)
          setPositions(parsed.positions)
        }
      } catch {
        // network error — retry on next interval
      }
    }

    void fetchData()
    intervalRef.current = setInterval(() => void fetchData(), POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [address, isConnected, setHealth, setPositions, setAddress, clear])
}
