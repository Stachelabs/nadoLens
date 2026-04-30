'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  BarChart,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useProtocolVolumes, type MarketSlice } from '@/hooks/useProtocolVolumes'

const PURPLE = '#8b5cf6'
const CHART_H = 300

const DONUT_COLORS = [
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#84cc16',
  '#f43f5e',
]
const OTHER_COLOR = '#6b7280'

const fmtCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function fmtAxis(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '12px',
    color: 'var(--foreground)',
  },
  itemStyle: { color: 'var(--foreground)' },
  labelStyle: { color: 'var(--muted-foreground)', marginBottom: 4 },
}

function StatItem({
  label,
  loading,
  skeletonW = 'w-24',
  children,
}: {
  label: string
  loading: boolean
  skeletonW?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className={`mt-1 h-7 ${skeletonW}`} /> : children}
    </div>
  )
}

const CardDivider = () => <div className="my-4 border-t border-border/40" />

type DonutTimeframe = '24h' | '7d' | '30d' | '90d' | 'All Time'
type ChartTimeframe = 'Past 30 Days' | 'All Time'

const DONUT_OPTIONS: { value: DonutTimeframe; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'All Time', label: 'All Time' },
]

const CHART_OPTIONS: { value: ChartTimeframe; label: string }[] = [
  { value: 'Past 30 Days', label: 'Past 30 Days' },
  { value: 'All Time', label: 'All Time' },
]

function buildDonutSlices(
  raw: MarketSlice[],
  productNames: Record<string, string>,
): { name: string; value: number; color: string }[] {
  const sorted = [...raw]
    .filter((s) => s.volume > 0)
    .sort((a, b) => b.volume - a.volume)
  const top10 = sorted.slice(0, 10)
  const rest = sorted.slice(10)

  const slices = top10.map((s, i) => ({
    name: (productNames[s.productId] ?? s.productId).replace(/-(PERP|SPOT)$/i, ''),
    value: s.volume,
    color: DONUT_COLORS[i] ?? DONUT_COLORS[0]!,
  }))

  if (rest.length > 0) {
    const otherVol = rest.reduce((sum, s) => sum + s.volume, 0)
    slices.push({ name: 'Other Markets', value: otherVol, color: OTHER_COLOR })
  }

  return slices
}

