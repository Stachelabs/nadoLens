'use client'

import { useAccountStore } from '@/store/accountStore'

export function LiquidationGap() {
  const positions = useAccountStore((s) => s.positions)

  const gaps = positions
    .filter((p) => p.liquidation_price > 0 && p.mark_price > 0)
    .map((p) => {
      const dropPct = ((p.mark_price - p.liquidation_price) / p.mark_price) * 100
      return { pair: p.pair, dropPct: Math.abs(dropPct), side: p.amount >= 0 ? 'LONG' : 'SHORT' }
    })
    .sort((a, b) => a.dropPct - b.dropPct)

  if (gaps.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Liquidation Gap</div>
        <div className="text-lg text-white/20">—</div>
        <div className="mt-0.5 text-xs text-white/20">No open positions</div>
      </div>
    )
  }

  const critical = gaps[0]
  const isCritical = critical.dropPct < 10
  const isWarning = critical.dropPct < 25

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isCritical
          ? 'border-red-500/40 bg-red-500/10'
          : isWarning
          ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">
        Liquidation Gap
      </div>
      <div
        className={`text-2xl font-bold tabular-nums ${
          isCritical ? 'text-red-400 animate-pulse' : isWarning ? 'text-orange-400' : 'text-white/80'
        }`}
      >
        -{critical.dropPct.toFixed(2)}%
      </div>
      <div className="mt-1 text-xs text-white/40">
        {critical.pair} {critical.side} — drop before liquidation
      </div>
    </div>
  )
}
