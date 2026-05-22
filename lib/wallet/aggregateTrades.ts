import type { TradeMatch } from '@/types/nado'
import { fromX18BigInt } from '@/types/nado'

export type AggregatedTrade = {
  digest: string
  fills: TradeMatch[]
  timestamp: string
  submission_idx: string
  product_id: number
  pair: string
  side: 'long' | 'short'
  is_perp: boolean
  is_taker?: boolean
  isolated?: boolean
  subaccount?: string
  price: number
  amount: number
  quote_filled: number
  realized_pnl: number
  closed_amount: number
  fee: number
  fillCount: number
}

export function aggregateByDigest(trades: TradeMatch[]): AggregatedTrade[] {
  const groups = new Map<string, TradeMatch[]>()

  let noDigestIdx = 0
  for (const t of trades) {
    const key = t.digest ?? `__no_digest_${noDigestIdx++}`
    const group = groups.get(key)
    if (group) {
      group.push(t)
    } else {
      groups.set(key, [t])
    }
  }

  const result: AggregatedTrade[] = []

  for (const [digest, fills] of groups) {
    let totalBase = 0
    let totalQuote = 0
    let totalPnl = 0
    let totalClosed = 0
    let totalFee = 0
    let latestIdx: bigint | null = null
    let latestFill = fills[0]!

    for (const f of fills) {
      totalBase += Math.abs(fromX18BigInt(f.amount))
      totalQuote += Math.abs(fromX18BigInt(f.quote_filled ?? '0'))
      totalPnl += fromX18BigInt(f.realized_pnl)
      totalClosed += Math.abs(fromX18BigInt(f.closed_amount))
      totalFee += Math.abs(fromX18BigInt(f.fee))

      try {
        const idx = BigInt(f.submission_idx)
        if (latestIdx === null || idx > latestIdx) {
          latestIdx = idx
          latestFill = f
        }
      } catch {
        // skip malformed idx
      }
    }

    const first = fills[0]!
    const rawVwap = totalBase > 0 ? totalQuote / totalBase : 0
    const vwap = Number.isFinite(rawVwap) ? rawVwap : 0

    result.push({
      digest,
      fills,
      timestamp: latestFill.timestamp,
      submission_idx: latestFill.submission_idx,
      product_id: first.product_id,
      pair: first.pair,
      side: first.side,
      is_perp: first.is_perp,
      is_taker: first.is_taker,
      isolated: first.isolated,
      subaccount: first.subaccount,
      price: vwap,
      amount: totalBase,
      quote_filled: totalQuote,
      realized_pnl: totalPnl,
      closed_amount: totalClosed,
      fee: totalFee,
      fillCount: fills.length,
    })
  }

  result.sort((a, b) => {
    try {
      const ai = BigInt(a.submission_idx)
      const bi = BigInt(b.submission_idx)
      if (ai > bi) return -1
      if (ai < bi) return 1
      return 0
    } catch {
      return 0
    }
  })

  return result
}
