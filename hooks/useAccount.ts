'use client'

import { useEffect, useRef } from 'react'
import { useAccount as useWagmiAccount } from 'wagmi'
import { useAccountStore } from '@/store/accountStore'
import { fromX18 } from '@/types/nado'
import type { AccountHealth, Position, RiskLevel } from '@/types/nado'

const POLL_INTERVAL = 10_000

// Convert EVM address → Nado bytes32 subaccount (default name = "default\0\0\0\0\0")
function toSubaccount(address: string): string {
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

interface NadoPerpBalance {
  amount: string
  v_quote_balance: string
}

interface NadoPerpProduct {
  product_id: number
  oracle_price_x18: string
  risk: NadoRisk
  balance: NadoPerpBalance
}

interface NadoSpotBalance {
  amount: string
}

interface NadoSpotProduct {
  product_id: number
  oracle_price_x18: string
  balance: NadoSpotBalance
}

interface NadoHealth {
  maintenance_health?: string
  initial_health?: string
  health?: string
}

interface NadoSubaccountData {
  perp_products?: NadoPerpProduct[]
  spot_products?: NadoSpotProduct[]
  health?: NadoHealth
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseSubaccountInfo(
  raw: unknown
): { health: AccountHealth; positions: Position[] } | null {
  if (!raw || typeof raw !== 'object') return null

  const r = raw as Record<string, unknown>
  // Handle wrapper: { status, data: { subaccount_info: {...} } } or flat
  const inner = (
    (r.data as Record<string, unknown>)?.subaccount_info ??
    r.data ??
    r
  ) as NadoSubaccountData

  if (!inner || typeof inner !== 'object') return null

  const perpProducts = inner.perp_products ?? []
  const spotProducts = inner.spot_products ?? []

  // ─── Positions ─────────────────────────────────────────────────────────────
  const positions: Position[] = perpProducts
    .filter((p) => parseFloat(p.balance?.amount ?? '0') !== 0)
    .map((p): Position => {
      const amount = fromX18(p.balance.amount)
      const markPrice = fromX18(p.oracle_price_x18)
      const isLong = amount >= 0

      const maintWeight = isLong
        ? fromX18(p.risk.long_weight_maintenance_x18)
        : fromX18(p.risk.short_weight_maintenance_x18)

      // Maintenance margin rate = 1 - maintWeight
      const maintMarginRate = 1 - Math.min(maintWeight, 1)

      // Liquidation price estimation (simplified — assumes no cross-margin)
      // liq_long  = entry × (1 - 1/leverage + maintMarginRate)
      // Using mark as entry proxy and assuming 10x leverage
      const leverage = 10
      const liquidationPrice = isLong
        ? markPrice * (1 - 1 / leverage + maintMarginRate)
        : markPrice * (1 + 1 / leverage - maintMarginRate)

      const notional = Math.abs(amount) * markPrice
      // v_quote_balance = cumulative PnL offset (x18)
      const unrealizedPnl = fromX18(p.balance.v_quote_balance) + amount * markPrice

      return {
        product_id: p.product_id,
        pair: `Perp #${p.product_id}`,
        amount,
        entry_price: markPrice, // approximate — real entry needs trade history
        mark_price: markPrice,
        unrealized_pnl: unrealizedPnl,
        liquidation_price: Math.max(0, liquidationPrice),
        margin_used: notional * maintMarginRate,
        maint_weight: maintWeight,
        isolated: false,
      }
    })

  // ─── Account health ─────────────────────────────────────────────────────────
  const totalNotional = positions.reduce(
    (s, p) => s + Math.abs(p.amount) * p.mark_price,
    0
  )
  const totalMaintMargin = positions.reduce((s, p) => s + p.margin_used, 0)
  const maintMarginUsage = totalNotional > 0 ? totalMaintMargin / totalNotional : 0

  // Collateral from spot balances (USDC/USDT proxy at price ≈ 1)
  const totalCollateral = spotProducts.reduce((s, sp) => {
    const bal = fromX18(sp.balance?.amount ?? '0')
    const price = sp.oracle_price_x18 ? fromX18(sp.oracle_price_x18) : 1
    return s + Math.max(0, bal) * price
  }, 0)

  const availableMargin = Math.max(0, totalCollateral - totalMaintMargin)
  const dropTolerance = totalNotional > 0 ? (availableMargin / totalNotional) * 100 : 100

  // Use gateway health fields if available
  const healthScore = inner.health?.maintenance_health
    ? Math.max(0, Math.min(1, fromX18(inner.health.maintenance_health)))
    : Math.max(0, Math.min(1, 1 - maintMarginUsage))

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
