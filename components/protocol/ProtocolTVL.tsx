"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProtocolTVL,
  type AssetRatePoint,
  type TVLAsset,
  type TVLChartPoint,
} from "@/hooks/useProtocolTVL";
import Image from "next/image";
import { useEffect, useState } from "react";
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

// ─── Constants ──────────────────────────────────────────────────────────────────

import { ChartEmpty } from "@/components/protocol/ChartEmpty";
import { ErrorBanner } from "@/components/protocol/ErrorBanner";
import { CHART_PRIMARY as PURPLE } from "@/lib/chartColors";
const GREEN = "#34d399";
const RED = "#f87171";
const CHART_H = 300;

const SPOT_META: Record<string, { symbol: string; icon: string }> = {
  "0": { symbol: "USDT0", icon: "/icons/spot/usdt0.svg" },
  "1": { symbol: "kBTC", icon: "/icons/spot/kbtc.svg" },
  "3": { symbol: "wETH", icon: "/icons/spot/weth.svg" },
  "5": { symbol: "USDC", icon: "/icons/spot/usdc.svg" },
  "11": { symbol: "NLP", icon: "/icons/spot/nlp.svg" },
};

const NLP_PRODUCT_ID = "11";

function spotName(productId: string): string {
  return SPOT_META[productId]?.symbol ?? `Product ${productId}`;
}

function spotIcon(productId: string): string | null {
  return SPOT_META[productId]?.icon ?? null;
}

const SPOT_COLORS: Record<string, string> = {
  "11": "#6b5b95", // NLP — muted purple
  "5": "#2775ca", // USDC — blue
  "0": "#26a17b", // USDT0 — teal
  "1": "#c9983a", // kBTC — gold
  "3": "#627eea", // wETH — slate blue
};
const FALLBACK_COLORS = ["#8b5cf6", "#a78bfa", "#6d28d9", "#7c3aed", "#60a5fa"];
const OTHER_COLOR = "#4a5568";

// ─── Formatting ─────────────────────────────────────────────────────────────────

const fmtCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fmtCompact2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtAxis(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtAPR(rate: number): string {
  return (rate * 100).toFixed(4) + "%";
}

function fmtAPRAxis(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return (n * 100).toFixed(2) + "%";
}

function fmtDateShort(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function weekLabel(ts: number): string {
  return `${fmtDateShort(ts - 7 * 86400)} – ${fmtDateShort(ts)}`;
}

function downsampleWeekly(points: AssetRatePoint[]): AssetRatePoint[] {
  if (points.length <= 7) return points;
  const result: AssetRatePoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    const avg = chunk.reduce((s, p) => s + p.rate, 0) / chunk.length;
    const last = chunk[chunk.length - 1]!;
    result.push({ ts: last.ts, date: last.date, rate: avg });
  }
  return result;
}

// ─── Timeframe ──────────────────────────────────────────────────────────────────

type TVLTimeframe =
  | "24 Hours"
  | "7 Days"
  | "30 Days"
  | "60 Days"
  | "90 Days"
  | "All Time";

const TIMEFRAME_OPTIONS: { value: TVLTimeframe; label: string }[] = [
  { value: "24 Hours", label: "Past 24 Hours" },
  { value: "7 Days", label: "Past 7 Days" },
  { value: "30 Days", label: "Past 30 Days" },
  { value: "60 Days", label: "Past 60 Days" },
  { value: "90 Days", label: "Past 90 Days" },
  { value: "All Time", label: "All Time" },
];

// ─── Stat item ──────────────────────────────────────────────────────────────────

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

// ─── Tooltips ───────────────────────────────────────────────────────────────────

function TVLTooltip({
  active,
  payload,
  label,
  weekly = false,
}: {
  active?: boolean;
  payload?: { payload: TVLChartPoint }[];
  label?: string;
  weekly?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const { ts, tvl } = payload[0]!.payload;
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
        {weekly ? weekLabel(ts) : label}
      </p>
      <p
        style={{
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: PURPLE,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        TVL: {fmtCompact.format(tvl)}
      </p>
    </div>
  );
}

function FlowsTooltip({
  active,
  payload,
  label,
  weekly = false,
}: {
  active?: boolean;
  payload?: { payload: TVLChartPoint }[];
  label?: string;
  weekly?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const { ts, inflows, outflows, netFlows } = payload[0]!.payload;
  return (
    <div
      style={{
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--foreground)",
        minWidth: 220,
      }}
    >
      <p style={{ color: "var(--muted-foreground)", marginBottom: 6 }}>
        {weekly ? weekLabel(ts) : label}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 3,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: GREEN,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          Deposits
        </span>
        <span style={{ fontWeight: 600 }}>{fmtCompact.format(inflows)}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 3,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: RED,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          Withdrawals
        </span>
        <span style={{ fontWeight: 600 }}>
          {fmtCompact.format(Math.abs(outflows))}
        </span>
      </div>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.7)",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          Net
        </span>
        <span style={{ fontWeight: 600 }}>{fmtCompact.format(netFlows)}</span>
      </div>
    </div>
  );
}

function AreaTooltip({
  active,
  payload,
  label,
  weekly = false,
  title,
}: {
  active?: boolean;
  payload?: { payload: TVLChartPoint }[];
  label?: string;
  weekly?: boolean;
  title: string;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]!.payload;
  const val = title === "Deposits" ? pt.deposits : pt.borrows;
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
        {weekly ? weekLabel(pt.ts) : label}
      </p>
      <p style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: PURPLE, display: "inline-block", flexShrink: 0 }} />
        {title}: {fmtCompact.format(val)}
      </p>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: { name: string; color: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const { name, color } = payload[0]!.payload;
  return (
    <div
      style={{
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12,
        color: "var(--foreground)",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      <span>
        {name}: {fmtCompact.format(payload[0]!.value)}
      </span>
    </div>
  );
}

function APRTooltip({
  active,
  payload,
  label,
  weekly = false,
}: {
  active?: boolean;
  payload?: { payload: AssetRatePoint }[];
  label?: string;
  weekly?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const { ts, rate } = payload[0]!.payload;
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
        {weekly ? weekLabel(ts) : label}
      </p>
      <p style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: PURPLE, display: "inline-block", flexShrink: 0 }} />
        APR: {fmtAPR(rate)}
      </p>
    </div>
  );
}

// ─── Donut builder ──────────────────────────────────────────────────────────────

function buildDonut(
  assets: TVLAsset[],
  field: "deposits" | "borrows",
): { name: string; value: number; color: string; productId: string }[] {
  const filtered = assets
    .filter((a) => a[field] > 0)
    .filter((a) => field !== "borrows" || a.productId !== NLP_PRODUCT_ID)
    .sort((a, b) => b[field] - a[field]);
  const top = filtered.slice(0, 10);
  const rest = filtered.slice(10);
  let fallbackIdx = 0;
  const slices = top.map((a) => ({
    name: spotName(a.productId),
    value: a[field],
    color:
      SPOT_COLORS[a.productId] ??
      FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length]!,
    productId: a.productId,
  }));
  if (rest.length > 0) {
    slices.push({
      name: "Other",
      value: rest.reduce((s, a) => s + a[field], 0),
      color: OTHER_COLOR,
      productId: "",
    });
  }
  return slices;
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function ProtocolTVL() {
  const {
    tvl,
    inflows24h,
    outflows24h,
    hourlyChartData,
    dailyChartData,
    weeklyChartData,
    spotAssets,
    loading,
    backgroundLoading,
    error,
  } = useProtocolTVL();

  const [timeframe, setTimeframe] = useState<TVLTimeframe>("30 Days");
  const [depositAsset, setDepositAsset] = useState<string>("");
  const [borrowAsset, setBorrowAsset] = useState<string>("");

  useEffect(() => {
    const nonNlp = spotAssets.filter((a) => a.productId !== NLP_PRODUCT_ID);
    if (nonNlp.length > 0 && !depositAsset)
      setDepositAsset(nonNlp[0]!.productId);
    if (nonNlp.length > 0 && !borrowAsset) setBorrowAsset(nonNlp[0]!.productId);
  }, [spotAssets, depositAsset, borrowAsset]);

  const isAllTime = timeframe === "All Time";
  const chartLoading =
    loading ||
    (backgroundLoading &&
      timeframe !== "30 Days" &&
      timeframe !== "24 Hours" &&
      timeframe !== "7 Days");
  const chartData = isAllTime
    ? weeklyChartData
    : timeframe === "24 Hours"
      ? hourlyChartData
      : timeframe === "7 Days"
        ? dailyChartData.slice(-7)
        : timeframe === "60 Days"
          ? dailyChartData.slice(-60)
          : timeframe === "90 Days"
            ? dailyChartData
            : dailyChartData.slice(-30);

  const depositDonut = buildDonut(spotAssets, "deposits");
  const borrowDonut = buildDonut(spotAssets, "borrows");
  const totalDeposits = depositDonut.reduce((s, d) => s + d.value, 0);
  const totalBorrows = borrowDonut.reduce((s, d) => s + d.value, 0);

  const rateAssets = spotAssets.filter((a) => a.productId !== NLP_PRODUCT_ID);

  const depositAssetData = spotAssets.find((a) => a.productId === depositAsset);
  const borrowAssetData = spotAssets.find((a) => a.productId === borrowAsset);

  const sliceHistory = (history: AssetRatePoint[]): AssetRatePoint[] => {
    if (isAllTime) return history;
    if (timeframe === "24 Hours") return history.slice(-24);
    if (timeframe === "7 Days") return history.slice(-7);
    if (timeframe === "60 Days") return history.slice(-60);
    if (timeframe === "90 Days") return history;
    return history.slice(-30);
  };

  const depositRateHistory = (() => {
    if (!depositAssetData) return [];
    if (isAllTime) return depositAssetData.depositHistoryWeekly;
    return sliceHistory(depositAssetData.depositHistory);
  })();

  const borrowRateHistory = (() => {
    if (!borrowAssetData) return [];
    if (isAllTime) return borrowAssetData.borrowHistoryWeekly;
    return sliceHistory(borrowAssetData.borrowHistory);
  })();

  const topDepositAPRs = [...spotAssets]
    .filter((a) => a.depositAPR > 0)
    .sort((a, b) => b.depositAPR - a.depositAPR);

  const lowestBorrowAPRs = [...spotAssets]
    .filter((a) => a.borrowAPR > 0)
    .sort((a, b) => a.borrowAPR - b.borrowAPR);

  return (
    <div className="space-y-6">
      {error && <ErrorBanner error={error} />}
      {/* Timeframe selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground">Timeframe</span>
        <Select
          value={timeframe}
          onValueChange={(v) => setTimeframe(v as TVLTimeframe)}
        >
          <SelectTrigger
            size="sm"
            className="w-[140px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
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

      {/* ── Row 1 — TVL chart + Weekly Flows ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* TVL area */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3">
              <StatItem label="TVL" loading={loading} skeletonW="w-32">
                <p className="text-2xl font-bold">{error ? "—" : fmtCompact.format(tvl)}</p>
              </StatItem>
            </div>
            <p className="mb-0.5 text-sm font-medium">TVL</p>
            <p className="mb-8 text-xs text-muted-foreground">
              The total value locked over time.
            </p>
            {chartLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.45} />
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
                  <Tooltip content={<TVLTooltip weekly={isAllTime} />} />
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

        {/* Weekly Flows */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3">
              <StatItem label="24h Flows" loading={loading} skeletonW="w-40">
                {error ? (
                  <p className="text-2xl font-bold">—</p>
                ) : (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-2xl font-bold">
                    {fmtCompact.format(Math.abs(inflows24h))}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-primary/40 text-primary text-[10px] px-1.5 py-0"
                  >
                    Deposited
                  </Badge>
                  <span className="text-2xl font-bold text-destructive">
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
                )}
              </StatItem>
            </div>
            <p className="mb-0.5 text-sm font-medium">
              {isAllTime ? "Weekly Flows" : "Daily Flows"}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAllTime
                ? "The weekly deposits, withdrawals and net flows."
                : "The daily deposits, withdrawals and net flows, calculated using the average oracle price between two adjacent data points."}
            </p>
            {chartLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <ComposedChart
                  data={chartData}
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
                    tickFormatter={fmtAxis}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    domain={["auto", "auto"]}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="var(--border)"
                    strokeOpacity={0.5}
                  />
                  <Tooltip content={<FlowsTooltip weekly={isAllTime} />} />
                  <Bar dataKey="inflows" fill={GREEN} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="outflows" fill={RED} radius={[2, 2, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="netFlows"
                    stroke="var(--foreground)" strokeOpacity={0.7}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2 — Donuts ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Total Deposited by Asset */}
        <Card className="border-border bg-card p-0">
          <CardContent className="flex h-full flex-col p-5">
            <p className="mb-0.5 text-sm font-medium">
              Total Deposited by Asset
            </p>
            <p className="text-xs text-muted-foreground">
              Breakdown of total deposits across individual assets.
            </p>
            {loading ? (
              <Skeleton className="mt-3 w-full" style={{ height: CHART_H }} />
            ) : depositDonut.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <div className="flex flex-1 items-center gap-6">
                <div className="flex flex-1 justify-center">
                  <PieChart width={280} height={280}>
                    <Pie
                      data={depositDonut}
                      cx={140}
                      cy={140}
                      innerRadius={70}
                      outerRadius={120}
                      dataKey="value"
                      stroke="none"
                    >
                      {depositDonut.map((s, i) => (
                        <Cell key={`${s.name}-${i}`} fill={s.color} />
                      ))}
                      <Label
                        content={(props) => {
                          const vb = props.viewBox as
                            | { cx?: number; cy?: number }
                            | undefined;
                          const cx = vb?.cx ?? 140;
                          const cy = vb?.cy ?? 140;
                          return (
                            <text textAnchor="middle">
                              <tspan
                                x={cx}
                                y={cy - 8}
                                fontSize={11}
                                fill="var(--muted-foreground)"
                              >
                                Total Deposits
                              </tspan>
                              <tspan
                                x={cx}
                                y={cy + 14}
                                fontSize={16}
                                fontWeight="bold"
                                fill="var(--foreground)"
                              >
                                {fmtCompact2.format(totalDeposits)}
                              </tspan>
                            </text>
                          );
                        }}
                        position="center"
                      />
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </div>
                <div className="flex shrink-0 flex-col justify-center gap-2.5 self-stretch">
                  {depositDonut.map((s) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-sm text-foreground">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Borrowed by Asset */}
        <Card className="border-border bg-card p-0">
          <CardContent className="flex h-full flex-col p-5">
            <p className="mb-0.5 text-sm font-medium">
              Total Borrowed by Asset
            </p>
            <p className="text-xs text-muted-foreground">
              Breakdown of total borrows across individual assets.
            </p>
            {loading ? (
              <Skeleton className="mt-3 w-full" style={{ height: CHART_H }} />
            ) : borrowDonut.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <div className="flex flex-1 items-center gap-6">
                <div className="flex flex-1 justify-center">
                  <PieChart width={280} height={280}>
                    <Pie
                      data={borrowDonut}
                      cx={140}
                      cy={140}
                      innerRadius={70}
                      outerRadius={120}
                      dataKey="value"
                      stroke="none"
                    >
                      {borrowDonut.map((s, i) => (
                        <Cell key={`${s.name}-${i}`} fill={s.color} />
                      ))}
                      <Label
                        content={(props) => {
                          const vb = props.viewBox as
                            | { cx?: number; cy?: number }
                            | undefined;
                          const cx = vb?.cx ?? 140;
                          const cy = vb?.cy ?? 140;
                          return (
                            <text textAnchor="middle">
                              <tspan
                                x={cx}
                                y={cy - 8}
                                fontSize={11}
                                fill="var(--muted-foreground)"
                              >
                                Total Borrows
                              </tspan>
                              <tspan
                                x={cx}
                                y={cy + 14}
                                fontSize={16}
                                fontWeight="bold"
                                fill="var(--foreground)"
                              >
                                {fmtCompact2.format(totalBorrows)}
                              </tspan>
                            </text>
                          );
                        }}
                        position="center"
                      />
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </div>
                <div className="flex shrink-0 flex-col justify-center gap-2.5 self-stretch">
                  {borrowDonut.map((s) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-sm text-foreground">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3 — Deposits + Borrows area charts ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">Deposits</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAllTime
                ? "The weekly total deposits."
                : "The daily total deposits."}
            </p>
            {chartLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.45} />
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
                    content={
                      <AreaTooltip weekly={isAllTime} title="Deposits" />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="deposits"
                    stroke={PURPLE}
                    fill="url(#depGrad)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">Borrows</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAllTime
                ? "The weekly total borrows."
                : "The daily total borrows."}
            </p>
            {chartLoading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="borGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.45} />
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
                    content={<AreaTooltip weekly={isAllTime} title="Borrows" />}
                  />
                  <Area
                    type="monotone"
                    dataKey="borrows"
                    stroke={PURPLE}
                    fill="url(#borGrad)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4 — APR lists ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">Top Deposit APRs</p>
            <p className="mb-3 text-xs text-muted-foreground">
              The highest deposit APRs, calculated based on current utilization
              rates.
            </p>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : topDepositAPRs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deposit rates available.
              </p>
            ) : (
              <div className="space-y-2.5">
                {topDepositAPRs.map((a) => {
                  const icon = spotIcon(a.productId);
                  return (
                    <div
                      key={a.productId}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {icon && (
                          <Image
                            src={icon}
                            alt={spotName(a.productId)}
                            width={16}
                            height={16}
                            className="shrink-0 rounded-full"
                          />
                        )}
                        {spotName(a.productId)}
                      </span>
                      <span className="font-mono text-sm text-primary">
                        {fmtAPR(a.depositAPR)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <p className="mb-0.5 text-sm font-medium">Lowest Borrow APRs</p>
            <p className="mb-3 text-xs text-muted-foreground">
              The lowest borrow APRs, calculated based on current utilization
              rates.
            </p>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : lowestBorrowAPRs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No borrow rates available.
              </p>
            ) : (
              <div className="space-y-2.5">
                {lowestBorrowAPRs.map((a) => {
                  const icon = spotIcon(a.productId);
                  return (
                    <div
                      key={a.productId}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {icon && (
                          <Image
                            src={icon}
                            alt={spotName(a.productId)}
                            width={16}
                            height={16}
                            className="shrink-0 rounded-full"
                          />
                        )}
                        {spotName(a.productId)}
                      </span>
                      <span className="font-mono text-sm text-amber-400">
                        {fmtAPR(a.borrowAPR)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 5 — Historical APR charts ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Historical Deposit APRs */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="mb-0.5 text-sm font-medium">
                  Historical Deposit APRs
                </p>
                <p className="text-xs text-muted-foreground">
                  The daily average rate, compounded to an annualized value for
                  the selected asset.
                </p>
              </div>
            </div>
            {rateAssets.length > 0 && (
              <div className="mb-3">
                <Select
                  value={depositAsset}
                  onValueChange={(v) => v && setDepositAsset(v)}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-[160px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      {spotIcon(depositAsset) && (
                        <Image
                          src={spotIcon(depositAsset)!}
                          alt=""
                          width={16}
                          height={16}
                          className="shrink-0 rounded-full"
                        />
                      )}
                      {spotName(depositAsset)}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {rateAssets.map((a) => (
                        <SelectItem key={a.productId} value={a.productId}>
                          <span className="flex items-center gap-2">
                            {spotIcon(a.productId) && (
                              <Image
                                src={spotIcon(a.productId)!}
                                alt=""
                                width={16}
                                height={16}
                                className="shrink-0 rounded-full"
                              />
                            )}
                            {spotName(a.productId)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
            {loading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : !depositAssetData || depositRateHistory.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <LineChart
                  data={depositRateHistory}
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
                    tickFormatter={fmtAPRAxis}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<APRTooltip weekly={isAllTime} />} />
                  <Line
                    type="linear"
                    dataKey="rate"
                    stroke={PURPLE}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Historical Borrow APRs */}
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="mb-0.5 text-sm font-medium">
                  Historical Borrow APRs
                </p>
                <p className="text-xs text-muted-foreground">
                  The daily average rate, compounded to an annualized value for
                  the selected asset.
                </p>
              </div>
            </div>
            {rateAssets.length > 0 && (
              <div className="mb-3">
                <Select
                  value={borrowAsset}
                  onValueChange={(v) => v && setBorrowAsset(v)}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-[160px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      {spotIcon(borrowAsset) && (
                        <Image
                          src={spotIcon(borrowAsset)!}
                          alt=""
                          width={16}
                          height={16}
                          className="shrink-0 rounded-full"
                        />
                      )}
                      {spotName(borrowAsset)}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {rateAssets.map((a) => (
                        <SelectItem key={a.productId} value={a.productId}>
                          <span className="flex items-center gap-2">
                            {spotIcon(a.productId) && (
                              <Image
                                src={spotIcon(a.productId)!}
                                alt=""
                                width={16}
                                height={16}
                                className="shrink-0 rounded-full"
                              />
                            )}
                            {spotName(a.productId)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
            {loading ? (
              <Skeleton className="w-full" style={{ height: CHART_H }} />
            ) : !borrowAssetData || borrowRateHistory.length === 0 ? (
              <ChartEmpty height={CHART_H} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_H}>
                <LineChart
                  data={borrowRateHistory}
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
                    tickFormatter={fmtAPRAxis}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<APRTooltip weekly={isAllTime} />} />
                  <Line
                    type="linear"
                    dataKey="rate"
                    stroke={PURPLE}
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
