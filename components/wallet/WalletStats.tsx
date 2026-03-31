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
  const dash = '—'

  const items = [
    {
      label: 'Win Rate',
      value: tradesComplete ? `${stats.win_rate.toFixed(1)}%` : dash,
      color: stats.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400',
      sub: null,
    },
    {
      label: 'Total PnL',
      value: tradesComplete
        ? `${isPnlPositive ? '+' : ''}${fmtUsd.format(stats.net_pnl_usd)}`
        : dash,
      color: isPnlPositive ? 'text-emerald-400' : 'text-red-400',
      sub: null,
    },
    {
      label: 'Volume',
      value: tradesComplete ? fmtUsd.format(stats.total_volume_usd) : dash,
      color: 'text-foreground',
      sub: null,
    },
    {
      label: 'Avg Trade',
      value: tradesComplete ? fmtUsd.format(stats.avg_trade_size_usd) : dash,
      color: 'text-foreground/70',
      sub: null,
    },
    {
      label: 'Trades',
      value: tradesComplete ? totalTrades.toString() : dash,
      color: 'text-foreground/70',
      sub:
        tradesComplete && (stats.perp_trades_count > 0 || stats.spot_trades_count > 0)
          ? `${stats.perp_trades_count} perp · ${stats.spot_trades_count} spot`
          : null,
    },
    {
      label: 'Total Fees',
      value: tradesComplete ? fmtUsd.format(stats.total_fees_usd) : dash,
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
    <div className="flex flex-row flex-wrap gap-3 lg:flex-nowrap">
      {items.map(({ label, value, color, sub }) => (
        <Card
          key={label}
          className="border-border bg-card min-w-0 flex-[1_1_calc(50%-6px)] sm:flex-[1_1_calc(33.333%-8px)] lg:flex-1"
        >
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
