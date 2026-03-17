'use client'

import type { WalletStats } from '@/types/nado'

const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

interface Props {
  stats: WalletStats
}

export function WalletStats({ stats }: Props) {
  const isPnlPositive = stats.total_pnl_usd >= 0

  const items = [
    {
      label: 'Win Rate',
      value: `${stats.win_rate.toFixed(1)}%`,
      color: stats.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Total PnL',
      value: `${isPnlPositive ? '+' : ''}${fmtUsd.format(stats.total_pnl_usd)}`,
      color: isPnlPositive ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Volume',
      value: fmtUsd.format(stats.total_volume_usd),
      color: 'text-white/80',
    },
    {
      label: 'Avg Trade',
      value: fmtUsd.format(stats.avg_trade_size_usd),
      color: 'text-white/60',
    },
    {
      label: 'Trades',
      value: stats.trades.length.toString(),
      color: 'text-white/60',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {items.map(({ label, value, color }) => (
        <div
          key={label}
          className="rounded-lg border border-white/10 bg-black/20 p-3 text-center"
        >
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{label}</div>
          <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
        </div>
      ))}
    </div>
  )
}
