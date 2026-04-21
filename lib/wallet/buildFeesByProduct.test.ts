import { describe, expect, it, vi } from 'vitest'
import type { TradeMatch } from '@/types/nado'

vi.mock('@/store/pairsStore', () => ({
  productName: (id: number) => `PRODUCT-${id}`,
}))

const { buildFeesByProduct } = await import('./buildFeesByProduct')

const WAD = BigInt(10) ** BigInt(18)

function mockTrade(productId: number, feeUsd: number): TradeMatch {
  return {
    submission_idx: '0',
    timestamp: '0',
    product_id: productId,
    pair: '',
    amount: '0',
    price: '0',
    realized_pnl: '0',
    closed_amount: '0',
    fee: (BigInt(Math.round(feeUsd * 1e6)) * WAD / BigInt(1e6)).toString(),
    sequencer_fee: '0',
    side: 'long',
    is_perp: true,
  }
}

describe('buildFeesByProduct', () => {
  it('returns empty array for empty input', () => {
    expect(buildFeesByProduct([])).toEqual([])
  })

  it('groups trades by product and sums fees', () => {
    const result = buildFeesByProduct([
      mockTrade(1, 1),
      mockTrade(1, 2),
      mockTrade(2, 5),
    ])
    expect(result).toHaveLength(2)
    expect(result[0]!.product_id).toBe(2)
    expect(result[0]!.fees_usd).toBeCloseTo(5)
    expect(result[1]!.product_id).toBe(1)
    expect(result[1]!.fees_usd).toBeCloseTo(3)
  })

  it('sorts descending by fees_usd', () => {
    const result = buildFeesByProduct([
      mockTrade(3, 1),
      mockTrade(1, 10),
      mockTrade(2, 5),
    ])
    expect(result.map(p => p.product_id)).toEqual([1, 2, 3])
  })

  it('computes cumulative correctly', () => {
    const result = buildFeesByProduct([
      mockTrade(1, 3),
      mockTrade(2, 5),
    ])
    expect(result[0]!.cumulative_fees_usd).toBeCloseTo(5)
    expect(result[1]!.cumulative_fees_usd).toBeCloseTo(8)
  })

  it('resolves symbol via productName', () => {
    const result = buildFeesByProduct([mockTrade(42, 1)])
    expect(result[0]!.symbol).toBe('PRODUCT-42')
  })
})
