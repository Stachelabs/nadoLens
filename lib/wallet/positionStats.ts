import type { TradeMatch, Position } from '@/types/nado'
import { fromX18BigInt } from '@/types/nado'
import type { FundingPaymentEntry } from '@/lib/wallet/buildEquityCurve'
import { nanoStringToMs } from '@/lib/wallet/nanoTime'

export type PositionStatsMap = Map<
  string,
  {
    feesCumulative: number
    realizedGross: number
    sessionOpenTimestamp: string | null
    /**
     * True when the session boundary is trustworthy:
     * - we observed an actual flat → reopen cycle in the trade history, OR
     * - the full trade history has been fetched (tradesComplete = true), meaning
     *   the first trade in the replay IS the true session open.
     *
     * False = partial history, no flat seen → the accumulated values would include
     * trades from BEFORE the current open session (wrong). Consumers must skip these.
     */
    validSession: boolean
  }
>

const DUST = 1e-12

/**
 * Build a PositionStatsMap from all fetched trades.
 * key = `${product_id}:${subaccount_lower}:${isolated}`
 *
 * @param tradesComplete - true when the full trade history has been loaded.
 *   When false, stats are only trusted if we observed an actual flat → reopen
 *   transition (seenFlatEvent). Otherwise the values would include trades from
 *   before the current session and would be wildly wrong.
 */
export function buildPositionStatsMap(
  trades: TradeMatch[],
  tradesComplete = false,
): PositionStatsMap {
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
    let wasFlat = true
    let sessionOpenTs: string | null = null
    let seenFlatEvent = false  // did we observe the position actually going flat?

    for (const t of group) {
      // First trade after a flat period opens a new session.
      if (wasFlat) {
        sessionOpenTs = t.timestamp
        wasFlat = false
      }

      runningSize += fromX18BigInt(t.amount)
      feeAccum += fromX18BigInt(t.fee)

      try {
        if (BigInt(t.closed_amount) !== BigInt(0)) {
          realizedAccum += fromX18BigInt(t.realized_pnl)
        }
      } catch { /* ignore non-numeric */ }

      // Position flat → reset accumulators; next trade starts a confirmed new session.
      if (Math.abs(runningSize) < DUST) {
        feeAccum = 0
        realizedAccum = 0
        sessionOpenTs = null
        wasFlat = true
        seenFlatEvent = true
      }
    }

    // Session is trustworthy only when:
    //   a) we actually saw the position close and reopen (seenFlatEvent), OR
    //   b) the full history is loaded — the replay started from the true first trade.
    const validSession = seenFlatEvent || tradesComplete

    if (validSession && (feeAccum !== 0 || realizedAccum !== 0 || sessionOpenTs !== null)) {
      map.set(key, {
        feesCumulative: feeAccum,
        realizedGross: realizedAccum,
        sessionOpenTimestamp: sessionOpenTs,
        validSession,
      })
    }
  }

  return map
}

/**
 * Patch positions with fees_cumulative and realized_pnl_cumulative from the map.
 * Skips positions whose session boundary hasn't been confirmed yet (validSession = false).
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
    if (stats == null || !stats.validSession) return p
    return {
      ...p,
      fees_cumulative: stats.feesCumulative,
      realized_pnl_cumulative: stats.realizedGross,
    }
  })
}

/**
 * Add settled session funding payments on top of the live pending funding.
 * Skips positions whose session boundary hasn't been confirmed yet (validSession = false).
 *
 * For isolated positions, funding is settled on the PARENT subaccount (not the pocket).
 */
export function applySessionFunding(
  positions: Position[],
  statsMap: PositionStatsMap,
  fundingPayments: FundingPaymentEntry[],
): Position[] {
  if (statsMap.size === 0 || fundingPayments.length === 0) return positions

  return positions.map((p) => {
    const querySub = p.isolated
      ? (p.parent_subaccount ?? p.subaccount).toLowerCase()
      : p.subaccount.toLowerCase()
    const statsKey = `${p.product_id}:${querySub}:${p.isolated}`
    const stats = statsMap.get(statsKey)
    if (!stats?.validSession || stats.sessionOpenTimestamp == null) return p

    const sessionOpenMs = nanoStringToMs(stats.sessionOpenTimestamp)
    if (sessionOpenMs === null) return p

    // Funding for isolated positions is settled on the PARENT subaccount (not the pocket).
    const fundingSub = p.isolated
      ? (p.parent_subaccount ?? p.subaccount).toLowerCase()
      : p.subaccount.toLowerCase()

    let settledFunding = 0
    for (const payment of fundingPayments) {
      if (payment.product_id !== p.product_id) continue
      if (payment.subaccount.toLowerCase() !== fundingSub) continue
      const paymentMs = nanoStringToMs(payment.timestamp)
      if (paymentMs === null || paymentMs < sessionOpenMs) continue
      settledFunding += fromX18BigInt(payment.amount)
    }

    if (settledFunding === 0) return p
    return {
      ...p,
      funding_cumulative: (p.funding_cumulative ?? 0) + settledFunding,
    }
  })
}
