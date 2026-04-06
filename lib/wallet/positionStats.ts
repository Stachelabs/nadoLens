import type { TradeMatch, Position } from '@/types/nado'
import { fromX18BigInt } from '@/types/nado'

export type PositionStatsMap = Map<
  string,
  { feesCumulative: number; realizedGross: number }
>

const DUST = 1e-12

/**
 * Build a PositionStatsMap from all fetched trades.
 * key = `${product_id}:${subaccount_lower}:${isolated}`
 *
 * Fees and realized PnL are accumulated **only for the current open session**:
 * if the position was ever flat (size ≈ 0), accumulators reset. This ensures
 * we show fees/realized for the current open position only, not all history.
 *
 * feesCumulative  = sum of fee x18 since last position open
 * realizedGross   = sum of realized_pnl x18 on partial closes since last open
 */
export function buildPositionStatsMap(trades: TradeMatch[]): PositionStatsMap {
  // Group perp trades by position key, oldest first for replay
  const groups = new Map<string, TradeMatch[]>()
  for (const t of trades) {
    if (!t.is_perp) continue
    const sub = (t.subaccount ?? '').toLowerCase()
    if (!sub) continue
    const isolated = t.isolated ?? false
    const key = `${t.product_id}:${sub}:${isolated}`
    const group = groups.get(key)
    if (group) group.push(t)
    else groups.set(key, [t])
  }

  const map: PositionStatsMap = new Map()

  for (const [key, group] of groups) {
    // Replay oldest → newest (trades arrive newest-first from the hook)
    group.sort((a, b) => {
      try {
        const ai = BigInt(a.submission_idx)
        const bi = BigInt(b.submission_idx)
        if (ai < bi) return -1
        if (ai > bi) return 1
      } catch { /* ignore */ }
      return a.timestamp.localeCompare(b.timestamp)
    })

    let runningSize = 0
    let feeAccum = 0
    let realizedAccum = 0

    for (const t of group) {
      runningSize += fromX18BigInt(t.amount)
      feeAccum += fromX18BigInt(t.fee)

      try {
        if (BigInt(t.closed_amount) !== BigInt(0)) {
          realizedAccum += fromX18BigInt(t.realized_pnl)
        }
      } catch { /* ignore non-numeric */ }

      // Position flat → reset accumulators (new session begins on next trade)
      if (Math.abs(runningSize) < DUST) {
        feeAccum = 0
        realizedAccum = 0
      }
    }

    if (feeAccum > 0 || realizedAccum !== 0) {
      map.set(key, { feesCumulative: feeAccum, realizedGross: realizedAccum })
    }
  }

  return map
}

/**
 * Patch positions with fees_cumulative and realized_pnl_cumulative from the map.
 * For isolated positions, match on parent_subaccount (fills are on parent, not pocket).
 */
export function applyPositionStats(
  positions: Position[],
  map: PositionStatsMap,
): Position[] {
  if (map.size === 0) return positions
  return positions.map((p) => {
    const querySub = p.isolated
      ? (p.parent_subaccount ?? p.subaccount).toLowerCase()
      : p.subaccount.toLowerCase()
    const key = `${p.product_id}:${querySub}:${p.isolated}`
    const stats = map.get(key)
    if (stats == null) return p
    return {
      ...p,
      fees_cumulative: stats.feesCumulative,
      realized_pnl_cumulative: stats.realizedGross,
    }
  })
}
