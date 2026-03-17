'use client'

import { useOrderbookStore } from '@/store/orderbookStore'

const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })

export function SpreadBadge() {
  const bids = useOrderbookStore((s) => s.bids)
  const asks = useOrderbookStore((s) => s.asks)

  const bestBid = bids[0]?.price
  const bestAsk = asks[0]?.price

  if (!bestBid || !bestAsk) {
    return <div className="text-xs text-white/30">Spread —</div>
  }

  const spread = bestAsk - bestBid
  const midPrice = (bestBid + bestAsk) / 2
  const spreadPct = (spread / midPrice) * 100

  return (
    <div className="flex items-center gap-3">
      <div className="text-[10px] uppercase tracking-wider text-white/30">Spread</div>
      <div className="text-sm font-mono font-medium text-white/80 tabular-nums">
        {fmtUsd.format(spread)}
      </div>
      <div className="text-xs font-mono text-white/40 tabular-nums">
        {spreadPct.toFixed(4)}%
      </div>
      <div className="text-[10px] text-white/30 font-mono">
        mid {fmtUsd.format(midPrice)}
      </div>
    </div>
  )
}
