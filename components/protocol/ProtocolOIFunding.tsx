"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOIData, type Timeframe } from "@/hooks/useOIData";
import { perpIconSrcFromPair } from "@/lib/wallet/perpPairIcon";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PURPLE = "#8b5cf6";
const CHART_H = 300;

const DONUT_COLORS = [
  "#8b5cf6",
  "#a78bfa",
  "#6d28d9",
  "#7c3aed",
  "#60a5fa",
  "#34d399",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#e11d48",
  "#0ea5e9",
  "#d946ef",
];

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
};

// ─── Token icon with fallback ─────────────────────────────────────────────────

function TokenIcon({ symbol, size = 16 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const iconSrc = perpIconSrcFromPair(symbol);
  if (failed || !iconSrc) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: PURPLE,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <img
      src={iconSrc}
      alt={symbol.replace("-PERP", "")}
      width={size}
      height={size}
      style={{ borderRadius: "50%", flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}

// ─── Formatting utilities ─────────────────────────────────────────────────────

function formatUSD(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n.toFixed(2)}`;
}

function formatUSDFull(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${Math.abs(n).toFixed(4)}%`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateShort(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtAxisUSD(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtAxisPct(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v;
  return `${n}%`;
}

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function OITooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { timestamp: number; totalOI: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { timestamp, totalOI } = payload[0]!.payload;
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
  );
}

function OIWeeklyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { timestamp: number; totalOI: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { timestamp, totalOI } = payload[0]!.payload;
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
        {formatDateShort(timestamp - 7 * 86400)} – {formatDateShort(timestamp)}
      </p>
      <p style={{ fontWeight: 600 }}>{formatUSD(totalOI)}</p>
    </div>
  );
}

function FundingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { timestamp: number; rate: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { timestamp, rate } = payload[0]!.payload;
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
  );
}

function OIDonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { color: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!;
  return (
    <div
      style={{
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--foreground)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        minWidth: 140,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: item.payload.color,
            flexShrink: 0,
          }}
        />
        <span>{item.name}</span>
      </div>
      <span style={{ fontWeight: 600 }}>{formatUSD(item.value)}</span>
    </div>
  );
}

function FundingWeeklyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { timestamp: number; rate: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { timestamp, rate } = payload[0]!.payload;
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
        {formatDateShort(timestamp - 7 * 86400)} – {formatDateShort(timestamp)}
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
  );
}

function LiqTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: {
    payload: { timestamp: number; daily: number; cumulative: number };
  }[];
}) {
  if (!active || !payload?.length) return null;
  const { timestamp, daily, cumulative } = payload[0]!.payload;
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
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <span>Daily</span>
        <span style={{ fontWeight: 600 }}>{formatUSD(daily)}</span>
      </div>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <span>Cumulative</span>
        <span style={{ fontWeight: 600 }}>{formatUSD(cumulative)}</span>
      </div>
    </div>
  );
}

function LiqWeeklyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: {
    payload: { timestamp: number; daily: number; cumulative: number };
  }[];
}) {
  if (!active || !payload?.length) return null;
  const { timestamp, daily, cumulative } = payload[0]!.payload;
  const weekStart = formatDateShort(timestamp - 7 * 86400);
  const weekEnd = formatDateShort(timestamp);
  return (
    <div
      style={{
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--foreground)",
        minWidth: 200,
      }}
    >
      <p style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>
        {weekStart} – {weekEnd}
      </p>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <span>Liquidations</span>
        <span style={{ fontWeight: 600 }}>{formatUSD(daily)}</span>
      </div>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <span>Cumulative</span>
        <span style={{ fontWeight: 600 }}>{formatUSD(cumulative)}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProtocolOIFunding() {
  const [timeframe, setTimeframe] = useState<Timeframe>("30 Days");

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
  } = useOIData(timeframe);

  // Top 16 funding rates (8 per column) — sorted by |rate| for the table
  const topFunding = fundingRates.slice(0, 16);
  const fundingCol1 = topFunding.slice(0, 8);
  const fundingCol2 = topFunding.slice(8, 16);

  // Selector list — sorted by productId ascending (BTC first, natural DEX order)
  const fundingByProductId = [...fundingRates].sort(
    (a, b) => a.productId - b.productId,
  );

  // All Time uses granularity=604800 so the API already returns weekly snapshots — display directly
  const isAllTime = timeframe === "All Time";
  const chartLiqHistory = liqHistory;

  // OI by market donut — colour each slice
  const oiDonutSlices = oiByMarket.map((item, i) => ({
    ...item,
    color: DONUT_COLORS[i % DONUT_COLORS.length]!,
  }));

  return (
    <div className="space-y-6">
      {/* Global timeframe selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Timeframe</span>
        <Select
          value={timeframe}
          onValueChange={(v) => setTimeframe(v as Timeframe)}
        >
          <SelectTrigger
            size="sm"
            className="w-[140px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24 Hours">Past 24 Hours</SelectItem>
            <SelectItem value="7 Days">Past 7 Days</SelectItem>
            <SelectItem value="30 Days">Past 30 Days</SelectItem>
            <SelectItem value="60 Days">Past 60 Days</SelectItem>
            <SelectItem value="90 Days">Past 90 Days</SelectItem>
            <SelectItem value="All Time">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── SECTION A — Open Interest ── */}

      {/* OI charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left — OI area chart */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-4">
              <p className="text-xs text-muted-foreground">Open Interest</p>
              {oiLoading ? (
                <Skeleton className="mt-1 h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold">{formatUSD(totalOI)}</p>
              )}
            </div>
            <div className="mb-3">
              <p className="text-sm font-medium">Open Interest</p>
              <p className="text-xs text-muted-foreground">
                The open interest over time.
              </p>
            </div>
            {oiLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : error && oiHistory.length === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={oiHistory}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="oiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.4} />
                      <stop
                        offset="95%"
                        stopColor={PURPLE}
                        stopOpacity={0.05}
                      />
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
                  <Tooltip
                    content={isAllTime ? <OIWeeklyTooltip /> : <OITooltip />}
                  />
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
            <div className="mb-4 flex gap-8">
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
            <div className="mb-3">
              <p className="text-sm font-medium">Open Interest by Market</p>
              <p className="text-xs text-muted-foreground">
                Breakdown of open interest across individual perp markets.
              </p>
            </div>
            {oiLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-1 flex justify-center">
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
                    <Tooltip content={<OIDonutTooltip />} />
                  </PieChart>
                </div>
                <div className="flex flex-col gap-1.5 overflow-hidden w-20">
                  {oiDonutSlices.map((slice) => (
                    <div
                      key={slice.name}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="text-xs text-foreground truncate">
                        {slice.name}
                      </span>
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
        <Card className="border-border bg-card p-0 flex flex-col">
          <CardContent className="p-5 flex flex-col flex-1">
            <div className="mb-3">
              <p className="text-sm font-medium">Top Predicted Rates</p>
              <p className="text-xs text-muted-foreground">
                The top predicted annualized funding rates.
              </p>
            </div>
            {fundingLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <div className="flex-1 flex items-center">
                <div className="grid grid-cols-2 gap-x-6 w-full">
                  <div className="space-y-2">
                    {fundingCol1.map((item) => (
                      <div
                        key={item.symbol}
                        className="flex justify-between text-[13px]"
                      >
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
                  <div className="space-y-2">
                    {fundingCol2.map((item) => (
                      <div
                        key={item.symbol}
                        className="flex justify-between text-[13px]"
                      >
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
            <div className="mb-3">
              <Select
                value={selectedFundingSymbol}
                onValueChange={(v) => {
                  if (v !== null) setSelectedFundingSymbol(v);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-[160px] dark:border-border/40 px-2 text-[13px] font-medium gap-2"
                >
                  <SelectValue placeholder="Select market">
                    {selectedFundingSymbol && (
                      <span className="flex items-center gap-2">
                        <TokenIcon symbol={selectedFundingSymbol} size={16} />
                        <span>
                          {selectedFundingSymbol.replace("-PERP", "")}
                        </span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  className="max-h-[320px]"
                  alignItemWithTrigger={false}
                >
                  {fundingByProductId.map((item) => (
                    <SelectItem key={item.symbol} value={item.symbol}>
                      <span className="flex items-center gap-2">
                        <TokenIcon symbol={item.symbol} size={15} />
                        <span>{item.symbol.replace("-PERP", "")}</span>
                      </span>
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
                  <Tooltip
                    content={
                      isAllTime ? <FundingWeeklyTooltip /> : <FundingTooltip />
                    }
                  />
                  <ReferenceLine
                    y={0}
                    stroke="var(--border)"
                    strokeDasharray="4 4"
                  />
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
                <p className="text-2xl font-bold">
                  {liq24h != null ? formatUSD(liq24h) : "—"}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Total Liquidations
              </p>
              {liqLoading ? (
                <Skeleton className="mt-1 h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold">
                  {liqTotal != null ? formatUSD(liqTotal) : "—"}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liquidations bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        {/* Left — Liquidations dual-axis chart */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-sm font-medium">Liquidations</p>
              <p className="text-xs text-muted-foreground">
                {isAllTime
                  ? "The weekly liquidations."
                  : "The daily liquidations."}
              </p>
            </div>
            {liqLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : chartLiqHistory.length === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/50">
                <p className="text-sm text-muted-foreground">
                  Liquidation history unavailable for this timeframe
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <ComposedChart
                  data={chartLiqHistory}
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
                  <Tooltip
                    content={isAllTime ? <LiqWeeklyTooltip /> : <LiqTooltip />}
                  />
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
        <Card className="border-border bg-card p-0 flex flex-col">
          <CardContent className="p-5 flex flex-col flex-1">
            <div className="mb-3">
              <p className="text-sm font-medium">Insurance Funds</p>
              <p className="text-xs text-muted-foreground">
                Breakdown of the insurance funds.
              </p>
            </div>
            {insuranceFundTotal != null ? (
              <div className="flex-1 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[{ name: "Insurance", value: insuranceFundTotal }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill={PURPLE} />
                      <Label
                        content={({ viewBox }) => {
                          if (
                            !viewBox ||
                            !("cx" in viewBox) ||
                            !("cy" in viewBox)
                          )
                            return null;
                          return (
                            <text textAnchor="middle">
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) - 8}
                                className="fill-muted-foreground text-xs"
                              >
                                Total
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) + 14}
                                className="fill-foreground text-base font-bold"
                              >
                                {formatUSDFull(insuranceFundTotal)}
                              </tspan>
                            </text>
                          );
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Insurance fund data unavailable
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ProtocolOIFunding;
