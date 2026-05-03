"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ComposedChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { useOIData } from "@/hooks/useOIData"

// ─── Constants ─────────────────────────────────────────────────────────────────

const PURPLE = "#8b5cf6"
const CHART_H = 300

const DONUT_COLORS = [
  "#8b5cf6", "#a78bfa", "#6d28d9", "#7c3aed",
  "#60a5fa", "#34d399", "#f59e0b", "#ec4899",
  "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#e11d48", "#0ea5e9", "#d946ef",
]

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--foreground)",
  },
  itemStyle: { color: "var(--foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
}

const MOCK_LIQ_DATA = [
  { timestamp: 1743638400, daily: 75_000,    cumulative: 102_000_000 },
  { timestamp: 1743724800, daily: 450_000,   cumulative: 102_450_000 },
  { timestamp: 1743811200, daily: 1_200_000, cumulative: 103_650_000 },
  { timestamp: 1743897600, daily: 320_000,   cumulative: 103_970_000 },
  { timestamp: 1743984000, daily: 88_000,    cumulative: 104_058_000 },
  { timestamp: 1744070400, daily: 640_000,   cumulative: 104_698_000 },
  { timestamp: 1744156800, daily: 1_750_000, cumulative: 106_448_000 },
  { timestamp: 1744243200, daily: 920_000,   cumulative: 107_368_000 },
  { timestamp: 1744329600, daily: 210_000,   cumulative: 107_578_000 },
  { timestamp: 1744416000, daily: 560_000,   cumulative: 108_138_000 },
  { timestamp: 1744502400, daily: 130_000,   cumulative: 108_268_000 },
  { timestamp: 1744588800, daily: 980_000,   cumulative: 109_248_000 },
  { timestamp: 1744675200, daily: 50_000,    cumulative: 109_298_000 },
  { timestamp: 1744761600, daily: 1_100_000, cumulative: 110_398_000 },
  { timestamp: 1744848000, daily: 430_000,   cumulative: 110_828_000 },
  { timestamp: 1744934400, daily: 770_000,   cumulative: 111_598_000 },
  { timestamp: 1745020800, daily: 1_450_000, cumulative: 113_048_000 },
  { timestamp: 1745107200, daily: 680_000,   cumulative: 113_728_000 },
  { timestamp: 1745193600, daily: 1_970_000, cumulative: 115_698_000 },  // note: allow up to ~2M daily
  { timestamp: 1745884800, daily: 300_000,   cumulative: 117_000_000 },
]

type Timeframe = "24h" | "7d" | "30d" | "90d"

// ─── Formatting utilities ─────────────────────────────────────────────────────

function formatUSD(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n.toFixed(2)}`
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "-"
  return `${sign}${Math.abs(n).toFixed(4)}%`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function fmtAxisUSD(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n.toFixed(0)}`
}

function fmtAxisPct(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v
  return `${n}%`
}

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function OITooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: { timestamp: number; totalOI: number } }[]
}) {
  if (!active || !payload?.length) return null
  const { timestamp, totalOI } = payload[0]!.payload
  return (
    <div
      style={{
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--foreground)",
      }}
    >
      <p style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>
        {formatDate(timestamp)}
      </p>
      <p style={{ fontWeight: 600 }}>{formatUSD(totalOI)}</p>
    </div>
  )
}

function FundingTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: { timestamp: number; rate: number } }[]
}) {
  if (!active || !payload?.length) return null
  const { timestamp, rate } = payload[0]!.payload
  return (
    <div
      style={{
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--foreground)",
      }}
    >
      <p style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>
        {formatDate(timestamp)}
      </p>
      <p
        style={{
          fontWeight: 600,
          color: rate >= 0 ? "var(--bull)" : "var(--bear)",
        }}
      >
        {formatPct(rate)}
      </p>
    </div>
  )
}

function LiqTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: { timestamp: number; daily: number; cumulative: number } }[]
}) {
  if (!active || !payload?.length) return null
  const { timestamp, daily, cumulative } = payload[0]!.payload
  return (
    <div
      style={{
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--foreground)",
        minWidth: 180,
      }}
    >
      <p style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>
        {formatDate(timestamp)}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span>Daily</span>
        <span style={{ fontWeight: 600 }}>{formatUSD(daily)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span>Cumulative</span>
        <span style={{ fontWeight: 600 }}>{formatUSD(cumulative)}</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProtocolOIFunding() {
  const [timeframe, setTimeframe] = useState<Timeframe>("30d")

  const {
    oiHistory,
    oiByMarket,
    totalOI,
    btcOI,
    ethOI,
    fundingRates,
    fundingHistory,
    selectedFundingSymbol,
    setSelectedFundingSymbol,
    liqHistory,
    liq24h,
    liqTotal,
    insuranceFundTotal,
    oiLoading,
    fundingLoading,
    liqLoading,
    error,
  } = useOIData(timeframe)

  const chartLiqData = liqHistory.length > 0 ? liqHistory : MOCK_LIQ_DATA

  // Top 16 funding rates (8 per column)
  const topFunding = fundingRates.slice(0, 16)
  const fundingCol1 = topFunding.slice(0, 8)
  const fundingCol2 = topFunding.slice(8, 16)

  // OI by market donut — colour each slice
  const oiDonutSlices = oiByMarket.map((item, i) => ({
    ...item,
    color: DONUT_COLORS[i % DONUT_COLORS.length]!,
  }))

  return (
    <div className="space-y-6">
      {/* Error banner (non-blocking) */}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {/* Global timeframe selector */}
      <div className="flex items-center justify-end">
        <span className="text-xs text-muted-foreground mr-2">Chart timeframe:</span>
        <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
          <SelectTrigger size="sm" className="w-[120px] dark:border-border/40 px-2 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Past 24 Hours</SelectItem>
            <SelectItem value="7d">Past 7 Days</SelectItem>
            <SelectItem value="30d">Past 30 Days</SelectItem>
            <SelectItem value="90d">Past 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── SECTION A — Open Interest ── */}

      {/* OI Stats row */}
      <Card className="border-border bg-card p-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Open Interest</p>
              {oiLoading ? (
                <Skeleton className="mt-1 h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold">{formatUSD(totalOI)}</p>
              )}
            </div>
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-muted-foreground">BTC OI</p>
                {oiLoading ? (
                  <Skeleton className="mt-1 h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatUSD(btcOI)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ETH OI</p>
                {oiLoading ? (
                  <Skeleton className="mt-1 h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatUSD(ethOI)}</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OI charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left — OI area chart */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-sm font-medium">Open Interest</p>
              <p className="text-xs text-muted-foreground">The open interest over time.</p>
            </div>
            {oiLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={oiHistory}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="oiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={PURPLE} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    strokeOpacity={0.3}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    tickFormatter={fmtAxisUSD}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={65}
                  />
                  <Tooltip content={<OITooltip />} />
                  <Area
                    type="monotone"
                    dataKey="totalOI"
                    stroke={PURPLE}
                    strokeWidth={2}
                    fill="url(#oiGradient)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Right — OI by Market donut */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-sm font-medium">Open Interest by Market</p>
              <p className="text-xs text-muted-foreground">
                Breakdown of open interest across individual perp markets.
              </p>
            </div>
            {oiLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <div className="flex items-center gap-6">
                <div className="shrink-0">
                  <PieChart width={240} height={240}>
                    <Pie
                      data={oiDonutSlices}
                      cx={120}
                      cy={120}
                      innerRadius={70}
                      outerRadius={100}
                      dataKey="value"
                      stroke="none"
                    >
                      {oiDonutSlices.map((slice, i) => (
                        <Cell key={`oi-${i}`} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value) => [
                        typeof value === "number" ? formatUSD(value) : String(value),
                        "OI",
                      ]}
                    />
                  </PieChart>
                </div>
                <div className="flex flex-col gap-1.5 overflow-hidden">
                  {oiDonutSlices.map((slice) => (
                    <div key={slice.name} className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="text-xs text-foreground truncate">{slice.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── SECTION B — Funding ── */}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left — Top Predicted Rates */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-sm font-medium">Top Predicted Rates</p>
              <p className="text-xs text-muted-foreground">
                The top predicted annualized funding rates.
              </p>
            </div>
            {fundingLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <div className="grid grid-cols-2 gap-x-6">
                <div className="space-y-1.5">
                  {fundingCol1.map((item) => (
                    <div key={item.symbol} className="flex justify-between text-xs">
                      <span className="text-foreground font-medium">
                        {item.symbol.replace("-PERP", "")}
                      </span>
                      <span
                        className={
                          item.annualizedRate >= 0
                            ? "text-[var(--bull)] font-mono"
                            : "text-[var(--bear)] font-mono"
                        }
                      >
                        {formatPct(item.annualizedRate)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {fundingCol2.map((item) => (
                    <div key={item.symbol} className="flex justify-between text-xs">
                      <span className="text-foreground font-medium">
                        {item.symbol.replace("-PERP", "")}
                      </span>
                      <span
                        className={
                          item.annualizedRate >= 0
                            ? "text-[var(--bull)] font-mono"
                            : "text-[var(--bear)] font-mono"
                        }
                      >
                        {formatPct(item.annualizedRate)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — Historical Funding Rates */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-sm font-medium">Historical Funding Rates</p>
              <p className="text-xs text-muted-foreground">
                The historical annualized funding rates for the selected market.
              </p>
            </div>
            {/* Asset selector */}
            <div className="mb-3 flex items-center gap-2">
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: PURPLE }}
              />
              <Select
                value={selectedFundingSymbol}
                onValueChange={(v) => { if (v !== null) setSelectedFundingSymbol(v) }}
              >
                <SelectTrigger size="sm" className="w-[140px] dark:border-border/40 px-2 text-[11px]">
                  <SelectValue placeholder="Select market" />
                </SelectTrigger>
                <SelectContent>
                  {fundingRates.map((item) => (
                    <SelectItem key={item.symbol} value={item.symbol}>
                      {item.symbol.replace("-PERP", "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fundingLoading ? (
              <Skeleton className="h-[260px] w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={fundingHistory[selectedFundingSymbol] ?? []}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    strokeOpacity={0.3}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    tickFormatter={fmtAxisPct}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip content={<FundingTooltip />} />
                  <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke={PURPLE}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── SECTION C — Liquidations ── */}

      {/* Liquidations stats row */}
      <Card className="border-border bg-card p-0">
        <CardContent className="p-5">
          <div className="flex items-start gap-12">
            <div>
              <p className="text-xs text-muted-foreground">24h Liquidations</p>
              {liqLoading ? (
                <Skeleton className="mt-1 h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold">{formatUSD(liq24h)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Liquidations</p>
              {liqLoading ? (
                <Skeleton className="mt-1 h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold">{formatUSD(liqTotal)}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liquidations bottom row */}
      <div className="flex gap-4">
        {/* Left — Liquidations dual-axis chart */}
        <Card className="border-border bg-card p-0 flex-1">
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-sm font-medium">Liquidations</p>
              <p className="text-xs text-muted-foreground">The daily liquidations.</p>
            </div>
            {liqLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <ComposedChart
                  data={chartLiqData}
                  margin={{ top: 4, right: 56, left: 0, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    strokeOpacity={0.3}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={fmtAxisUSD}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={fmtAxisUSD}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip content={<LiqTooltip />} />
                  <Bar
                    yAxisId="left"
                    dataKey="daily"
                    fill={PURPLE}
                    fillOpacity={0.85}
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    stroke="rgb(200,200,200)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Right — Insurance Funds donut */}
        <Card className="border-border bg-card p-0" style={{ width: 280, flexShrink: 0 }}>
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-sm font-medium">Insurance Funds</p>
              <p className="text-xs text-muted-foreground">
                Breakdown of the insurance funds.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <PieChart width={220} height={220}>
                <Pie
                  data={[{ name: "Insurance", value: insuranceFundTotal }]}
                  cx={110}
                  cy={110}
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill={PURPLE} />
                </Pie>
                <text
                  x="50%"
                  y="45%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                >
                  Total
                </text>
                <text
                  x="50%"
                  y="58%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: 15, fontWeight: 700, fill: "var(--foreground)" }}
                >
                  {formatUSD(insuranceFundTotal)}
                </text>
              </PieChart>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


export default ProtocolOIFunding
