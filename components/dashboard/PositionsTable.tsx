'use client'

import { useAccountStore } from '@/store/accountStore'
import { MaintWeightBadge } from './MaintWeightBadge'
import { PnLFlash } from './PnLFlash'
import type { Position } from '@/types/nado'

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function PositionsTable() {
  const positions = useAccountStore((s) => s.positions)

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-white/20">
        No open positions
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-white/10">
            {[
              'Pair',
              'Side',
              'Size',
              'Entry',
              'Mark',
              'Unreal. PnL',
              'Liq. Price',
              'Maint Weight',
            ].map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-white/30"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos: Position) => {
            const isLong = pos.amount >= 0
            const isNearLiq = pos.liquidation_price > 0 &&
              Math.abs((pos.mark_price - pos.liquidation_price) / pos.mark_price) < 0.1

            return (
              <tr
                key={pos.product_id}
                className={`border-b border-white/5 transition-colors ${
                  isNearLiq ? 'bg-red-500/5 hover:bg-red-500/8' : 'hover:bg-white/[0.02]'
                }`}
              >
                <td className="px-3 py-2.5 text-xs font-medium text-white/80">{pos.pair}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                      isLong
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-white/70">
                  {Math.abs(pos.amount).toFixed(4)}
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-white/50">
                  {fmtUsd.format(pos.entry_price)}
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-white/70">
                  {fmtUsd.format(pos.mark_price)}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <PnLFlash pnl={pos.unrealized_pnl} />
                </td>
                <td
                  className={`px-3 py-2.5 text-xs tabular-nums ${
                    isNearLiq ? 'text-red-400 font-semibold' : 'text-orange-400'
                  }`}
                >
                  {fmtUsd.format(pos.liquidation_price)}
                </td>
                <td className="px-3 py-2.5">
                  <MaintWeightBadge weight={pos.maint_weight} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
