'use client'

import { useMemo } from 'react'
import { useOrderbookStore } from '@/store/orderbookStore'
import { aggregateLevels } from '@/lib/orderbook'
import type { OrderbookLevel } from '@/types/nado'

const fmtPrice = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const fmtSize = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 6 })

interface Props {
  tickSize: number
  maxRows?: number
}

function SizeBar({ size, maxSize, side }: { size: number; maxSize: number; side: 'bid' | 'ask' }) {
  const pct = maxSize > 0 ? (size / maxSize) * 100 : 0
  return (
    <div className="absolute inset-0 opacity-15"
      style={{
        background: side === 'bid' ? `linear-gradient(to left, #34d399 ${pct}%, transparent ${pct}%)` : `linear-gradient(to right, #f87171 ${pct}%, transparent ${pct}%)`,
      }}
    />
  )
}

function LevelRow({ level, maxSize, side }: { level: OrderbookLevel; maxSize: number; side: 'bid' | 'ask' }) {
  const priceColor = side === 'bid' ? 'text-emerald-400' : 'text-red-400'
  return (
    <tr className="relative hover:bg-white/[0.03]">
      <td className="relative px-2 py-0.5 tabular-nums">
        <SizeBar size={level.size} maxSize={maxSize} side={side} />
        <span className={`relative ${priceColor} font-mono text-xs`}>{fmtPrice.format(level.price)}</span>
      </td>
      <td className="px-2 py-0.5 text-right tabular-nums text-xs text-white/60 font-mono">
        {fmtSize.format(level.size)}
      </td>
    </tr>
  )
}

export function OrderbookTable({ tickSize, maxRows = 20 }: Props) {
  const rawBids = useOrderbookStore((s) => s.bids)
  const rawAsks = useOrderbookStore((s) => s.asks)

  const bids = useMemo(
    () => aggregateLevels(rawBids, tickSize).sort((a, b) => b.price - a.price).slice(0, maxRows),
    [rawBids, tickSize, maxRows]
  )
  const asks = useMemo(
    () => aggregateLevels(rawAsks, tickSize).sort((a, b) => a.price - b.price).slice(0, maxRows),
    [rawAsks, tickSize, maxRows]
  )

  const maxBidSize = useMemo(() => Math.max(...bids.map((b) => b.size), 0), [bids])
  const maxAskSize = useMemo(() => Math.max(...asks.map((a) => a.size), 0), [asks])

  const bestBid = bids[0]?.price
  const bestAsk = asks[0]?.price
  const spread = bestBid && bestAsk ? bestAsk - bestBid : null

  if (bids.length === 0 && asks.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-center text-sm text-white/30">
        Loading orderbook…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
      <div className="flex text-[10px] uppercase tracking-wider text-white/30 px-2 py-1.5 border-b border-white/5">
        <span className="flex-1">Price (USDT)</span>
        <span>Size</span>
      </div>

      {/* Asks — reversed so best ask is closest to spread */}
      <table className="w-full">
        <tbody>
          {[...asks].reverse().map((a) => (
            <LevelRow key={a.price} level={a} maxSize={maxAskSize} side="ask" />
          ))}
        </tbody>
      </table>

      {/* Spread row */}
      {spread !== null && (
        <div className="flex items-center justify-center gap-2 py-1 border-y border-white/5 bg-white/[0.02]">
          <span className="text-[10px] text-white/30 tabular-nums font-mono">
            Spread {fmtPrice.format(spread)}
          </span>
        </div>
      )}

      {/* Bids */}
      <table className="w-full">
        <tbody>
          {bids.map((b) => (
            <LevelRow key={b.price} level={b} maxSize={maxBidSize} side="bid" />
          ))}
        </tbody>
      </table>
    </div>
  )
}
