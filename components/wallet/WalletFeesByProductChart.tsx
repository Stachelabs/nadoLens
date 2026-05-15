'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TradeMatch } from '@/types/nado'
import { filterTradesByPeriod, getPeriodBoundsUtc, type EquityPeriod } from '@/lib/wallet/equityPeriod'
import { nanoStringToUnixSec } from '@/lib/wallet/nanoTime'
import { buildFeesByProduct } from '@/lib/wallet/buildFeesByProduct'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingShimmer } from '@/components/ui/LoadingShimmer'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PERIOD_OPTIONS: { value: EquityPeriod; label: string }[] = [
  { value: '24 Hours', label: 'Last 24h' },
  { value: '7 Days', label: 'Last 7 days' },
  { value: '30 Days', label: 'Last 30 days' },
  { value: 'All time', label: 'All time' },
]

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function fmtAxis(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

interface Props {
  trades: TradeMatch[]
  globalMatchesComplete?: boolean
}

export function WalletFeesByProductChart({ trades, globalMatchesComplete }: Props) {
  const [period, setPeriod] = useState<EquityPeriod>('7 Days')

  const perpTrades = useMemo(() => trades.filter((t) => t.is_perp), [trades])

  // Trades load newest→oldest. Once we have a trade older than the period start,
  // all trades inside the window are present. For 'All time', wait for globalMatchesComplete.
  const periodTradesComplete = useMemo(() => {
    if (globalMatchesComplete) return true
    if (period === 'All time') return false
    const bounds = getPeriodBoundsUtc(period)
    if (!bounds) return false
    return perpTrades.some(t => {
      const sec = nanoStringToUnixSec(t.timestamp)
      return sec !== null && sec < bounds.startSec
    })
  }, [perpTrades, period, globalMatchesComplete])

  const data = useMemo(() => {
    const filtered = filterTradesByPeriod(perpTrades, period)
    return buildFeesByProduct(filtered)
  }, [perpTrades, period])

  const totalFees = useMemo(() => data.reduce((s, d) => s + d.fees_usd, 0), [data])
  const feesLoading = !periodTradesComplete

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
          Perp Fees by Product
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as EquityPeriod)}>
          <SelectTrigger
            size="sm"
            className="w-full min-w-[140px] sm:w-[160px] dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              <SelectLabel className="px-1.5 py-1 text-[11px]">Period</SelectLabel>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {feesLoading ? (
        <LoadingShimmer text="Loading fees..." />
      ) : data.length === 0 ? (
        <div className="flex h-80 items-center justify-center text-xs text-foreground">
          No trade data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={480}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="symbol"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={56}
            />
            <YAxis
              tickFormatter={fmtAxis}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--foreground)',
              }}
              itemStyle={{ color: 'var(--foreground)' }}
              formatter={(value, name) => [
                typeof value === 'number' ? fmtUsd.format(value) : String(value),
                name === 'fees_usd' ? 'Fees' : 'Cumulative',
              ]}
              labelStyle={{ color: 'var(--muted-foreground)', marginBottom: 4 }}
            />
            <Bar dataKey="fees_usd" fill="var(--bear)" radius={[3, 3, 0, 0]} barSize={32} />
            <Line
              dataKey="cumulative_fees_usd"
              stroke="var(--warn)"
              strokeWidth={2}
              dot={false}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs">
        <span className="text-foreground">Total Perp Fees</span>
        {feesLoading ? (
          <Skeleton className="h-3.5 w-20 rounded-sm" />
        ) : (
          <span className="tabular-nums text-destructive">
            -{fmtUsd.format(totalFees)}
          </span>
        )}
      </div>
      </CardContent>
    </Card>
  )
}
