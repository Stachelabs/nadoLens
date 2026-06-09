import type { TradeMatch } from '@/types/nado'
import { nanoStringToUnixSec } from '@/lib/wallet/nanoTime'
import type { FundingPaymentEntry } from '@/lib/wallet/buildEquityCurve'

export type EquityPeriod = '24 Hours' | '7 Days' | '30 Days' | '90 Days' | 'All time'

/** Inclusive rolling window: [startSec, endSec]. 'all' → no window. */
export function getPeriodBoundsUtc(
  period: EquityPeriod,
  nowMs: number = Date.now(),
): { startSec: number; endSec: number } | null {
  if (period === 'All time') return null

  const endSec = Math.floor(nowMs / 1000)

  switch (period) {
    case '24 Hours':
      return { startSec: endSec - 24 * 60 * 60, endSec }
    case '7 Days':
      return { startSec: endSec - 7 * 24 * 60 * 60, endSec }
    case '30 Days':
      return { startSec: endSec - 30 * 24 * 60 * 60, endSec }
    case '90 Days':
      return { startSec: endSec - 90 * 24 * 60 * 60, endSec }
    default:
      return null
  }
}

export function filterTradesByPeriod(
  trades: TradeMatch[],
  period: EquityPeriod,
  nowMs: number = Date.now(),
): TradeMatch[] {
  const bounds = getPeriodBoundsUtc(period, nowMs)
  if (!bounds) return trades

  return trades.filter((t) => {
    const sec = nanoStringToUnixSec(t.timestamp)
    if (sec === null || sec <= 0) return false
    return sec >= bounds.startSec && sec <= bounds.endSec
  })
}

export function filterFundingPaymentsByPeriod(
  payments: FundingPaymentEntry[],
  period: EquityPeriod,
  nowMs: number = Date.now(),
): FundingPaymentEntry[] {
  const bounds = getPeriodBoundsUtc(period, nowMs)
  if (!bounds) return payments

  return payments.filter((p) => {
    const sec = nanoStringToUnixSec(p.timestamp)
    if (sec === null || sec <= 0) return false
    return sec >= bounds.startSec && sec <= bounds.endSec
  })
}

/**
 * Returns true if funding data for `period` is fully covered by the loaded range.
 * @param fundingLoadedSince unix ms — Infinity = nothing, 0 = all time.
 */
export function isFundingLoaded(period: EquityPeriod, fundingLoadedSince: number): boolean {
  if (fundingLoadedSince === 0) return true
  if (fundingLoadedSince === Infinity) return false
  if (period === 'All time') return false
  const bounds = getPeriodBoundsUtc(period)
  if (!bounds) return false
  return fundingLoadedSince <= bounds.startSec * 1000
}

/** Short label for the chart header (period scope). */
export function formatEquityPeriodLabel(period: EquityPeriod): string {
  switch (period) {
    case '24 Hours':
      return 'Last 24h'
    case '7 Days':
      return 'Last 7 days'
    case '30 Days':
      return 'Last 30 days'
    case '90 Days':
      return 'Last 90 days'
    case 'All time':
      return 'All time (since first trade)'
    default:
      return ''
  }
}
