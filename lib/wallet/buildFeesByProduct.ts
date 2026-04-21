import { fromX18BigInt } from '@/types/nado'
import type { TradeMatch } from '@/types/nado'
import { productName } from '@/store/pairsStore'

export type ProductFeePoint = {
  symbol: string
  product_id: number
  fees_usd: number
  cumulative_fees_usd: number
}

export function buildFeesByProduct(trades: TradeMatch[]): ProductFeePoint[] {
  const map = new Map<number, number>()

  for (const trade of trades) {
    const fee = Math.abs(fromX18BigInt(trade.fee))
    map.set(trade.product_id, (map.get(trade.product_id) ?? 0) + fee)
  }

  const sorted: ProductFeePoint[] = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([product_id, fees_usd]) => ({
      symbol: productName(product_id),
      product_id,
      fees_usd,
      cumulative_fees_usd: 0,
    }))

  let cumulative = 0
  for (const point of sorted) {
    cumulative += point.fees_usd
    point.cumulative_fees_usd = cumulative
  }

  return sorted
}
