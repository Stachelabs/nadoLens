'use client'

import { fromX18 } from '@/types/nado'
import type { TradeMatch } from '@/types/nado'

const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const fmtQty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

function fmtTime(nanosStr: string): string {
  const ms = parseInt(nanosStr) / 1_000_000
  if (isNaN(ms)) return '—'
  const d = new Date(ms)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

interface Props {
  trades: TradeMatch[]
}

export function WalletTradeHistory({ trades }: Props) {
  const recent = trades.slice(0, 50)

  if (recent.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Trade History</div>
        <div className="text-sm text-white/30 text-center py-6">No trades found</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-3">
        Trade History <span className="ml-1 text-white/20">(last {recent.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/30 text-left">
              <th className="pb-2 pr-4 font-normal">Time</th>
              <th className="pb-2 pr-4 font-normal">Pair</th>
              <th className="pb-2 pr-4 font-normal">Side</th>
              <th className="pb-2 pr-4 font-normal text-right">Price</th>
              <th className="pb-2 pr-4 font-normal text-right">Qty</th>
              <th className="pb-2 pr-4 font-normal text-right">Realized PnL</th>
              <th className="pb-2 font-normal text-right">Fee</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((t, i) => {
              const pnl = fromX18(t.realized_pnl)
              const price = fromX18(t.price)
              const qty = Math.abs(fromX18(t.amount))
              const fee = fromX18(t.fee)
              const hasPnl = Math.abs(pnl) > 0.001
              const pnlColor = pnl >= 0 ? 'text-emerald-400' : 'text-red-400'

              return (
                <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2 pr-4 text-white/40 whitespace-nowrap">{fmtTime(t.timestamp)}</td>
                  <td className="py-2 pr-4 font-mono text-white/70">{t.pair}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.side === 'long' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>
                      {t.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-white/70">{fmtUsd.format(price)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-white/60">{fmtQty.format(qty)}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${hasPnl ? pnlColor : 'text-white/30'}`}>
                    {hasPnl ? `${pnl >= 0 ? '+' : ''}${fmtUsd.format(pnl)}` : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums text-white/40">{fmtUsd.format(fee)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
