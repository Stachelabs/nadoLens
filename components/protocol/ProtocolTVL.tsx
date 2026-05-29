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
import { CHART_PRIMARY as PURPLE, CHART_HEIGHT, OTHER_COLOR } from "@/lib/chartColors";
import { fmtCompact, fmtCompact2, fmtAxis, fmtDateShort, weekLabel } from "@/lib/chartFormatters";
import { SPOT_COLOR, SPOT_ICON } from "@/lib/spotMeta";
const GREEN = "#34d399";
const RED = "#f87171";

const NLP_PRODUCT_ID = "11";

const FALLBACK_COLORS = [PURPLE, "#a78bfa", "#6d28d9", "#7c3aed", "#60a5fa"];

// ─── Formatting ─────────────────────────────────────────────────────────────────

function fmtAPR(rate: number): string {
  return (rate * 100).toFixed(4) + "%";
}

function fmtAPRAxis(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return (n * 100).toFixed(2) + "%";
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

// ─── Tooltip primitives ────────────────────────────────────────────────────────

const TOOLTIP_BASE: React.CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  color: "var(--foreground)",
};

function TooltipShell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...TOOLTIP_BASE, ...style }}>{children}</div>;
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, display: "inline-block", flexShrink: 0 }}
    />
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <ColorDot color={color} />
        {label}
      </span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── Tooltips ───────────────────────────────────────────────────────────────────

