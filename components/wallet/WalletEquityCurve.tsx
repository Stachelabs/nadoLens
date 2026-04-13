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
  type EquityPeriod,
} from "@/lib/wallet/equityPeriod";
import { Button } from "@/components/ui/button";
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

type Props = {
  trades: TradeMatch[];
  fundingPayments: FundingPaymentEntry[];
  /** When false, global match pagination is still running — chart shows if data available. */
  globalMatchesComplete?: boolean;
  /** True once global funding CTA has completed. */
  globalFundingComplete?: boolean;
  /** True while loadGlobalFunding() is in-flight. */
  globalFundingLoading?: boolean;
  /** CTA trigger — same as WalletSummary "Load full history". */
  loadGlobalFunding?: () => Promise<void>;
};

const BULL_STROKE = "#34d399";
const BEAR_STROKE = "#f87171";

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
  globalFundingComplete = true,
  globalFundingLoading = false,
  loadGlobalFunding,
}: Props) {
  const [period, setPeriod] = useState<EquityPeriod>("7 Days");

  const tradesInPeriod = useMemo(() => {
    if (!globalMatchesComplete) return [];
    return filterTradesByPeriod(trades, period);
  }, [trades, globalMatchesComplete, period]);

  const fundingInPeriod = useMemo(() => {
    if (!globalMatchesComplete) return [];
    return filterFundingPaymentsByPeriod(fundingPayments, period);
  }, [fundingPayments, globalMatchesComplete, period]);

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
      globalMatchesComplete
        ? buildEquityCurveData(tradesInPeriod, {
            fundingPayments: fundingInPeriod,
          })
        : [],
    [tradesInPeriod, fundingInPeriod, globalMatchesComplete],
  );

  const finalValue = points[points.length - 1]?.equity ?? 0;
  const lineColor = finalValue >= 0 ? BULL_STROKE : BEAR_STROKE;

  const chartConfig = {
    equity: {
      label: "Equity",
      color: lineColor,
    },
  } satisfies ChartConfig;

  const emptyInPeriod =
    globalMatchesComplete && tradesInPeriod.length === 0 && period !== "All time";

  // Show skeleton on breakdown value boxes when data for the period isn't loaded yet.
  const pnlLoading = !globalMatchesComplete && tradesInPeriod.length === 0;
  const isFundingPositive = breakdown.funding >= 0;

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
        {points.length >= 2 ? (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-48 w-full min-h-[192px] justify-stretch [&>div]:aspect-auto"
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
        ) : !globalMatchesComplete ? (
          <Skeleton className="h-48 w-full rounded-md" />
        ) : emptyInPeriod ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground/70">
            No trades in this period
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground/70">
            Not enough trade data to plot curve
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">PnL</span>
            {pnlLoading ? (
              <Skeleton className="h-3.5 w-20 rounded-sm" />
            ) : (
              <span
                className={cn(
                  "tabular-nums",
                  breakdown.tradingPnl >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {breakdown.tradingPnl >= 0 ? "+" : ""}
                {fmtUsd.format(breakdown.tradingPnl)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Fees</span>
            {pnlLoading ? (
              <Skeleton className="h-3.5 w-20 rounded-sm bg-red-400/15" />
            ) : (
              <span className="tabular-nums text-red-400">
                -{fmtUsd.format(breakdown.fees)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Funding</span>
            {globalFundingComplete ? (
              <span
                className={cn(
                  "tabular-nums",
                  isFundingPositive ? "text-emerald-400" : "text-red-400",
                )}
              >
                {isFundingPositive ? "+" : ""}
                {fmtUsd.format(breakdown.funding)}
              </span>
            ) : globalFundingLoading ? (
              <Skeleton
                className={cn(
                  "h-3.5 w-20 rounded-sm",
                  isFundingPositive ? "bg-emerald-400/15" : "bg-red-400/15",
                )}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-5 text-[10px] px-2"
                onClick={() => void loadGlobalFunding?.()}
              >
                Load full history
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="font-medium text-foreground">Period Net PnL</span>
            {pnlLoading || !globalFundingComplete ? (
              <Skeleton className="h-3.5 w-24 rounded-sm" />
            ) : (
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  breakdown.totalNetPnl >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {breakdown.totalNetPnl >= 0 ? "+" : ""}
                {fmtUsd.format(breakdown.totalNetPnl)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
