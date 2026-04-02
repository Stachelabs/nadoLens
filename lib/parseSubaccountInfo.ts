import { NadoSubaccountDataSchema } from '@/lib/schemas/nado'
import { usePairsStore } from '@/store/pairsStore'
import type { Position, SpotBalance } from '@/types/nado'
import { perpAvgEntryUsdFromBalance } from '@/lib/wallet/perpAvgEntry'
import { fromX18BigInt } from '@/types/nado'

export type ParsedSubaccountInfo = {
  positions: Position[]
  spotBalances: SpotBalance[]
  healthScore: number
  totalCollateral: number
  totalMaintMargin: number
  totalNotional: number
  maintMarginUsage: number
  availableMargin: number
  dropTolerance: number
  unrealizedTotal: number
  equityUsd: number
}

export function parseSubaccountInfo(raw: unknown, isolated = false): ParsedSubaccountInfo | null {
  if (!raw || typeof raw !== 'object') return null

  const r = raw as Record<string, unknown>
  const inner = r.data ?? raw

  const result = NadoSubaccountDataSchema.safeParse(inner)
  if (!result.success) return null

  const data = result.data
  const { byId, assets } = usePairsStore.getState()
  const assetsById = new Map(assets.map((a) => [a.product_id, a]))

  const perpProductMap = new Map(data.perp_products.map((p) => [p.product_id, p]))
  const spotProductMap = new Map(data.spot_products.map((p) => [p.product_id, p]))

  const subaccountHex = data.subaccount ?? ''

  // Spot balances computed first — totalCollateral needed for liquidation price formula.
  const spotBalances: SpotBalance[] = data.spot_balances
    .map((sb) => {
      const amount = fromX18BigInt(sb.balance?.amount ?? '0')
      const market = spotProductMap.get(sb.product_id)
      const price = market?.oracle_price_x18 ? fromX18BigInt(market.oracle_price_x18) : 1
      const asset = assetsById.get(sb.product_id)
      return {
        product_id: sb.product_id,
        symbol: asset?.symbol ?? byId.get(sb.product_id) ?? `#${sb.product_id}`,
        name: asset?.name ?? `#${sb.product_id}`,
        amount,
        value_usd: amount * price,
      }
    })
  const totalCollateral = spotBalances.reduce((s, b) => s + Math.max(0, b.value_usd), 0)

  const positions: Position[] = data.perp_balances
    .filter((b) => {
      try {
        return BigInt(b.balance?.amount ?? '0') !== BigInt(0)
      } catch {
        return false
      }
    })
    .map((b): Position => {
      const market = perpProductMap.get(b.product_id)
      // BigInt path — `parseFloat` in fromX18 loses precision on large x18 integers (PnL drift).
      const amount = fromX18BigInt(b.balance.amount)
      const vQuote = fromX18BigInt(b.balance.v_quote_balance)
      // Mark = oracle from Gateway `perp_products` (same field Nado uses for risk / margin).
      const markPrice = market ? fromX18BigInt(market.oracle_price_x18) : 0
      // Avg entry: integer x18 path — float `-v_quote/amount` loses precision → ~mark (wrong).
      const entryPrice = perpAvgEntryUsdFromBalance(
        b.balance.amount,
        b.balance.v_quote_balance,
        markPrice,
      )
      const isLong = amount >= 0
      const maintWeight = market
        ? isLong
          ? fromX18BigInt(market.risk.long_weight_maintenance_x18)
          : fromX18BigInt(market.risk.short_weight_maintenance_x18)
        : 0.9875
      const maintMarginRate = 1 - Math.min(maintWeight, 1)
      // Cross-margin liq price: price at which portfolio health = 0 (all else constant).
      // health = totalCollateral + amount * liqPrice * maintWeight + vQuote = 0
      // liqPrice = -(totalCollateral + vQuote) / (amount * maintWeight)
      // Approximation: multi-position portfolios share collateral — actual liq price may be higher.
      const liqDenom = amount * maintWeight
      const liquidationPrice = Math.abs(liqDenom) > 1e-12
        ? -(totalCollateral + vQuote) / liqDenom
        : 0
      const unrealizedPnl = vQuote + amount * markPrice

      return {
        product_id: b.product_id,
        pair: byId.get(b.product_id) ?? `#${b.product_id}`,
        subaccount: subaccountHex,
        amount_x18: b.balance.amount,
        amount,
        entry_price: entryPrice,
        mark_price: markPrice,
        unrealized_pnl: unrealizedPnl,
        liquidation_price: Math.max(0, liquidationPrice),
        margin_used: Math.max(0, Math.abs(amount) * markPrice * maintMarginRate),
        maint_weight: maintWeight,
        isolated,
      }
    })

  const totalMaintMargin = positions.reduce((s, p) => s + p.margin_used, 0)
  const totalNotional = positions.reduce((s, p) => s + Math.abs(p.amount) * p.mark_price, 0)
  const maintMarginUsage = totalNotional > 0 ? totalMaintMargin / totalNotional : 0
  const availableMargin = Math.max(0, totalCollateral - totalMaintMargin)
  const dropTolerance = totalNotional > 0 ? (availableMargin / totalNotional) * 100 : 100
  const unrealizedTotal = positions.reduce((s, p) => s + p.unrealized_pnl, 0)

  let healthScore = Math.max(0, Math.min(1, 1 - maintMarginUsage))
  const maintHealth = data.healths[1]
  if (maintHealth) {
    const healthAssets = fromX18BigInt(maintHealth.assets)
    const liabilities = fromX18BigInt(maintHealth.liabilities)
    if (healthAssets > 0) healthScore = Math.max(0, Math.min(1, (healthAssets - liabilities) / healthAssets))
  }

  return {
    positions,
    spotBalances,
    healthScore,
    totalCollateral,
    totalMaintMargin,
    totalNotional,
    maintMarginUsage,
    availableMargin,
    dropTolerance,
    unrealizedTotal,
    equityUsd: totalCollateral + unrealizedTotal,
  }
}
