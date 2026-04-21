import type { FundingPaymentEntry } from '@/lib/wallet/buildEquityCurve'
import { fromX18BigInt } from '@/types/nado'
import { productName } from '@/store/pairsStore'

export type ProductFundingPoint = {
  symbol: string
  product_id: number
  funding_usd: number
  cumulative_funding_usd: number
}

export function buildFundingByProduct(payments: FundingPaymentEntry[]): ProductFundingPoint[] {
  const map = new Map<number, number>()

  for (const payment of payments) {
    const amount = fromX18BigInt(payment.amount)
    map.set(payment.product_id, (map.get(payment.product_id) ?? 0) + amount)
  }

  const sorted: ProductFundingPoint[] = [...map.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([product_id, funding_usd]) => ({
      symbol: productName(product_id),
      product_id,
      funding_usd,
      cumulative_funding_usd: 0,
    }))

  let cumulative = 0
  for (const point of sorted) {
    cumulative += point.funding_usd
    point.cumulative_funding_usd = cumulative
  }

  return sorted
}
