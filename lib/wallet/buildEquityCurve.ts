import type { TradeMatch } from '@/types/nado'
import { fromX18BigInt } from '@/types/nado'
import { nanoStringToUnixSec } from '@/lib/wallet/nanoTime'
import { isClosingTrade } from '@/lib/wallet/performance'

export type FundingPaymentEntry = {
  subaccount: string
  product_id: number
  idx: string
  timestamp: string
  amount: string
  source: 'funding'
}

export type EquityPoint = {
  ts: number
  equity: number
}

export type BuildEquityCurveOptions = {
  fundingPayments?: FundingPaymentEntry[]
}

function tradeNetDeltaUsd(trade: TradeMatch): number {
  const feeUsd = Math.abs(fromX18BigInt(trade.fee))
  const tradingUsd =
    trade.is_perp && isClosingTrade(trade) ? fromX18BigInt(trade.realized_pnl) : 0
  return tradingUsd - feeUsd
}

function fundingDeltaUsd(payment: FundingPaymentEntry): number {
  return fromX18BigInt(payment.amount)
}

export function buildEquityCurveData(
  trades: TradeMatch[],
  options: BuildEquityCurveOptions = {},
): EquityPoint[] {
  const { fundingPayments = [] } = options

  const deltaBySecond = new Map<number, number>()

  for (const t of trades) {
    const sec = nanoStringToUnixSec(t.timestamp)
    if (sec === null || sec <= 0) continue
    const prev = deltaBySecond.get(sec) ?? 0
    deltaBySecond.set(sec, prev + tradeNetDeltaUsd(t))
  }

  for (const payment of fundingPayments) {
    const sec = nanoStringToUnixSec(payment.timestamp)
    if (sec === null || sec <= 0) continue
    const prev = deltaBySecond.get(sec) ?? 0
    deltaBySecond.set(sec, prev + fundingDeltaUsd(payment))
  }

  const seconds = Array.from(deltaBySecond.keys()).sort((a, b) => a - b)
  let cumulative = 0

  return seconds.map((sec) => {
    cumulative += deltaBySecond.get(sec) ?? 0
    return {
      ts: sec * 1000,
      equity: cumulative,
    }
  })
}
