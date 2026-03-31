'use client'

import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { nanoStringToMs } from '@/lib/wallet/nanoTime'
import type { WalletStats } from '@/types/nado'

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const fmtUsdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function formatTimestamp(nanoTs: string | null): string {
  const ms = nanoTs ? nanoStringToMs(nanoTs) : null
  if (ms === null) return '—'
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function timeAgo(nanoTs: string | null): string {
  const ms = nanoTs ? nanoStringToMs(nanoTs) : null
  if (ms === null) return '—'
  const diffMs = Date.now() - ms
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`
}

type Props = {
  stats: WalletStats
  tradesComplete?: boolean
  /** Re-fetch subaccounts, matches, funding — updates equity, overview, PnL from history. */
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
  /** Re-fetch Gateway subaccount_info — live unrealized only (not all-time PnL). */
  onRefreshUnrealized?: () => void | Promise<void>
  unrealizedRefreshing?: boolean
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string
  value: ReactNode
  valueClass?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {label}
      </span>
      <span
        className={cn(
          'text-sm font-bold tabular-nums font-mono text-right min-h-5 flex items-center justify-end',
          valueClass ?? 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Section({
  title,
  loading,
  action,
  className,
  children,
}: {
  title: string
  loading?: boolean
  action?: ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn(className)}>
      <div className="flex items-center justify-between gap-2 mb-2 min-h-6">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/70">
          {title}
          {loading && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function WalletSummary({
  stats,
  tradesComplete = true,
  onRefresh,
  refreshing = false,
  onRefreshUnrealized,
  unrealizedRefreshing = false,
}: Props) {
  // Same total as parseSubaccountInfo.unrealizedTotal (BigInt-safe); do not re-sum floats here.
  const unrealizedPnl = stats.unrealized_pnl_usd
  const isUnrealizedPositive = unrealizedPnl >= 0
  const isAllTimePnlPositive = stats.net_pnl_usd >= 0

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="flex min-w-0 w-full flex-col gap-6 lg:flex-1 lg:basis-0">
            <Section title="Trader Equity">
              <Row label="Equity" value={fmtUsd.format(stats.total_equity_usd)} />
              <Row label="Maintenance" value={fmtUsd.format(stats.maintenance_margin)} />
            </Section>

            <Section
              title="Positions"
              action={
                onRefreshUnrealized ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                    disabled={unrealizedRefreshing}
                    onClick={() => void onRefreshUnrealized()}
                    aria-label="Refresh unrealized PnL and mark prices"
                  >
                    <RefreshCw
                      className={cn('size-3', unrealizedRefreshing && 'animate-spin')}
                      aria-hidden
                    />
                  </Button>
                ) : null
              }
            >
              <Row
                label="Unrealized PnL"
                value={`${isUnrealizedPositive ? '+' : ''}${fmtUsd.format(unrealizedPnl)}`}
                valueClass={isUnrealizedPositive ? 'text-emerald-400' : 'text-red-400'}
              />
              <Row
                label="All Time PnL"
                value={
                  tradesComplete ? (
                    `${isAllTimePnlPositive ? '+' : ''}${fmtUsd.format(stats.net_pnl_usd)}`
                  ) : (
                    <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-26')} aria-hidden />
                  )
                }
                valueClass={isAllTimePnlPositive ? 'text-emerald-400' : 'text-red-400'}
              />
            </Section>
          </div>

          <Section
            className="min-w-0 w-full lg:flex-1 lg:basis-0"
            title="Overview"
            loading={!tradesComplete}
            action={
              onRefresh ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                  disabled={refreshing}
                  onClick={() => void onRefresh()}
                  aria-label="Refresh account snapshot, volumes, and funding"
                >
                  <RefreshCw
                    className={cn('size-3', refreshing && 'animate-spin')}
                    aria-hidden
                  />
                </Button>
              ) : null
            }
          >
            <Row
              label="Total Volume"
              value={
                tradesComplete ? (
                  fmtUsdCompact.format(stats.total_volume_usd)
                ) : (
                  <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-30')} aria-hidden />
                )
              }
            />
            <Row
              label="Perp Volume"
              value={
                tradesComplete ? (
                  fmtUsdCompact.format(stats.perp_volume_usd)
                ) : (
                  <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-30')} aria-hidden />
                )
              }
            />
            <Row
              label="Spot Volume"
              value={
                tradesComplete ? (
                  fmtUsdCompact.format(stats.spot_volume_usd)
                ) : (
                  <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-20')} aria-hidden />
                )
              }
            />
            <Row
              label="Spot Trades"
              value={
                tradesComplete ? (
                  stats.spot_trades_count.toString()
                ) : (
                  <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-10')} aria-hidden />
                )
              }
            />
            <Row
              label="Perp Trades"
              value={
                tradesComplete ? (
                  stats.perp_trades_count.toString()
                ) : (
                  <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-12')} aria-hidden />
                )
              }
            />
            <Row
              label="Total Fees"
              value={
                tradesComplete ? (
                  fmtUsd.format(stats.total_fees_usd)
                ) : (
                  <Skeleton
                    className={cn('h-4 shrink-0 rounded-sm', 'w-21', 'bg-red-400/15')}
                    aria-hidden
                  />
                )
              }
              valueClass="text-red-400"
            />
            <Row
              label="First Trade"
              value={
                tradesComplete ? (
                  formatTimestamp(stats.first_trade_at)
                ) : (
                  <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-44')} aria-hidden />
                )
              }
            />
            <Row
              label="Last Trade"
              value={
                tradesComplete ? (
                  timeAgo(stats.last_trade_at)
                ) : (
                  <Skeleton className={cn('h-4 shrink-0 rounded-sm', 'w-26')} aria-hidden />
                )
              }
            />
          </Section>

        </div>
      </CardContent>
    </Card>
  )
}
