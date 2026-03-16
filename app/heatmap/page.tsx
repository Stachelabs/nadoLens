'use client'

import { useLiquidationStream } from '@/hooks/useLiquidationStream'
import { useLiquidationStore } from '@/store/liquidationStore'
import { fromX18 } from '@/types/nado'
import type { LiquidationEvent } from '@/types/nado'

function formatTimestamp(ns: string): string {
  const ms = Math.floor(parseInt(ns) / 1_000_000)
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function LiquidationRow({ event }: { event: LiquidationEvent }) {
  const side = event.side ?? (parseFloat(event.amount) >= 0 ? 'long' : 'short')
  const amountUsd = event.amountUsd ?? Math.abs(fromX18(event.amount))
  const priceUsd = event.priceUsd ?? fromX18(event.price)
  const isLong = side === 'long'

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-2 text-xs text-white/40 tabular-nums">
        {formatTimestamp(event.timestamp)}
      </td>
      <td className="px-4 py-2 text-xs text-white/60">
        {event.product_ids.join(', ')}
      </td>
      <td className="px-4 py-2">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
            isLong
              ? 'bg-red-500/15 text-red-400'
              : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {side.toUpperCase()}
        </span>
      </td>
      <td className={`px-4 py-2 text-xs tabular-nums font-medium text-right ${isLong ? 'text-red-400' : 'text-emerald-400'}`}>
        {formatUsd(amountUsd)}
      </td>
      <td className="px-4 py-2 text-xs text-white/60 tabular-nums text-right">
        {formatUsd(priceUsd)}
      </td>
    </tr>
  )
}

export default function HeatmapPage() {
  useLiquidationStream()
  const events = useLiquidationStore((state) => state.events)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white/90">
            Liquidation Feed
          </h1>
          <p className="mt-0.5 text-xs text-white/40">
            Live stream · {events.length} events
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-white/30">
                Time
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-white/30">
                Product
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-white/30">
                Side
              </th>
              <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-white/30">
                Size
              </th>
              <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-white/30">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-white/20"
                >
                  Waiting for liquidations…
                </td>
              </tr>
            ) : (
              events.map((event, i) => (
                <LiquidationRow key={`${event.timestamp}-${i}`} event={event} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
