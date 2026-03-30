import { NadoSubaccountDataSchema } from '@/lib/schemas/nado'
import { usePairsStore } from '@/store/pairsStore'
import type { Position, SpotBalance } from '@/types/nado'
import { fromX18 } from '@/types/nado'

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

  const positions: Position[] = data.perp_balances
    .filter((b) => parseFloat(b.balance?.amount ?? '0') !== 0)
    .map((b): Position => {
      const market = perpProductMap.get(b.product_id)
      const amount = fromX18(b.balance.amount)
      const vQuote = fromX18(b.balance.v_quote_balance)
      // Mark = oracle from Gateway `perp_products` (same field Nado uses for risk / margin).
      const markPrice = market ? fromX18(market.oracle_price_x18) : 0
      // Implied average entry from position state: unrealized = v_quote + amount * mark
      // ⇒ entry = -v_quote / amount (linear perp; same as Nado internal marking).
      const rawImplied =
        Math.abs(amount) > 1e-18 ? -vQuote / amount : markPrice
      const impliedEntry =
        Number.isFinite(rawImplied) && rawImplied > 0 ? rawImplied : markPrice
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
      const unrealizedPnl = vQuote + amount * markPrice

      return {
        product_id: b.product_id,
        pair: byId.get(b.product_id) ?? `#${b.product_id}`,
        amount,
        entry_price: impliedEntry,
        mark_price: markPrice,
        unrealized_pnl: unrealizedPnl,
        liquidation_price: Math.max(0, liquidationPrice),
        margin_used: Math.max(0, Math.abs(amount) * markPrice * maintMarginRate),
        maint_weight: maintWeight,
        isolated,
      }
    })

  const spotBalances: SpotBalance[] = data.spot_balances
    .map((sb) => {
      const amount = fromX18(sb.balance?.amount ?? '0')
      const market = spotProductMap.get(sb.product_id)
      const price = market?.oracle_price_x18 ? fromX18(market.oracle_price_x18) : 1
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

  const totalMaintMargin = positions.reduce((s, p) => s + p.margin_used, 0)
  const totalNotional = positions.reduce((s, p) => s + Math.abs(p.amount) * p.mark_price, 0)
  const maintMarginUsage = totalNotional > 0 ? totalMaintMargin / totalNotional : 0
  const availableMargin = Math.max(0, totalCollateral - totalMaintMargin)
  const dropTolerance = totalNotional > 0 ? (availableMargin / totalNotional) * 100 : 100
  const unrealizedTotal = positions.reduce((s, p) => s + p.unrealized_pnl, 0)

  let healthScore = Math.max(0, Math.min(1, 1 - maintMarginUsage))
  const maintHealth = data.healths[1]
  if (maintHealth) {
    const assets = fromX18(maintHealth.assets)
    const liabilities = fromX18(maintHealth.liabilities)
    if (assets > 0) healthScore = Math.max(0, Math.min(1, (assets - liabilities) / assets))
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
