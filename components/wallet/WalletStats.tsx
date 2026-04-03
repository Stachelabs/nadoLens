'use client'

import type { WalletStats } from '@/types/nado'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

type Props = {
  stats: WalletStats
  tradesComplete?: boolean
  fundingComplete?: boolean
}

export function WalletStats({
  stats,
  tradesComplete = true,
  fundingComplete = true,
}: Props) {
  const isPnlPositive = stats.net_pnl_usd >= 0
  const pnlComplete = tradesComplete && fundingComplete
  const totalTrades = stats.perp_trades_count + stats.spot_trades_count
  const metricsLoading = !tradesComplete

  const items = [
    {
      label: 'Win Rate',
      skeleton: metricsLoading,
      skeletonClass: 'h-5 w-14 mx-auto',
      value: `${stats.win_rate.toFixed(1)}%`,
      color: stats.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400',
      sub: null,
      subSkeleton: false,
    },
    {
      label: 'Total PnL',
      skeleton: !pnlComplete,
      skeletonClass: 'h-5 w-24 mx-auto',
      value: `${isPnlPositive ? '+' : ''}${fmtUsd.format(stats.net_pnl_usd)}`,
      color: isPnlPositive ? 'text-emerald-400' : 'text-red-400',
      sub: null,
      subSkeleton: false,
    },
    {
      label: 'Volume',
      skeleton: metricsLoading,
      skeletonClass: 'h-5 w-28 mx-auto',
      value: fmtUsd.format(stats.total_volume_usd),
      color: 'text-foreground',
      sub: null,
      subSkeleton: false,
    },
    {
      label: 'Avg Trade',
      skeleton: metricsLoading,
      skeletonClass: 'h-5 w-20 mx-auto',
      color: 'text-foreground/70',
      value: fmtUsd.format(stats.avg_trade_size_usd),
      sub: null,
      subSkeleton: false,
    },
    {
      label: 'Trades',
      skeleton: metricsLoading,
      skeletonClass: 'h-5 w-12 mx-auto',
      value: totalTrades.toString(),
      color: 'text-foreground/70',
      sub:
        tradesComplete && (stats.perp_trades_count > 0 || stats.spot_trades_count > 0)
          ? `${stats.perp_trades_count} perp · ${stats.spot_trades_count} spot`
          : null,
      subSkeleton: metricsLoading,
    },
    {
      label: 'Total Fees',
      skeleton: metricsLoading,
      skeletonClass: 'h-5 w-20 mx-auto',
      value: fmtUsd.format(stats.total_fees_usd),
      color: 'text-red-400',
      sub: null,
      subSkeleton: false,
    },
  ]

  const showLoadingHint = !tradesComplete || !fundingComplete

  return (
    <div className="space-y-1.5">
      {showLoadingHint && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
          {!tradesComplete
            ? 'Loading trade history…'
            : 'Loading funding…'}
        </div>
      )}
    <div className="flex flex-row flex-wrap gap-3 lg:flex-nowrap">
      {items.map(({ label, value, color, sub, skeleton, skeletonClass, subSkeleton }) => (
        <Card
          key={label}
          className="border-border bg-card min-w-0 flex-[1_1_calc(50%-6px)] sm:flex-[1_1_calc(33.333%-8px)] lg:flex-1"
        >
          <CardContent className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">{label}</div>
            <div className={cn('min-h-7 flex items-center justify-center')}>
              {skeleton ? (
                <Skeleton className={skeletonClass} />
              ) : (
                <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
              )}
            </div>
            {subSkeleton ? (
              <Skeleton className="h-3 w-24 mx-auto mt-0.5" />
            ) : sub ? (
              <div className="text-[10px] tabular-nums text-muted-foreground/50 mt-0.5">{sub}</div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  )
}
