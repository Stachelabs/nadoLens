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
  formatEquityPeriodLabel,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  trades: TradeMatch[];
  fundingPayments: FundingPaymentEntry[];
  /** When false, cumulative PnL / volumes are incomplete — hide misleading chart */
  tradesComplete?: boolean;
};

const BULL_STROKE = "#34d399";
const BEAR_STROKE = "#f87171";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const fmtUsdHeader = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
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
  tradesComplete = true,
}: Props) {
  const [period, setPeriod] = useState<EquityPeriod>("All time");

  const tradesInPeriod = useMemo(() => {
    if (!tradesComplete) return [];
    return filterTradesByPeriod(trades, period);
  }, [trades, tradesComplete, period]);

  const fundingInPeriod = useMemo(() => {
    if (!tradesComplete) return [];
    return filterFundingPaymentsByPeriod(fundingPayments, period);
  }, [fundingPayments, tradesComplete, period]);

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
      tradesComplete
        ? buildEquityCurveData(tradesInPeriod, {
            fundingPayments: fundingInPeriod,
          })
        : [],
    [tradesInPeriod, fundingInPeriod, tradesComplete],
  );

  const finalValue = points[points.length - 1]?.equity ?? 0;
  const lineColor = finalValue >= 0 ? BULL_STROKE : BEAR_STROKE;

  const chartConfig = {
    equity: {
      label: "Equity",
      color: lineColor,
    },
  } satisfies ChartConfig;

  const periodLabel = formatEquityPeriodLabel(period);
  const emptyInPeriod =
    tradesComplete && tradesInPeriod.length === 0 && period !== "All time";

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
              Equity Curve
            </div>
            <div className="text-xs text-muted-foreground">
              {period === "All time" ? "All time" : periodLabel}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Select
              value={period}
              onValueChange={(v) => {
                setPeriod(v as EquityPeriod);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full min-w-[140px] sm:w-[160px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {points.length > 0 && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Period net PnL
                </div>
                <div
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    finalValue >= 0 ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {finalValue >= 0 ? "+" : ""}
                  {fmtUsdHeader.format(finalValue)}
                </div>
              </div>
            )}
          </div>
        </div>
        {!tradesComplete ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground/70">
            Loading full trade history…
          </div>
        ) : emptyInPeriod ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground/70">
            No trades in this period
          </div>
        ) : points.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground/70">
            Not enough trade data to plot curve
          </div>
        ) : (
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
        )}
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">PnL</span>
            <span className={cn("tabular-nums", breakdown.tradingPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
              {breakdown.tradingPnl >= 0 ? "+" : ""}
              {fmtUsd.format(breakdown.tradingPnl)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Fees</span>
            <span className="tabular-nums text-red-400">
              -{fmtUsd.format(breakdown.fees)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Funding</span>
            <span className={cn("tabular-nums", breakdown.funding >= 0 ? "text-emerald-400" : "text-red-400")}>
              {breakdown.funding >= 0 ? "+" : ""}
              {fmtUsd.format(breakdown.funding)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <span className="font-medium text-foreground">Total PnL</span>
            <span className={cn("font-semibold tabular-nums", breakdown.totalNetPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
              {breakdown.totalNetPnl >= 0 ? "+" : ""}
              {fmtUsd.format(breakdown.totalNetPnl)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