export function ProtocolVolumes() {
  const {
    volume24h,
    allTimeVol,
    dailyChartData,
    weeklyChartData,
    donut24h,
    donut7d,
    donut30d,
    donut90d,
    donutAllTime,
    productNames,
    loading,
  } = useProtocolVolumes()

  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('Past 30 Days')
  const [donutTimeframe, setDonutTimeframe] = useState<DonutTimeframe>('30d')

  const chartData = chartTimeframe === 'Past 30 Days' ? dailyChartData : weeklyChartData

  const activeDonutRaw =
    donutTimeframe === '24h'
      ? donut24h
      : donutTimeframe === '7d'
        ? donut7d
        : donutTimeframe === '30d'
          ? donut30d
          : donutTimeframe === '90d'
            ? donut90d
            : donutAllTime

  const donutSlices = buildDonutSlices(activeDonutRaw, productNames)
  const donutTotal = donutSlices.reduce((s, d) => s + d.value, 0)
  const donutLabel =
    donutTimeframe === 'All Time' ? 'All Time Vol.' : `${donutTimeframe} Vol.`

  return (
    <div className="space-y-6">
      {/* Row 0 — Header stats card */}
      <Card className="border-border bg-card p-0">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
            <StatItem label="24h Volume" loading={loading} skeletonW="w-28">
              <p className="text-2xl font-bold">{fmtCompact.format(volume24h)}</p>
            </StatItem>
            <StatItem label="All Time Volume" loading={loading} skeletonW="w-32">
              <p className="text-2xl font-bold">{fmtCompact.format(allTimeVol)}</p>
            </StatItem>
          </div>
        </CardContent>
      </Card>

      {/* Row 1 — Trading Volume full-width card */}
      <Card className="border-border bg-card p-0">
        <CardContent className="p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Trading Volume</p>
              <p className="text-xs text-muted-foreground">
                The daily trading volume and the cumulative volume.
              </p>
            </div>
            <Select
              value={chartTimeframe}
              onValueChange={(v) => setChartTimeframe(v as ChartTimeframe)}
            >
              <SelectTrigger
                size="sm"
                className="w-[140px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectLabel className="px-1.5 py-1 text-[11px]">Timeframe</SelectLabel>
                  {CHART_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <Skeleton className="w-full" style={{ height: CHART_H }} />
          ) : (
            <ResponsiveContainer width="100%" height={CHART_H}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="volGradV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PURPLE} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={PURPLE} stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={55}
                  tickMargin={8}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={fmtAxis}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={fmtAxis}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => [
                    typeof value === 'number' ? fmtUsd.format(value) : String(value ?? ''),
                    name === 'volume' ? 'Daily Volume' : 'Cumulative',
                  ]}
                />
                <Bar
                  yAxisId="left"
                  dataKey="volume"
                  fill="url(#volGradV)"
                  stroke={PURPLE}
                  strokeWidth={0}
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumVol"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Row 2 — Volume by Market donut card */}
      <Card className="border-border bg-card p-0">
        <CardContent className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Volume by Market</p>
              <p className="text-xs text-muted-foreground">
                Trading volume distribution across markets.
              </p>
            </div>
            <Select
              value={donutTimeframe}
              onValueChange={(v) => setDonutTimeframe(v as DonutTimeframe)}
            >
              <SelectTrigger
                size="sm"
                className="w-[110px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectLabel className="px-1.5 py-1 text-[11px]">Period</SelectLabel>
                  {DONUT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <Skeleton className="w-full" style={{ height: CHART_H }} />
          ) : (
            <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-center">
              <div className="shrink-0">
                <PieChart width={280} height={280}>
                  <Pie
                    data={donutSlices}
                    cx={140}
                    cy={140}
                    innerRadius={70}
                    outerRadius={120}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutSlices.map((slice, i) => (
                      <Cell key={`${slice.name}-${i}`} fill={slice.color} />
                    ))}
                    <Label
                      content={(props) => {
                        const vb = props.viewBox as { cx?: number; cy?: number } | undefined
                        const cx = vb?.cx ?? 140
                        const cy = vb?.cy ?? 140
                        return (
                          <text textAnchor="middle">
                            <tspan
                              x={cx}
                              y={cy - 8}
                              fontSize={11}
                              fill="var(--muted-foreground)"
                            >
                              {donutLabel}
                            </tspan>
                            <tspan
                              x={cx}
                              y={cy + 14}
                              fontSize={17}
                              fontWeight="bold"
                              fill="var(--foreground)"
                            >
                              {fmtCompact.format(donutTotal)}
                            </tspan>
                          </text>
                        )
                      }}
                      position="center"
                    />
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value, _key, entry) => [
                      typeof value === 'number' ? fmtCompact.format(value) : String(value ?? ''),
                      (entry as { payload?: { name?: string } }).payload?.name ?? 'Volume',
                    ]}
                  />
                </PieChart>
              </div>

              <div className="flex flex-col gap-2">
                {donutSlices.map((slice) => (
                  <div key={slice.name} className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="text-xs text-foreground">{slice.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 3 — Perps & Spot 2-col grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Daily Perps & Spot Volume */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">Daily Perps & Spot Volume</p>
            <p className="mb-3 text-xs text-muted-foreground">Daily trading volume over the past 30 days.</p>
            <CardDivider />
            {loading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart
                  data={dailyChartData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={PURPLE} stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    strokeOpacity={0.3}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    tickFormatter={fmtAxis}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => [
                      typeof value === 'number' ? fmtUsd.format(value) : String(value ?? ''),
                      'Daily Volume',
                    ]}
                  />
                  <Bar
                    dataKey="volume"
                    fill="url(#dailyGrad)"
                    stroke={PURPLE}
                    strokeWidth={0}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Cumulative Perps & Spot Volume */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">Cumulative Perps & Spot Volume</p>
            <p className="mb-3 text-xs text-muted-foreground">Cumulative trading volume over the past 30 days.</p>
            <CardDivider />
            {loading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={dailyChartData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    strokeOpacity={0.3}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    tickFormatter={fmtAxis}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => [
                      typeof value === 'number' ? fmtUsd.format(value) : String(value ?? ''),
                      'Cumulative Volume',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumVol"
                    stroke={PURPLE}
                    fill="url(#cumGrad)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
