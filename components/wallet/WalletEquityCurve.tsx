"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { fromX18BigInt } from "@/types/nado";
import type { TradeMatch } from "@/types/nado";
import {
  buildEquityCurveData,
  type EquityPoint,
  type FundingPaymentEntry,
} from "@/lib/wallet/buildEquityCurve";
import { isClosingTrade } from "@/lib/wallet/performance";
import {
  filterTradesByPeriod,
  filterFundingPaymentsByPeriod,
  isFundingLoaded,
  type EquityPeriod,
} from "@/lib/wallet/equityPeriod";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingShimmer } from "@/components/ui/LoadingShimmer";

type Props = {
  trades: TradeMatch[];
  fundingPayments: FundingPaymentEntry[];
  /** When false, global match pagination is still running — chart shows if data available. */
  globalMatchesComplete?: boolean;
  /** True once all funding has loaded. */
  globalFundingComplete?: boolean;
  /** True while funding history is loading. */
  globalFundingLoading?: boolean;
  /** Oldest funding timestamp loaded (unix ms). Infinity = nothing, 0 = all time. */
  fundingLoadedSince?: number;
};

const BULL_STROKE = "var(--color-bull)";
const BEAR_STROKE = "var(--color-bear)";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const PERIOD_OPTIONS: { value: EquityPeriod; label: string }[] = [
  { value: "24 Hours", label: "Last 24h" },
  { value: "7 Days", label: "Last 7 days" },
  { value: "30 Days", label: "Last 30 days" },
  { value: "All time", label: "All time" },
];

export function WalletEquityCurve({
  trades,
  fundingPayments,
  globalMatchesComplete = true,
  globalFundingComplete = false,
  globalFundingLoading = false,
  fundingLoadedSince = Infinity,
}: Props) {
  const [period, setPeriod] = useState<EquityPeriod>("7 Days");

  const tradesInPeriod = useMemo(
    () => filterTradesByPeriod(trades, period),
    [trades, period],
  );

  const fundingInPeriod = useMemo(
    () => filterFundingPaymentsByPeriod(fundingPayments, period),
    [fundingPayments, period],
  );

  const breakdown = useMemo(() => {
    const tradingPnl = tradesInPeriod.reduce((sum, trade) => {
      if (!trade.is_perp || !isClosingTrade(trade)) return sum;
      return sum + fromX18BigInt(trade.realized_pnl);
    }, 0);

    const fees = tradesInPeriod.reduce(
      (sum, trade) => sum + Math.abs(fromX18BigInt(trade.fee)),
      0,
    );

    const funding = fundingInPeriod.reduce(
      (sum, payment) => sum + fromX18BigInt(payment.amount),
      0,
    );

    return {
      tradingPnl,
      fees,
      funding,
      totalNetPnl: tradingPnl - fees + funding,
    };
  }, [tradesInPeriod, fundingInPeriod]);

  const points = useMemo(
    () =>
      buildEquityCurveData(tradesInPeriod, {
        fundingPayments: fundingInPeriod,
      }),
    [tradesInPeriod, fundingInPeriod],
  );

  const finalValue = points[points.length - 1]?.equity ?? 0;
  const lineColor = finalValue >= 0 ? BULL_STROKE : BEAR_STROKE;

  const chartConfig = {
    equity: {
      label: "Equity",
      color: lineColor,
    },
  } satisfies ChartConfig;

  // No trades for this period AND all data already loaded → genuinely empty.
  const emptyInPeriod =
    globalMatchesComplete &&
    tradesInPeriod.length === 0 &&
    period !== "All time";
  // Still loading matches AND no data for this period yet → show skeleton.
  const periodDataPending =
    !globalMatchesComplete && tradesInPeriod.length === 0;
  // Chart is in loading/shimmer state — stats cards should also show skeletons.
  const chartLoading =
    periodDataPending || (period === "All time" && !globalMatchesComplete);
  const isFundingPositive = breakdown.funding >= 0;
  const fundingReadyForPeriod = isFundingLoaded(period, fundingLoadedSince);
  const displayNetPnl = fundingReadyForPeriod
    ? breakdown.tradingPnl - breakdown.fees + breakdown.funding
    : breakdown.tradingPnl - breakdown.fees;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Perp Equity Curve
          </div>
          <div className="shrink-0 sm:ml-auto">
            <Select
              value={period}
              onValueChange={(v) => {
                if (v != null) setPeriod(v as EquityPeriod);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full min-w-[140px] sm:w-[160px] dark:border-border/40  px-2 text-[11px] font-medium text-muted-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectLabel className="px-1.5 py-1 text-[11px]">
                    Period
                  </SelectLabel>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* "All time" with incomplete data → keep skeleton (partial all-time is misleading) */}
        {period === "All time" && !globalMatchesComplete ? (
          <LoadingShimmer text="Loading PnL curve..." />
        ) : points.length >= 2 ? (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-80 w-full min-h-[320px] justify-stretch [&>div]:aspect-auto"
          >
            <LineChart
              accessibilityLayer
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border/40"
              />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickMargin={8}
                tickFormatter={(v) =>
                  typeof v === "number"
                    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
                    : String(v)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as
                        | EquityPoint
                        | undefined;
                      if (row && typeof row.ts === "number") {
                        return new Date(row.ts).toLocaleString();
                      }
                      return null;
                    }}
                    formatter={(value) => (
                      <span className="font-mono tabular-nums">
                        {fmtUsd.format(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="equity"
                stroke="var(--color-equity)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          </ChartContainer>
        ) : periodDataPending ? (
          <LoadingShimmer text="Loading PnL curve..." />
        ) : emptyInPeriod ? (
          <div className="h-80 flex items-center justify-center text-sm text-muted-foreground/70">
            No trades in this period
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-sm text-muted-foreground/70">
            Not enough trade data to plot curve
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">PnL</span>
            {chartLoading ? (
              <Skeleton className="h-3.5 w-20 rounded-sm" />
            ) : (
              <span
                className={cn(
                  "tabular-nums",
                  breakdown.tradingPnl >= 0
                    ? "text-primary"
                    : "text-destructive",
                )}
              >
                {breakdown.tradingPnl >= 0 ? "+" : ""}
                {fmtUsd.format(breakdown.tradingPnl)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Fees</span>
            {chartLoading ? (
              <Skeleton className="h-3.5 w-20 rounded-sm" />
            ) : (
              <span className="tabular-nums text-destructive">
                -{fmtUsd.format(breakdown.fees)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Funding</span>
            {fundingReadyForPeriod ? (
              <span
                className={cn(
                  "tabular-nums",
                  isFundingPositive ? "text-primary" : "text-destructive",
                )}
              >
                {isFundingPositive ? "+" : ""}
                {fmtUsd.format(breakdown.funding)}
              </span>
            ) : (
              <Skeleton className="h-3.5 w-20 rounded-sm" />
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="font-medium text-foreground">Period Net PnL</span>
            {chartLoading ? (
              <Skeleton className="h-3.5 w-20 rounded-sm" />
            ) : (
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  displayNetPnl >= 0 ? "text-primary" : "text-destructive",
                )}
              >
                {displayNetPnl >= 0 ? "+" : ""}
                {fmtUsd.format(displayNetPnl)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
