import type { OrderbookLevel } from '@/types/nado'

export interface DepthPoint {
  price: number
  cumSize: number
  side: 'bid' | 'ask'
}

/**
 * Aggregates orderbook levels by tick size buckets, summing sizes within each bucket.
 * Bids should remain sorted highest→lowest, asks lowest→highest after aggregation.
 */
export function aggregateLevels(levels: OrderbookLevel[], tickSize: number): OrderbookLevel[] {
  if (tickSize <= 0) return levels
  const map = new Map<number, number>()
  for (const level of levels) {
    const bucket = Math.floor(level.price / tickSize) * tickSize
    map.set(bucket, (map.get(bucket) ?? 0) + level.size)
  }
  return Array.from(map.entries()).map(([price, size]) => ({ price, size }))
}

/**
 * Computes cumulative depth curve points for canvas rendering.
 * Bids: best (highest) first → cumulate downward in price.
 * Asks: best (lowest) first → cumulate upward in price.
 */
export function computeDepthCurve(
  bids: OrderbookLevel[],
  asks: OrderbookLevel[],
): DepthPoint[] {
  const bidPoints: DepthPoint[] = []
  let cumBid = 0
  for (const b of bids) {
    cumBid += b.size
    bidPoints.push({ price: b.price, cumSize: cumBid, side: 'bid' })
  }

  const askPoints: DepthPoint[] = []
  let cumAsk = 0
  for (const a of asks) {
    cumAsk += a.size
    askPoints.push({ price: a.price, cumSize: cumAsk, side: 'ask' })
  }

  return [...bidPoints.reverse(), ...askPoints]
}

export const PAIRS: { label: string; pair: string; productId: number }[] = [
  { label: 'BTC', pair: 'BTCUSDT0', productId: 2 },
  { label: 'ETH', pair: 'ETHUSDT0', productId: 4 },
  { label: 'SOL', pair: 'SOLUSDT0', productId: 8 },
]

export const TICK_SIZES = [0.1, 1, 10, 100]
