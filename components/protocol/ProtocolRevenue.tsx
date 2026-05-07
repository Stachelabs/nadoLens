'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  AreaChart,
  LineChart,
  Bar,
  Line,
  Area,
  PieChart,
  Pie,
  Cell,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { useProtocolRevenue, type ChartPoint, type MarketSlice } from '@/hooks/useProtocolRevenue'

const PURPLE = '#8b5cf6'
const AMBER = '#f59e0b'
const CHART_H = 300

const DONUT_COLORS = [
  '#8b5cf6',
  '#a78bfa',
  '#6d28d9',
  '#7c3aed',
  '#60a5fa',
  '#34d399',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#84cc16',
  '#e11d48',
  '#0ea5e9',
  '#d946ef',
]
const OTHER_COLOR = '#4a5568'

// ─── Formatting ────────────────────────────────────────────────────────────────

const fmtCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const fmtCompact2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const fmtUsdFull = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function fmtAxis(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function fmtUsers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return n.toLocaleString('en-US')
}

function fmtUsersAxis(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

function fmtDateShort(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function weekLabel(ts: number): string {
  return `${fmtDateShort(ts - 7 * 86400)} – ${fmtDateShort(ts)}`
}

// ─── Timeframe ─────────────────────────────────────────────────────────────────

type RevenueTimeframe = '24 Hours' | '7 Days' | '30 Days' | '60 Days' | '90 Days' | 'All Time'

const TIMEFRAME_OPTIONS: { value: RevenueTimeframe; label: string }[] = [
  { value: '24 Hours', label: 'Past 24 Hours' },
  { value: '7 Days', label: 'Past 7 Days' },
  { value: '30 Days', label: 'Past 30 Days' },
  { value: '60 Days', label: 'Past 60 Days' },
  { value: '90 Days', label: 'Past 90 Days' },
  { value: 'All Time', label: 'All Time' },
]

// ─── Donut helpers ─────────────────────────────────────────────────────────────

function buildDonutSlices(
  raw: MarketSlice[],
  productNames: Record<string, string>,
): { name: string; value: number; color: string }[] {
  const sorted = [...raw].filter((s) => s.volume > 0).sort((a, b) => b.volume - a.volume)
  const top = sorted.slice(0, 10)
  const rest = sorted.slice(10)
  const slices = top.map((s, i) => ({
    name: (productNames[s.productId] ?? s.productId).replace(/-(PERP|SPOT)$/i, ''),
    value: s.volume,
    color: DONUT_COLORS[i] ?? DONUT_COLORS[0]!,
  }))
  if (rest.length > 0) {
    slices.push({
      name: 'Other Markets',
      value: rest.reduce((sum, s) => sum + s.volume, 0),
      color: OTHER_COLOR,
    })
  }
  return slices
}

// ─── Stat item ─────────────────────────────────────────────────────────────────

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

// ─── Custom tooltips ───────────────────────────────────────────────────────────

function TradingFeeTooltip({
  active,
  payload,
  label,
  weekly = false,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  label?: string
  weekly?: boolean
}) {
  if (!active || !payload?.length) return null
  const { ts, fees, cumFees } = payload[0]!.payload
  return (
    <div style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--foreground)', minWidth: 220 }}>
      <p style={{ color: 'var(--muted-foreground)', marginBottom: 6 }}>{weekly ? weekLabel(ts) : label}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: PURPLE, display: 'inline-block', flexShrink: 0 }} />
          {weekly ? 'Trading Fees' : 'Daily Fees'}
        </span>
        <span style={{ fontWeight: 600 }}>{fmtCompact.format(fees)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', display: 'inline-block', flexShrink: 0 }} />
          Cumulative
        </span>
        <span style={{ fontWeight: 600 }}>{fmtCompact.format(cumFees)}</span>
      </div>
    </div>
  )
}

function NetFeeTooltip({
  active,
  payload,
  label,
  weekly = false,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  label?: string
  weekly?: boolean
}) {
  if (!active || !payload?.length) return null
  const { ts, fees, makerRebates, netFees } = payload[0]!.payload
  return (
    <div style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--foreground)', minWidth: 220 }}>
      <p style={{ color: 'var(--muted-foreground)', marginBottom: 6 }}>{weekly ? weekLabel(ts) : label}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: PURPLE, display: 'inline-block', flexShrink: 0 }} />
          {weekly ? 'Weekly Taker Fees' : 'Daily Taker Fees'}
        </span>
        <span style={{ fontWeight: 600 }}>{fmtCompact.format(fees)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: AMBER, display: 'inline-block', flexShrink: 0 }} />
          Maker Rebates
        </span>
        <span style={{ fontWeight: 600 }}>{fmtCompact.format(makerRebates)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.6)', display: 'inline-block', flexShrink: 0 }} />
          Net Fees
        </span>
        <span style={{ fontWeight: 600 }}>{fmtCompact.format(netFees)}</span>
      </div>
    </div>
  )
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { value: number; payload: { name: string; color: string } }[]
}) {
  if (!active || !payload?.length) return null
  const { name, color } = payload[0]!.payload
  const value = fmtCompact.format(payload[0]!.value)
  return (
    <div style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0, display: 'inline-block' }} />
      <span>{name} : {value}</span>
    </div>
  )
}

