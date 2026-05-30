'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  filterFundingPaymentsByPeriod,
  isFundingLoaded,
  type EquityPeriod,
} from '@/lib/wallet/equityPeriod'
import { useWalletFundingStore } from '@/store/walletFundingStore'
import { buildFundingByProduct } from '@/lib/wallet/buildFundingByProduct'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingShimmer } from '@/components/ui/LoadingShimmer'
import { Skeleton } from '@/components/ui/skeleton'

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
  signDisplay: 'exceptZero',
})

function fmtAxis(v: number): string {
  const abs = Math.abs(v)
  const formatted = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : abs.toFixed(0)
  return v < 0 ? `-$${formatted}` : `$${formatted}`
}

export function WalletFundingByProductChart() {
  const activeAddress = useWalletFundingStore((s) => s.activeAddress);
  const fundingPayments = useWalletFundingStore((s) => s.forActive()?.fundingPayments ?? []);
  const fundingLoadedSince = useWalletFundingStore((s) => s.forActive()?.fundingLoadedSince ?? Infinity);
  const loadFundingForPeriod = useWalletFundingStore((s) => s.loadFundingForPeriod);
  const [period, setPeriod] = useState<EquityPeriod>('7 Days')

  function handlePeriodChange(newPeriod: EquityPeriod) {
    setPeriod(newPeriod)
    if (activeAddress && !isFundingLoaded(newPeriod, fundingLoadedSince)) {
      void loadFundingForPeriod?.(activeAddress, newPeriod)
    }
  }

  const data = useMemo(() => {
    const filtered = filterFundingPaymentsByPeriod(fundingPayments, period)
    return buildFundingByProduct(filtered)
  }, [fundingPayments, period])

  const totalFunding = useMemo(() => data.reduce((s, d) => s + d.funding_usd, 0), [data])
  const isFundingPositive = totalFunding >= 0
  const periodLoaded = isFundingLoaded(period, fundingLoadedSince)

  // Retry load when a previous period completes but current period is still pending
  useEffect(() => {
    if (activeAddress && !isFundingLoaded(period, fundingLoadedSince)) {
      void loadFundingForPeriod?.(activeAddress, period)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, fundingLoadedSince, activeAddress])

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
          Funding by Product
        </div>
        <Select value={period} onValueChange={(v) => handlePeriodChange(v as EquityPeriod)}>
            <SelectTrigger
              size="sm"
              aria-label="Select period"
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

      {!periodLoaded ? (
        <LoadingShimmer text="Loading funding..." />
      ) : data.length === 0 ? (
        <div className="flex h-80 items-center justify-center text-xs text-foreground">
          No funding data for this period
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
                name === 'funding_usd' ? 'Funding' : 'Cumulative',
              ]}
              labelStyle={{ color: 'var(--muted-foreground)', marginBottom: 4 }}
            />
            <Bar dataKey="funding_usd" radius={[3, 3, 0, 0]} barSize={32}>
              {data.map((entry) => (
                <Cell
                  key={entry.product_id}
                  fill={entry.funding_usd >= 0 ? 'var(--bull)' : 'var(--bear)'}
                />
              ))}
            </Bar>
            <Line
              dataKey="cumulative_funding_usd"
              stroke="var(--warn)"
              strokeWidth={2}
              dot={false}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs">
        <span className="text-foreground">Total Funding</span>
        {!periodLoaded ? (
          <Skeleton className="h-3.5 w-20 rounded-sm" />
        ) : (
          <span className={`tabular-nums ${isFundingPositive ? 'text-primary' : 'text-destructive'}`}>
            {fmtUsd.format(totalFunding)}
          </span>
        )}
      </div>
      </CardContent>
    </Card>
  )
}
