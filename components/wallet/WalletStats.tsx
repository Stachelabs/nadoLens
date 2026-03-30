'use client'

import type { WalletStats } from '@/types/nado'
import { Card, CardContent } from '@/components/ui/card'

const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

type Props = {
  stats: WalletStats
  tradesComplete?: boolean
}

export function WalletStats({ stats, tradesComplete = true }: Props) {
  const isPnlPositive = stats.net_pnl_usd >= 0
  const totalTrades = stats.perp_trades_count + stats.spot_trades_count

  const items = [
    {
      label: 'Win Rate',
      value: `${stats.win_rate.toFixed(1)}%`,
      color: stats.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400',
      sub: null,
    },
    {
      label: 'Total PnL',
      value: `${isPnlPositive ? '+' : ''}${fmtUsd.format(stats.net_pnl_usd)}`,
      color: isPnlPositive ? 'text-emerald-400' : 'text-red-400',
      sub: null,
    },
    {
      label: 'Volume',
      value: fmtUsd.format(stats.total_volume_usd),
      color: 'text-foreground',
      sub: null,
    },
    {
      label: 'Avg Trade',
      value: fmtUsd.format(stats.avg_trade_size_usd),
      color: 'text-foreground/70',
      sub: null,
    },
    {
      label: 'Trades',
      value: totalTrades.toString(),
      color: 'text-foreground/70',
      sub: stats.perp_trades_count > 0 || stats.spot_trades_count > 0
        ? `${stats.perp_trades_count} perp · ${stats.spot_trades_count} spot`
        : null,
    },
    {
      label: 'Total Fees',
      value: fmtUsd.format(stats.total_fees_usd),
      color: 'text-red-400',
      sub: null,
    },
  ]

  return (
    <div className="space-y-1.5">
      {!tradesComplete && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
          Loading trade history…
        </div>
      )}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map(({ label, value, color, sub }) => (
        <Card key={label} className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">{label}</div>
            <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
            {sub && (
              <div className="text-[10px] tabular-nums text-muted-foreground/50 mt-0.5">{sub}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  )
}
