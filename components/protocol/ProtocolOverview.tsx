"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProtocolMarketSnapshots } from "@/hooks/useProtocolMarketSnapshots";
import type { MarketSnapshot } from "@/lib/schemas/nado";
import {
  useProtocolStore,
  type OverviewTimeframe,
} from "@/store/protocolStore";
import { fromX18BigInt } from "@/types/nado";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TIMEFRAME_OPTIONS: { value: OverviewTimeframe; label: string }[] = [
  { value: "7 Days", label: "Past 7 Days" },
  { value: "30 Days", label: "Past 30 Days" },
  { value: "60 Days", label: "Past 60 Days" },
  { value: "90 Days", label: "Past 90 Days" },
  { value: "All Time", label: "All Time" },
];

const TIMEFRAME_SLICE: Record<OverviewTimeframe, number | null> = {
  "7 Days": 7,
  "30 Days": 30,
  "60 Days": 60,
  "90 Days": 90,
  "All Time": null,
};

const PURPLE = "#8b5cf6";
const CHART_H = 300;

const fmtCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const fmtUsers = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ts * 1000));
}

function fmtAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function sumRecord(rec: Record<string, string>): number {
  return Object.values(rec).reduce((s, v) => s + fromX18BigInt(v), 0);
}

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

interface ChartPoint {
  date: string;
  volume: number;
  cumVol: number;
  oi: number;
  tvl: number;
  dau: number;
}

function buildChartData(snapshots: MarketSnapshot[]): ChartPoint[] {
  const reversed = [...snapshots].reverse();
  return reversed.map((snap, i) => {
    const cumVol = sumRecord(snap.cumulative_volumes);
    const prevVol =
      i > 0 ? sumRecord(reversed[i - 1].cumulative_volumes) : cumVol;
    const volume = i > 0 ? cumVol - prevVol : 0;
    return {
      date: fmtDate(snap.timestamp),
      volume,
      cumVol,
      oi: sumRecord(snap.open_interests),
      tvl: fromX18BigInt(snap.tvl),
      dau: snap.daily_active_users,
    };
  });
}

function StatItem({
  label,
  loading,
  skeletonW = "w-24",
  children,
}: {
  label: string;
  loading: boolean;
  skeletonW?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className={`mt-1 h-7 ${skeletonW}`} /> : children}
    </div>
  );
}

const CardDivider = () => <div className="my-4 border-t border-border/40" />;


