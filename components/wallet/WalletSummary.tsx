'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { fromX18 } from '@/types/nado'
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
  if (!nanoTs) return '—'
  const ms = parseInt(nanoTs) / 1_000_000
  const d = new Date(ms)
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
  if (!nanoTs) return '—'
  const ms = parseInt(nanoTs) / 1_000_000
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
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {label}
      </span>
      <span className={cn('text-sm font-bold tabular-nums font-mono text-right', valueClass ?? 'text-foreground')}>
        {value}
      </span>
    </div>
  )
}

function Section({ title, loading, children }: { title: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-2">
        {title}
        {loading && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
        )}
      </div>
      {children}
    </div>
  )
}

export function WalletSummary({ stats, tradesComplete = true }: Props) {
  const unrealizedPnl = stats.positions.reduce((s, p) => s + p.unrealized_pnl, 0)
  const isUnrealizedPositive = unrealizedPnl >= 0
  const isAllTimePnlPositive = stats.net_pnl_usd >= 0

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

          <Section title="Trader Equity">
            <Row label="Equity" value={fmtUsd.format(stats.total_equity_usd)} />
            <Row label="Maintenance" value={fmtUsd.format(stats.maintenance_margin)} />
          </Section>

          <Section title="Overview" loading={!tradesComplete}>
            <Row label="Total Volume" value={fmtUsdCompact.format(stats.total_volume_usd)} />
            <Row label="Spot Trades" value={stats.spot_trades_count.toString()} />
            <Row label="Perp Trades" value={stats.perp_trades_count.toString()} />
            <Row
              label="Total Fees"
              value={fmtUsd.format(stats.total_fees_usd)}
              valueClass="text-red-400"
            />
            <Row label="First Trade" value={formatTimestamp(stats.first_trade_at)} />
            <Row label="Last Trade" value={timeAgo(stats.last_trade_at)} />
          </Section>

          <Section title="Positions">
            <Row
              label="Unrealized PnL"
              value={`${isUnrealizedPositive ? '+' : ''}${fmtUsd.format(unrealizedPnl)}`}
              valueClass={isUnrealizedPositive ? 'text-emerald-400' : 'text-red-400'}
            />
            <Row
              label="All Time PnL"
              value={`${isAllTimePnlPositive ? '+' : ''}${fmtUsd.format(stats.net_pnl_usd)}`}
              valueClass={isAllTimePnlPositive ? 'text-emerald-400' : 'text-red-400'}
            />
          </Section>

        </div>
      </CardContent>
    </Card>
  )
}