function UsersBarTooltip({
  active,
  payload,
  label,
  weekly = false,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  label?: string
  weekly?: boolean
}) {
  if (!active || !payload?.length) return null
  const { ts, newUsers, cumUsers } = payload[0]!.payload
  return (
    <div style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--foreground)', minWidth: 200 }}>
      <p style={{ color: 'var(--muted-foreground)', marginBottom: 6 }}>{weekly ? weekLabel(ts) : label}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: PURPLE, display: 'inline-block', flexShrink: 0 }} />
          {weekly ? 'Weekly New Users' : 'New Users'}
        </span>
        <span style={{ fontWeight: 600 }}>{newUsers.toLocaleString('en-US')}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', display: 'inline-block', flexShrink: 0 }} />
          Total Users
        </span>
        <span style={{ fontWeight: 600 }}>{cumUsers.toLocaleString('en-US')}</span>
      </div>
    </div>
  )
}

function DAUTooltip({
  active,
  payload,
  label,
  weekly = false,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  label?: string
  weekly?: boolean
}) {
  if (!active || !payload?.length) return null
  const { ts, dau } = payload[0]!.payload
  return (
    <div style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--foreground)', minWidth: 180 }}>
      <p style={{ color: 'var(--muted-foreground)', marginBottom: 6 }}>{weekly ? weekLabel(ts) : label}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span>Active Traders</span>
        <span style={{ fontWeight: 600 }}>{dau.toLocaleString('en-US')}</span>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ProtocolRevenue() {
  const {
    fees24h,
    totalFees,
    makerRebates,
    totalUsers,
    newUsers24h,
    avgFeesPerUser,
    traders24h,
    hourlyChartData,
    dailyChartData,
    weeklyChartData,
    feeDonutSlices,
    productNames,
    loading,
    backgroundLoading,
    error,
  } = useProtocolRevenue()

  const [timeframe, setTimeframe] = useState<RevenueTimeframe>('30 Days')

  const isAllTime = timeframe === 'All Time'
  const chartLoading = loading || (backgroundLoading && timeframe !== '30 Days' && timeframe !== '24 Hours' && timeframe !== '7 Days')
  const chartData = isAllTime
    ? weeklyChartData
    : timeframe === '24 Hours'
      ? hourlyChartData
      : timeframe === '7 Days'
        ? dailyChartData.slice(-7)
        : timeframe === '60 Days'
          ? dailyChartData.slice(-60)
          : timeframe === '90 Days'
            ? dailyChartData
            : dailyChartData.slice(-30)

  const donutSlices = buildDonutSlices(feeDonutSlices, productNames)
  const donutTotal = donutSlices.reduce((s, d) => s + d.value, 0)
  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-0">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <p className="text-sm text-foreground">
              Revenue data is temporarily unavailable ({error}). You can retry now.
            </p>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Timeframe selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground">Timeframe</span>
        <Select value={timeframe} onValueChange={(v) => setTimeframe(v as RevenueTimeframe)}>
          <SelectTrigger size="sm" className="w-[140px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectLabel className="px-1.5 py-1 text-[11px]">Timeframe</SelectLabel>
              {TIMEFRAME_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* ── Section A — Revenue / Fees ─────────────────────────────────── */}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Trading Fees bar+line */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3 flex flex-wrap items-end gap-x-8 gap-y-2">
              <StatItem label="24h Fees" loading={loading} skeletonW="w-28">
                <p className="text-2xl font-bold">{fmtCompact.format(fees24h)}</p>
              </StatItem>
              <StatItem label="Total Fees" loading={loading} skeletonW="w-32">
                <p className="text-2xl font-bold">{fmtCompact.format(totalFees)}</p>
              </StatItem>
            </div>
            <p className="mb-0.5 text-sm font-medium">Trading Fees</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAllTime ? 'Weekly trading fees and cumulative fees.' : timeframe === '24 Hours' ? 'Hourly trading fees and cumulative fees.' : 'Daily trading fees and cumulative fees.'}
            </p>
            {chartLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="feeBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={PURPLE} stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={55} tickMargin={8} />
                  <YAxis yAxisId="left" tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={52} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={56} domain={['auto', 'auto']} />
                  <Tooltip content={<TradingFeeTooltip weekly={isAllTime} />} />
                  <Bar yAxisId="left" dataKey="fees" fill="url(#feeBarGrad)" stroke={PURPLE} strokeWidth={0} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="cumFees" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Fees by Market donut */}
        <Card className="border-border bg-card p-0">
          <CardContent className="flex h-full flex-col p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="mb-0.5 text-sm font-medium">Fees by Market</p>
                <p className="mb-3 text-xs text-muted-foreground">All-time net taker fee distribution across markets.</p>
              </div>
              <StatItem label="Total Maker Rebates" loading={loading} skeletonW="w-28">
                <p className="text-2xl font-bold text-amber-400">{fmtCompact2.format(makerRebates)}</p>
              </StatItem>
            </div>
            {loading ? (
              <Skeleton className="mt-auto w-full" style={{ height: CHART_H }} />
            ) : (
              <div className="mt-auto flex flex-1 items-center gap-6">
                <div className="flex flex-1 justify-center">
                  <PieChart width={260} height={260}>
                    <Pie data={donutSlices} cx={130} cy={130} innerRadius={65} outerRadius={110} dataKey="value" stroke="none">
                      {donutSlices.map((slice, i) => (
                        <Cell key={`${slice.name}-${i}`} fill={slice.color} />
                      ))}
                      <Label
                        content={(props) => {
                          const vb = props.viewBox as { cx?: number; cy?: number } | undefined
                          const cx = vb?.cx ?? 130
                          const cy = vb?.cy ?? 130
                          return (
                            <text textAnchor="middle">
                              <tspan x={cx} y={cy - 8} fontSize={11} fill="var(--muted-foreground)">All-Time</tspan>
                              <tspan x={cx} y={cy + 14} fontSize={16} fontWeight="bold" fill="var(--foreground)">{fmtCompact.format(donutTotal)}</tspan>
                            </text>
                          )
                        }}
                        position="center"
                      />
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </div>
                <div className="flex shrink-0 flex-col justify-center gap-2 self-stretch">
                  {donutSlices.map((slice) => (
                    <div key={slice.name} className="flex items-center gap-2">
                      <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                      <span className="text-xs text-foreground">{slice.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Net Trading Fees area chart */}
      <Card className="border-border bg-card p-0">
        <CardContent className="p-5">
          <p className="mb-0.5 text-sm font-medium">Net Trading Fees</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Taker fees (positive), maker rebates (negative), and net fees over time.
          </p>
          {chartLoading ? (
            <Skeleton className="w-full" style={{ height: CHART_H }} />
          ) : (
            <ResponsiveContainer width="100%" height={CHART_H}>
              <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="netFeeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PURPLE} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={55} tickMargin={8} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={52} domain={['auto', 'auto']} />
                <ReferenceLine y={0} stroke="var(--border)" strokeOpacity={0.5} />
                <Tooltip content={<NetFeeTooltip weekly={isAllTime} />} />
                <Area type="monotone" dataKey="fees" stroke={PURPLE} fill="url(#netFeeGrad)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="makerRebates" stroke={AMBER} fill="rgba(245,158,11,0.15)" strokeWidth={1} dot={false} />
                <Area type="monotone" dataKey="netFees" stroke="rgba(255,255,255,0.35)" fill="rgba(255,255,255,0.05)" strokeWidth={1} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Section B — Users ──────────────────────────────────────────── */}

      {/* Row 4 — User KPIs */}
      <Card className="border-border bg-card p-0">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
            <StatItem label="Total Users" loading={loading} skeletonW="w-24">
              <p className="text-2xl font-bold">{fmtUsers(totalUsers)}</p>
            </StatItem>
            <StatItem label="24h New Users" loading={loading} skeletonW="w-20">
              <p className="text-2xl font-bold">{fmtUsers(newUsers24h)}</p>
            </StatItem>
            <StatItem label="Avg Fees per User" loading={loading} skeletonW="w-24">
              <p className="text-2xl font-bold">{fmtUsdFull.format(avgFeesPerUser)}</p>
            </StatItem>
            <div className="ml-auto">
              <StatItem label="24h Active Traders" loading={loading} skeletonW="w-20">
                <p className="text-2xl font-bold">{fmtUsers(traders24h)}</p>
              </StatItem>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row 5 — Users charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Weekly New & Total Users bar+line */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">
              {isAllTime ? 'Weekly New & Total Users' : 'Daily New & Total Users'}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAllTime ? 'Weekly new users and cumulative total.' : timeframe === '24 Hours' ? 'Hourly new users and cumulative total.' : 'Daily new users and cumulative total.'}
            </p>
            {chartLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="userBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={PURPLE} stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={55} tickMargin={8} />
                  <YAxis yAxisId="left" tickFormatter={fmtUsersAxis} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={44} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={fmtUsersAxis} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={52} domain={['auto', 'auto']} />
                  <Tooltip content={<UsersBarTooltip weekly={isAllTime} />} />
                  <Bar yAxisId="left" dataKey="newUsers" fill="url(#userBarGrad)" stroke={PURPLE} strokeWidth={0} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="cumUsers" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Daily Active Users line chart */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">Daily Active Users</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAllTime ? 'Active traders per week.' : 'Active traders per day.'}
            </p>
            {chartLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={55} tickMargin={8} />
                  <YAxis tickFormatter={fmtUsersAxis} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<DAUTooltip weekly={isAllTime} />} />
                  <Line type="linear" dataKey="dau" stroke={PURPLE} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
