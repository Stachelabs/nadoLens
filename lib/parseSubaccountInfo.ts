import { NadoSubaccountDataSchema } from '@/lib/schemas/nado'
import { usePairsStore } from '@/store/pairsStore'
import type { Position, SpotBalance } from '@/types/nado'
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

  // Spot balances
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

  // Maintenance health (account-level) from healths[1].
  // healths[0] = initial, healths[1] = maintenance, healths[2] = unweighted.
  // health = assets - liabilities (already provided by the API as the `health` field).
  // Used directly in the Nado official per-position liquidation price formula.
  const maintHealthEntry = data.healths[1]
  const maintHealthUsd = maintHealthEntry ? fromX18BigInt(maintHealthEntry.health) : 0

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
      // fromX18BigInt — avoids parseFloat precision loss on large x18 integers.
      const amount = fromX18BigInt(b.balance.amount)
      const vQuote = fromX18BigInt(b.balance.v_quote_balance)
      // Oracle price from Gateway perp_products (used by Nado for health and liquidation).
      const markPrice = market ? fromX18BigInt(market.oracle_price_x18) : 0
      const isLong = amount >= 0

      const longWeightMaint = market
        ? fromX18BigInt(market.risk.long_weight_maintenance_x18)
        : 0.95
      const shortWeightMaint = market
        ? fromX18BigInt(market.risk.short_weight_maintenance_x18)
        : 1.05

      // Maintenance margin rate:
      //   LONG:  (1 - long_weight_maint)   — fraction of notional required as margin
      //   SHORT: (short_weight_maint - 1)  — symmetric, typically ~5% for both
      const maintMarginRate = isLong
        ? Math.max(0, 1 - longWeightMaint)
        : Math.max(0, shortWeightMaint - 1)

      // Nado liquidation price formulas (verified empirically against official dashboard —
      // docs.nado.xyz/definitions-formulas-faqs has the SHORT formula wrong):
      //   LONG:  liq_price = oracle - maintHealth / (amount × long_weight_maint)
      //          if ≤ 0 → position is very safe, no liquidation price
      //   SHORT: liq_price = oracle + maintHealth / (|amount| × short_weight_maint)
      //          ⚠️ Docs write "(mH × sw) / |amount|" but actual Nado uses "mH / (|amount| × sw)"
      //          if ≥ 10 × oracle → position is very safe, no liquidation price
      //
      // Both formulas unify as: oracle - mH / (amount × weight), where amount<0 for shorts.
      // maintHealthUsd is the account-level maintenance health (healths[1].health).
      // For isolated pockets it covers exactly one position; for cross it covers all.
      let liquidationPrice: number
      if (isLong) {
        const denom = amount * longWeightMaint
        const liqP = denom > 1e-15 ? markPrice - maintHealthUsd / denom : 0
        liquidationPrice = liqP > 0 ? liqP : 0
      } else {
        const absAmount = Math.abs(amount)
        const liqP = absAmount > 1e-15
          ? markPrice + maintHealthUsd / (absAmount * shortWeightMaint)
          : 0
        // ≥ 10× oracle means the position is very safe — no meaningful liq price.
        liquidationPrice = liqP > 0 && liqP < 10 * markPrice ? liqP : 0
      }

      // Unrealized PnL from subaccount_info:
      //   unsettled_quote = amount × oracle_price + v_quote_balance (Nado docs)
      const unrealizedPnl = vQuote + amount * markPrice

      return {
        product_id: b.product_id,
        pair: byId.get(b.product_id) ?? `#${b.product_id}`,
        subaccount: subaccountHex,
        amount_x18: b.balance.amount,
        amount,
        entry_price: null,
        funding_cumulative: null,
        mark_price: markPrice,
        unrealized_pnl: unrealizedPnl,
        liquidation_price: liquidationPrice,
        margin_used: Math.max(0, Math.abs(amount) * markPrice * maintMarginRate),
        maint_weight: isLong ? longWeightMaint : shortWeightMaint,
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
  if (maintHealthEntry) {
    const healthAssets = fromX18BigInt(maintHealthEntry.assets)
    if (healthAssets > 0) {
      healthScore = Math.max(0, Math.min(1, maintHealthUsd / healthAssets))
    }
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
