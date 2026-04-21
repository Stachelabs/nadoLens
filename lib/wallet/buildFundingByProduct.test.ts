import { describe, expect, it, vi } from 'vitest'
import type { FundingPaymentEntry } from './buildEquityCurve'

vi.mock('@/store/pairsStore', () => ({
  productName: (id: number) => `PRODUCT-${id}`,
}))

const { buildFundingByProduct } = await import('./buildFundingByProduct')

const WAD = BigInt(10) ** BigInt(18)

function mockFunding(productId: number, amountUsd: number): FundingPaymentEntry {
  const raw = amountUsd >= 0
    ? (BigInt(Math.round(amountUsd * 1e6)) * WAD / BigInt(1e6)).toString()
    : (-BigInt(Math.round(Math.abs(amountUsd) * 1e6)) * WAD / BigInt(1e6)).toString()
  return {
    subaccount: '0xabc',
    product_id: productId,
    idx: String(productId),
    timestamp: '0',
    amount: raw,
    source: 'funding',
  }
}

describe('buildFundingByProduct', () => {
  it('returns empty array for empty input', () => {
    expect(buildFundingByProduct([])).toEqual([])
  })

  it('groups payments by product with signed sum', () => {
    const result = buildFundingByProduct([
      mockFunding(1, 3),
      mockFunding(1, -1),
      mockFunding(2, -5),
    ])
    expect(result).toHaveLength(2)
    expect(result[0]!.product_id).toBe(2)
    expect(result[0]!.funding_usd).toBeCloseTo(-5)
    expect(result[1]!.product_id).toBe(1)
    expect(result[1]!.funding_usd).toBeCloseTo(2)
  })

  it('sorts by abs(funding_usd) descending', () => {
    const result = buildFundingByProduct([
      mockFunding(1, 2),
      mockFunding(2, -7),
      mockFunding(3, 4),
    ])
    expect(result.map(p => p.product_id)).toEqual([2, 3, 1])
  })

  it('computes cumulative correctly', () => {
    const result = buildFundingByProduct([
      mockFunding(1, -5),
      mockFunding(2, 3),
    ])
    expect(result[0]!.cumulative_funding_usd).toBeCloseTo(-5)
    expect(result[1]!.cumulative_funding_usd).toBeCloseTo(-2)
  })

  it('resolves symbol via productName', () => {
    const result = buildFundingByProduct([mockFunding(99, 1)])
    expect(result[0]!.symbol).toBe('PRODUCT-99')
  })
})
