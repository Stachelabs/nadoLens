import { describe, expect, it } from 'vitest'
import {
  buildEquityCurveData,
  type FundingPaymentEntry,
} from './buildEquityCurve'
import { computeTradeMetrics, mergePnl } from './performance'
import type { TradeMatch } from '@/types/nado'

const z = '0'.repeat(77)

function mockPerpClose(
  submissionIdx: string,
  timestampSec: number,
  realizedPnl: string,
  fee: string,
): TradeMatch {
  return {
    submission_idx: submissionIdx,
    digest: `0x${submissionIdx.padStart(64, '0')}`,
    timestamp: String(timestampSec * 1_000_000_000),
    realized_pnl: realizedPnl,
    product_id: 1,
    pair: 'BTC-PERP',
    amount: `${z}0`,
    price: `${z}0`,
    closed_amount: `${z}1`,
    fee,
    sequencer_fee: `${z}0`,
    side: 'long',
    is_perp: true,
  }
}

function mockFunding(sec: number, amount: string): FundingPaymentEntry {
  return {
    subaccount: '0xabc',
    product_id: 1,
    idx: String(sec),
    timestamp: String(sec),
    amount,
    source: 'funding',
  }
}

describe('buildEquityCurveData', () => {
  it('last point matches mergePnl net when funding timeline is provided', () => {
    const funding = -123.45
    const trades: TradeMatch[] = [
      mockPerpClose('1', 1_000_000, `${BigInt(-1e18)}`, `${BigInt(5e17)}`),
      mockPerpClose('2', 1_000_001, `${BigInt(2e18)}`, `${BigInt(1e17)}`),
    ]
    const metrics = computeTradeMetrics(trades)
    const { net_pnl_usd } = mergePnl(metrics, funding)

    const payments: FundingPaymentEntry[] = [
      mockFunding(1_000_001, String(BigInt(Math.trunc(funding * 1e18)))),
    ]

    const points = buildEquityCurveData(trades, {
      fundingPayments: payments,
    })
    const last = points[points.length - 1]?.equity
    expect(last).toBeCloseTo(net_pnl_usd, 5)
  })

  it('without funding timeline, last point equals trading_pnl - total_fees', () => {
    const trades: TradeMatch[] = [
      mockPerpClose('1', 1_000_000, `${BigInt(-1e18)}`, `${BigInt(5e17)}`),
      mockPerpClose('2', 1_000_001, `${BigInt(2e18)}`, `${BigInt(1e17)}`),
    ]
    const metrics = computeTradeMetrics(trades)
    const expected = metrics.trading_pnl_usd - metrics.total_fees_usd

    const points = buildEquityCurveData(trades)
    expect(points[points.length - 1]?.equity).toBeCloseTo(expected, 5)
  })
})