function TVLTooltip({ active, payload, label, weekly = false }: {
  active?: boolean; payload?: { payload: TVLChartPoint }[]; label?: string; weekly?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const { ts, tvl } = payload[0]!.payload;
  return (
    <TooltipShell>
      <p style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>{weekly ? weekLabel(ts) : label}</p>
      <p style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
        <ColorDot color={PURPLE} />
        TVL: {fmtCompact.format(tvl)}
      </p>
    </TooltipShell>
  );
}

function FlowsTooltip({ active, payload, label, weekly = false }: {
  active?: boolean; payload?: { payload: TVLChartPoint }[]; label?: string; weekly?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const { ts, inflows, outflows, netFlows } = payload[0]!.payload;
  return (
    <TooltipShell style={{ minWidth: 220 }}>
      <p style={{ color: "var(--muted-foreground)", marginBottom: 6 }}>{weekly ? weekLabel(ts) : label}</p>
      <TooltipRow color={GREEN} label="Deposits" value={fmtCompact.format(inflows)} />
      <TooltipRow color={RED} label="Withdrawals" value={fmtCompact.format(Math.abs(outflows))} />
      <TooltipRow color="rgba(255,255,255,0.7)" label="Net" value={fmtCompact.format(netFlows)} />
    </TooltipShell>
  );
}

function AreaTooltip({ active, payload, label, weekly = false, title }: {
  active?: boolean; payload?: { payload: TVLChartPoint }[]; label?: string; weekly?: boolean; title: string;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]!.payload;
  const val = title === "Deposits" ? pt.deposits : pt.borrows;
  return (
    <TooltipShell>
      <p style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>{weekly ? weekLabel(pt.ts) : label}</p>
      <p style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
        <ColorDot color={PURPLE} />
        {title}: {fmtCompact.format(val)}
      </p>
    </TooltipShell>
  );
}

function DonutTooltip({ active, payload }: {
  active?: boolean; payload?: { value: number; payload: { name: string; color: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const { name, color } = payload[0]!.payload;
  return (
    <TooltipShell style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
      <ColorDot color={color} />
      <span>{name}: {fmtCompact.format(payload[0]!.value)}</span>
    </TooltipShell>
  );
}

function APRTooltip({ active, payload, label, weekly = false }: {
  active?: boolean; payload?: { payload: AssetRatePoint }[]; label?: string; weekly?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const { ts, rate } = payload[0]!.payload;
  return (
    <TooltipShell>
      <p style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>{weekly ? weekLabel(ts) : label}</p>
      <p style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
        <ColorDot color={PURPLE} />
        APR: {fmtAPR(rate)}
      </p>
    </TooltipShell>
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
    name: a.name,
    value: a[field],
    color:
      SPOT_COLOR[a.productId] ??
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

  const SLICE_MAP: Record<TVLTimeframe, number | null> = {
    "24 Hours": null,
    "7 Days": -7,
    "30 Days": -30,
    "60 Days": -60,
    "90 Days": 0,
    "All Time": null,
  };

  function sliceDaily<T>(data: T[]): T[] {
    const n = SLICE_MAP[timeframe];
    if (n === null) return data;
    return n === 0 ? data : data.slice(n);
  }

  const chartData = isAllTime
    ? weeklyChartData
    : timeframe === "24 Hours"
      ? hourlyChartData
      : sliceDaily(dailyChartData);

  const depositDonut = buildDonut(spotAssets, "deposits");
  const borrowDonut = buildDonut(spotAssets, "borrows");
  const totalDeposits = depositDonut.reduce((s, d) => s + d.value, 0);
  const totalBorrows = borrowDonut.reduce((s, d) => s + d.value, 0);

  const rateAssets = spotAssets.filter((a) => a.productId !== NLP_PRODUCT_ID);

  const depositAssetData = spotAssets.find((a) => a.productId === depositAsset);
  const borrowAssetData = spotAssets.find((a) => a.productId === borrowAsset);

  const depositRateHistory = !depositAssetData
    ? []
    : isAllTime
      ? depositAssetData.depositHistoryWeekly
      : sliceDaily(depositAssetData.depositHistory);

  const borrowRateHistory = !borrowAssetData
    ? []
    : isAllTime
      ? borrowAssetData.borrowHistoryWeekly
      : sliceDaily(borrowAssetData.borrowHistory);

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
            aria-label="Select timeframe"
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
              <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
              <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
              <Skeleton className="mt-3 w-full" style={{ height: CHART_HEIGHT }} />
            ) : depositDonut.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
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
              <Skeleton className="mt-3 w-full" style={{ height: CHART_HEIGHT }} />
            ) : borrowDonut.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
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
              <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
              <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
            ) : chartData.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
                  const icon = SPOT_ICON[a.productId];
                  return (
                    <div
                      key={a.productId}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {icon && (
                          <Image
                            src={icon}
                            alt={a.name}
                            width={16}
                            height={16}
                            className="shrink-0 rounded-full"
                          />
                        )}
                        {a.name}
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
                  const icon = SPOT_ICON[a.productId];
                  return (
                    <div
                      key={a.productId}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {icon && (
                          <Image
                            src={icon}
                            alt={a.name}
                            width={16}
                            height={16}
                            className="shrink-0 rounded-full"
                          />
                        )}
                        {a.name}
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
                    aria-label="Select deposit asset"
                    className="w-[160px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      {SPOT_ICON[depositAsset] && (
                        <Image
                          src={SPOT_ICON[depositAsset]!}
                          alt=""
                          width={16}
                          height={16}
                          className="shrink-0 rounded-full"
                        />
                      )}
                      {depositAssetData?.name ?? depositAsset}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {rateAssets.map((a) => (
                        <SelectItem key={a.productId} value={a.productId}>
                          <span className="flex items-center gap-2">
                            {SPOT_ICON[a.productId] && (
                              <Image
                                src={SPOT_ICON[a.productId]!}
                                alt=""
                                width={16}
                                height={16}
                                className="shrink-0 rounded-full"
                              />
                            )}
                            {a.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
            {loading ? (
              <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
            ) : !depositAssetData || depositRateHistory.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
                    aria-label="Select borrow asset"
                    className="w-[160px] shrink-0 dark:border-border/40 px-2 text-[11px] font-medium text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      {SPOT_ICON[borrowAsset] && (
                        <Image
                          src={SPOT_ICON[borrowAsset]!}
                          alt=""
                          width={16}
                          height={16}
                          className="shrink-0 rounded-full"
                        />
                      )}
                      {borrowAssetData?.name ?? borrowAsset}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {rateAssets.map((a) => (
                        <SelectItem key={a.productId} value={a.productId}>
                          <span className="flex items-center gap-2">
                            {SPOT_ICON[a.productId] && (
                              <Image
                                src={SPOT_ICON[a.productId]!}
                                alt=""
                                width={16}
                                height={16}
                                className="shrink-0 rounded-full"
                              />
                            )}
                            {a.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
            {loading ? (
              <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
            ) : !borrowAssetData || borrowRateHistory.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT} />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
