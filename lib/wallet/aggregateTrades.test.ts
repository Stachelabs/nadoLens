import { describe, expect, it } from 'vitest'
import type { TradeMatch } from '@/types/nado'
import { aggregateByDigest } from './aggregateTrades'

const WAD = BigInt(10) ** BigInt(18)

function toX18(n: number): string {
  return (BigInt(Math.trunc(n * 1e6)) * (WAD / BigInt(1e6))).toString()
}

function makeFill(
  digest: string | undefined,
  idx: string,
  timestampSec: number,
  opts: {
    amount?: number
    quoteFilledUsd?: number
    realizedPnlUsd?: number
    feeUsd?: number
    closedAmount?: number
    side?: 'long' | 'short'
    isPerp?: boolean
    productId?: number
    pair?: string
  } = {},
): TradeMatch {
  const {
    amount = 1,
    quoteFilledUsd = 1000,
    realizedPnlUsd = 0,
    feeUsd = 1,
    closedAmount = 0,
    side = 'long',
    isPerp = true,
    productId = 2,
    pair = 'BTC-PERP',
  } = opts
  return {
    digest,
    submission_idx: idx,
    timestamp: String(BigInt(timestampSec) * BigInt(1_000_000_000)),
    product_id: productId,
    pair,
    amount: toX18(amount),
    price: toX18(quoteFilledUsd / amount),
    quote_filled: toX18(quoteFilledUsd),
    realized_pnl: toX18(realizedPnlUsd),
    closed_amount: toX18(closedAmount),
    fee: toX18(feeUsd),
    sequencer_fee: '0',
    side,
    is_perp: isPerp,
  }
}

describe('aggregateByDigest', () => {
  it('returns empty for empty input', () => {
    expect(aggregateByDigest([])).toEqual([])
  })

  it('single fill with digest → one group, fillCount = 1', () => {
    const fills = [makeFill('0xabc', '10', 1000)]
    const result = aggregateByDigest(fills)
    expect(result).toHaveLength(1)
    expect(result[0]!.fillCount).toBe(1)
    expect(result[0]!.digest).toBe('0xabc')
    expect(result[0]!.fills).toHaveLength(1)
  })

  it('single fill without digest → one group, fillCount = 1', () => {
    const fills = [makeFill(undefined, '10', 1000)]
    const result = aggregateByDigest(fills)
    expect(result).toHaveLength(1)
    expect(result[0]!.fillCount).toBe(1)
    expect(result[0]!.digest).toContain('__no_digest_')
  })

  it('multiple fills same digest → one group with correct aggregates', () => {
    const fills = [
      makeFill('0xabc', '10', 1000, { amount: 2, quoteFilledUsd: 2000, feeUsd: 1, realizedPnlUsd: 50 }),
      makeFill('0xabc', '11', 1001, { amount: 3, quoteFilledUsd: 3300, feeUsd: 2, realizedPnlUsd: 80 }),
    ]
    const result = aggregateByDigest(fills)
    expect(result).toHaveLength(1)

    const agg = result[0]!
    expect(agg.fillCount).toBe(2)
    expect(agg.amount).toBeCloseTo(5, 4)
    expect(agg.quote_filled).toBeCloseTo(5300, 2)
    // VWAP = 5300 / 5 = 1060
    expect(agg.price).toBeCloseTo(1060, 2)
    expect(agg.realized_pnl).toBeCloseTo(130, 4)
    expect(agg.fee).toBeCloseTo(3, 4)
    // Latest submission_idx should be '11'
    expect(agg.submission_idx).toBe('11')
  })

  it('multiple fills different digests → separate groups', () => {
    const fills = [
      makeFill('0xabc', '10', 1000),
      makeFill('0xdef', '11', 1001),
    ]
    const result = aggregateByDigest(fills)
    expect(result).toHaveLength(2)
    expect(result[0]!.digest).toBe('0xdef') // newest first
    expect(result[1]!.digest).toBe('0xabc')
  })

  it('fills without digest each become separate groups', () => {
    const fills = [
      makeFill(undefined, '10', 1000),
      makeFill(undefined, '11', 1001),
    ]
    const result = aggregateByDigest(fills)
    expect(result).toHaveLength(2)
    expect(result[0]!.fillCount).toBe(1)
    expect(result[1]!.fillCount).toBe(1)
  })

  it('mixed: some with digest, some without', () => {
    const fills = [
      makeFill('0xabc', '10', 1000),
      makeFill('0xabc', '11', 1001),
      makeFill(undefined, '12', 1002),
    ]
    const result = aggregateByDigest(fills)
    expect(result).toHaveLength(2)
    // No-digest fill (idx 12) is newest, then aggregated abc (latest idx 11)
    expect(result[0]!.fillCount).toBe(1) // no-digest
    expect(result[1]!.fillCount).toBe(2) // 0xabc group
  })

  it('output sorted newest first by submission_idx', () => {
    const fills = [
      makeFill('0xa', '5', 1000),
      makeFill('0xb', '20', 1002),
      makeFill('0xc', '10', 1001),
    ]
    const result = aggregateByDigest(fills)
    expect(result.map((r) => r.submission_idx)).toEqual(['20', '10', '5'])
  })

  it('preserves side, pair, product_id from first fill', () => {
    const fills = [
      makeFill('0xabc', '10', 1000, { side: 'short', pair: 'ETH-PERP', productId: 4 }),
      makeFill('0xabc', '11', 1001, { side: 'short', pair: 'ETH-PERP', productId: 4 }),
    ]
    const result = aggregateByDigest(fills)
    expect(result[0]!.side).toBe('short')
    expect(result[0]!.pair).toBe('ETH-PERP')
    expect(result[0]!.product_id).toBe(4)
  })

  it('VWAP with zero base → price = 0', () => {
    const fill: TradeMatch = {
      digest: '0xabc',
      submission_idx: '10',
      timestamp: String(BigInt(1000) * BigInt(1_000_000_000)),
      product_id: 2,
      pair: 'BTC-PERP',
      amount: '0',
      price: '0',
      quote_filled: '0',
      realized_pnl: '0',
      closed_amount: '0',
      fee: '0',
      sequencer_fee: '0',
      side: 'long',
      is_perp: true,
    }
    const result = aggregateByDigest([fill])
    expect(result[0]!.price).toBe(0)
  })
})
