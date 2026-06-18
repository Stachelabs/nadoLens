import { fromX18BigInt } from '@/types/nado'
import type { TradeMatch } from '@/types/nado'
import { productName } from '@/store/pairsStore'

export type ProductVolumePoint = {
  symbol: string
  product_id: number
  volume_usd: number
  cumulative_volume_usd: number
}

export function buildVolumeByProduct(trades: TradeMatch[]): ProductVolumePoint[] {
  const map = new Map<number, number>()

  for (const trade of trades) {
    const notional = Math.abs(fromX18BigInt((trade.quote_filled ?? '0').toString()))
    map.set(trade.product_id, (map.get(trade.product_id) ?? 0) + notional)
  }

  const sorted: ProductVolumePoint[] = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([product_id, volume_usd]) => ({
      symbol: productName(product_id),
      product_id,
      volume_usd,
      cumulative_volume_usd: 0,
    }))

  let cumulative = 0
  for (const point of sorted) {
    cumulative += point.volume_usd
    point.cumulative_volume_usd = cumulative
  }

  return sorted
}
