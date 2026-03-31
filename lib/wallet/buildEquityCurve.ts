import type { TradeMatch } from '@/types/nado'
import { fromX18BigInt } from '@/types/nado'
import { nanoStringToUnixSec } from '@/lib/wallet/nanoTime'
import { isClosingTrade } from '@/lib/wallet/performance'

/**
 * Same incremental PnL as `mergePnl` / `computeTradeMetrics`:
 * per trade: (perp closing fill ? realized_pnl : 0) − |fee|.
 * Optional: add total funding to the **last** point only (all-time net PnL vs time-sliced funding unknown).
 */
export type EquityPoint = {
  ts: number
  equity: number
}

export type BuildEquityCurveOptions = {
  applyFundingToEnd?: boolean
  fundingPnlUsd?: number
}

function tradeNetDeltaUsd(trade: TradeMatch): number {
  const feeUsd = Math.abs(fromX18BigInt(trade.fee))
  const tradingUsd =
    trade.is_perp && isClosingTrade(trade) ? fromX18BigInt(trade.realized_pnl) : 0
  return tradingUsd - feeUsd
}

export function buildEquityCurveData(
  trades: TradeMatch[],
  options: BuildEquityCurveOptions = {},
): EquityPoint[] {
  const { applyFundingToEnd = false, fundingPnlUsd = 0 } = options

  const sorted = [...trades].sort((a, b) => {
    try {
      const ai = BigInt(a.submission_idx)
      const bi = BigInt(b.submission_idx)
      if (ai < bi) return -1
      if (ai > bi) return 1
      return (a.digest ?? '').localeCompare(b.digest ?? '')
    } catch {
      return 0
    }
  })

  let cum = 0
  const bySecond = new Map<number, number>()

  for (const t of sorted) {
    cum += tradeNetDeltaUsd(t)
    const timeSec = nanoStringToUnixSec(t.timestamp)
    if (timeSec !== null && timeSec > 0) {
      bySecond.set(timeSec, cum)
    }
  }

  const points: EquityPoint[] = Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timeSec, equity]) => ({
      ts: timeSec * 1000,
      equity,
    }))

  if (applyFundingToEnd && points.length > 0) {
    points[points.length - 1].equity += fundingPnlUsd
  }

  return points
}