export function ProtocolOverview() {
  const timeframe = useProtocolStore((s) => s.overviewTimeframe);
  const setTimeframe = useProtocolStore((s) => s.setOverviewTimeframe);
  const { snapshots, loading } = useProtocolMarketSnapshots(90);
  const { snapshots: weeklySnapshots } = useProtocolMarketSnapshots(24, 604800);

  const latest = snapshots[0];
  const prev = snapshots[1];

  const {
    volume24h,
    allTimeVol,
    currentOI,
    currentTVL,
    dau,
    totalUsers,
    inflows24h,
    outflows24h,
  } = useMemo(() => {
    if (!latest) {
      return {
        volume24h: 0,
        allTimeVol: 0,
        currentOI: 0,
        currentTVL: 0,
        dau: 0,
        totalUsers: 0,
        inflows24h: 0,
        outflows24h: 0,
      };
    }
    const latestVol = sumRecord(latest.cumulative_volumes);
    const prevVol = prev ? sumRecord(prev.cumulative_volumes) : latestVol;
    const latestIn = sumRecord(latest.cumulative_inflows);
    const prevIn = prev ? sumRecord(prev.cumulative_inflows) : latestIn;
    const latestOut = sumRecord(latest.cumulative_outflows);
    const prevOut = prev ? sumRecord(prev.cumulative_outflows) : latestOut;
    return {
      volume24h: latestVol - prevVol,
      allTimeVol: latestVol,
      currentOI: sumRecord(latest.open_interests),
      currentTVL: fromX18BigInt(latest.tvl),
      dau: latest.daily_active_users,
      totalUsers: latest.cumulative_users,
      inflows24h: latestIn - prevIn,
      outflows24h: latestOut - prevOut,
    };
  }, [latest, prev]);

  const isLoading = loading || !latest;

  const chartData = useMemo(() => buildChartData(snapshots), [snapshots]);
  const n = TIMEFRAME_SLICE[timeframe];
  const sliced = n !== null ? chartData.slice(-n) : chartData;
  const weeklyChartData = useMemo(() => buildChartData(weeklySnapshots), [weeklySnapshots]);
  const volumeChartData = timeframe === "All Time" ? weeklyChartData : sliced;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Timeframe</span>
        <Select
          value={timeframe}
          onValueChange={(v) => setTimeframe(v as OverviewTimeframe)}
        >
          <SelectTrigger
            size="sm"
            className="w-[150px] dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              <SelectLabel className="px-1.5 py-1 text-[11px]">
                Timeframe
              </SelectLabel>
              {TIMEFRAME_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Row 1 — Trading Volume + Open Interest */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Card 1 — Trading Volume */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <StatItem label="24h Volume" loading={isLoading} skeletonW="w-24">
                <p className="text-2xl font-bold">
                  {fmtCompact.format(volume24h)}
                </p>
              </StatItem>
              <StatItem
                label="All Time Volume"
                loading={isLoading}
                skeletonW="w-28"
              >
                <p className="text-2xl font-bold">
                  {fmtCompact.format(allTimeVol)}
                </p>
              </StatItem>
            </div>
            <CardDivider />
            <p className="mb-0.5 text-sm font-medium">Trading Volume</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {timeframe === "All Time" ? "The weekly trading volume and the cumulative volume." : "The daily trading volume and the cumulative volume."}
            </p>
            {isLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <ComposedChart
                  data={volumeChartData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
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
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={fmtAxis}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={fmtAxis}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value, name) => [
                      typeof value === "number"
                        ? fmtUsd.format(value)
                        : String(value),
                      name === "volume" ? "Daily Volume" : "Cumulative",
                    ]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="volume"
                    fill="url(#volGrad)"
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

        {/* Card 2 — Open Interest */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <StatItem
                label="Open Interest"
                loading={isLoading}
                skeletonW="w-24"
              >
                <p className="text-2xl font-bold">
                  {fmtCompact.format(currentOI)}
                </p>
              </StatItem>
            </div>
            <CardDivider />
            <p className="mb-0.5 text-sm font-medium">Open Interest</p>
            <p className="mb-3 text-xs text-muted-foreground">The open interest over time.</p>
            {isLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={sliced}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="oiGrad" x1="0" y1="0" x2="0" y2="1">
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
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    tickFormatter={fmtAxis}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => [
                      typeof value === "number"
                        ? fmtUsd.format(value)
                        : String(value),
                      "Open Interest",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="oi"
                    stroke={PURPLE}
                    fill="url(#oiGrad)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — TVL + Daily Active Users */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Card 3 — TVL */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start gap-x-10 gap-y-3">
              <StatItem label="TVL" loading={isLoading} skeletonW="w-20">
                <p className="text-2xl font-bold">
                  {fmtCompact.format(currentTVL)}
                </p>
              </StatItem>
              <StatItem label="24h Flows" loading={isLoading} skeletonW="w-40">
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold">
                    {fmtCompact.format(Math.abs(inflows24h))}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-primary/40 text-primary text-[10px] px-1.5 py-0"
                  >
                    Deposited
                  </Badge>
                  <span className="text-sm font-bold text-destructive">
                    {outflows24h < 0 ? "–" : ""}
                    {fmtCompact.format(Math.abs(outflows24h))}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-destructive/40 text-destructive text-[10px] px-1.5 py-0"
                  >
                    Withdrawn
                  </Badge>
                </div>
              </StatItem>
            </div>
            <CardDivider />
            <p className="mb-0.5 text-sm font-medium">TVL</p>
            <p className="mb-3 text-xs text-muted-foreground">The total value locked over time.</p>
            {isLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={sliced}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
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
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    tickFormatter={fmtAxis}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => [
                      typeof value === "number"
                        ? fmtUsd.format(value)
                        : String(value),
                      "TVL",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="tvl"
                    stroke={PURPLE}
                    fill="url(#tvlGrad)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Card 4 — Daily Active Users */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <StatItem label="24h Traders" loading={isLoading} skeletonW="w-16">
                <p className="text-2xl font-bold">
                  {dau.toLocaleString("en-US")}
                </p>
              </StatItem>
              <StatItem
                label="Total Traders"
                loading={isLoading}
                skeletonW="w-16"
              >
                <p className="text-2xl font-bold">
                  {fmtUsers.format(totalUsers)}
                </p>
              </StatItem>
            </div>
            <CardDivider />
            <p className="mb-0.5 text-sm font-medium">Daily Active Users</p>
            <p className="mb-3 text-xs text-muted-foreground">The daily active traders.</p>
            {isLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <LineChart
                  data={sliced}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    strokeOpacity={0.3}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={55}
                    tickMargin={8}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => [value, "Daily Active Users"]}
                  />
                  <Line
                    type="linear"
                    dataKey="dau"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
