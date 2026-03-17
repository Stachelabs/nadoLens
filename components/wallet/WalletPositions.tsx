'use client'

import type { Position } from '@/types/nado'

const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const fmtQty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

interface Props {
  positions: Position[]
}

export function WalletPositions({ positions }: Props) {
  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Open Positions</div>
        <div className="text-sm text-white/30 text-center py-6">No open positions</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-3">
        Open Positions <span className="ml-1 text-white/20">({positions.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/30 text-left">
              <th className="pb-2 pr-4 font-normal">Pair</th>
              <th className="pb-2 pr-4 font-normal">Side</th>
              <th className="pb-2 pr-4 font-normal text-right">Size</th>
              <th className="pb-2 pr-4 font-normal text-right">Entry</th>
              <th className="pb-2 pr-4 font-normal text-right">Mark</th>
              <th className="pb-2 pr-4 font-normal text-right">Unrealized PnL</th>
              <th className="pb-2 font-normal text-right">Liq Price</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const isLong = pos.amount >= 0
              const pnlColor = pos.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
              const nearLiq = pos.liquidation_price > 0 &&
                Math.abs(pos.mark_price - pos.liquidation_price) / pos.mark_price < 0.1
              const liqColor = nearLiq ? 'text-red-400 font-bold' : 'text-white/50'

              return (
                <tr key={pos.product_id} className="border-t border-white/5">
                  <td className="py-2 pr-4 font-mono text-white/80">{pos.pair}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isLong ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-white/70">
                    {fmtQty.format(Math.abs(pos.amount))}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-white/60">
                    {fmtUsd.format(pos.entry_price)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-white/80">
                    {fmtUsd.format(pos.mark_price)}
                  </td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${pnlColor}`}>
                    {pos.unrealized_pnl >= 0 ? '+' : ''}{fmtUsd.format(pos.unrealized_pnl)}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${liqColor}`}>
                    {pos.liquidation_price > 0 ? fmtUsd.format(pos.liquidation_price) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
