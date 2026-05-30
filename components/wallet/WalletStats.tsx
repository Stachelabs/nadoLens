"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { perpIconSrcFromPair } from "@/lib/wallet/perpPairIcon";
import type { WalletStats } from "@/types/nado";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const fmtPnl = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type Props = {
  stats: WalletStats;
  tradesComplete?: boolean;
};

export function WalletStats({ stats, tradesComplete = true }: Props) {
  const isPnlPositive = stats.net_pnl_usd >= 0;
  const totalTrades = stats.perp_trades_count + stats.spot_trades_count;
  const metricsLoading = !tradesComplete;

  const items = [
    {
      label: "Win Rate",
      skeleton: metricsLoading,
      value: `${stats.win_rate.toFixed(1)}%`,
      color: stats.win_rate >= 50 ? "text-primary" : "text-destructive",
      sub: null,
      subSkeleton: false,
    },
    {
      label: "Total PnL",
      skeleton: metricsLoading,
      value: `${isPnlPositive ? "+" : ""}${fmtUsd.format(stats.net_pnl_usd)}`,
      color: isPnlPositive ? "text-primary" : "text-destructive",
      sub: null,
      subSkeleton: false,
    },
    {
      label: "Volume",
      skeleton: metricsLoading,
      value: fmtUsd.format(stats.total_volume_usd),
      color: "text-foreground/70",
      sub: null,
      subSkeleton: false,
    },
    {
      label: "Avg Trade Size",
      skeleton: metricsLoading,
      color: "text-foreground/70",
      value: fmtUsd.format(stats.avg_trade_size_usd),
      sub: null,
      subSkeleton: false,
    },
    {
      label: "Total Fees",
      skeleton: metricsLoading,
      value: fmtUsd.format(stats.total_fees_usd),
      color: "text-destructive",
      sub: null,
      subSkeleton: false,
    },
    {
      label: "Trades (matches)",
      skeleton: metricsLoading,
      value: totalTrades.toString(),
      color: "text-foreground/70",
      sub:
        tradesComplete &&
        (stats.perp_trades_count > 0 || stats.spot_trades_count > 0)
          ? `${stats.perp_trades_count} perp · ${stats.spot_trades_count} spot`
          : null,
      subSkeleton: false,
    },
  ];

  const biggestCards: {
    label: string;
    trade: typeof stats.best_trade;
    color: string;
  }[] = [
    { label: "Best Trade", trade: stats.best_trade, color: "text-primary" },
    {
      label: "Worst Trade",
      trade: stats.worst_trade,
      color: "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-[1fr] gap-3">
      {items.map(({ label, value, color, sub, skeleton, subSkeleton }) => (
        <Card key={label} className="border-border bg-card min-w-0 flex">
          <CardContent className="p-3 text-center flex flex-col items-center justify-center flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-1">
              {label}
            </div>
            <div className={cn("min-h-7 flex items-center justify-center")}>
              {skeleton ? (
                <Skeleton className="h-5 w-24 mx-auto" />
              ) : (
                <span className={`text-base font-bold tabular-nums ${color}`}>
                  {value}
                </span>
              )}
            </div>
            {subSkeleton ? (
              <Skeleton className="h-3 w-24 mx-auto mt-0.5" />
            ) : sub ? (
              <div className="text-[11px] tabular-nums text-muted-foreground/80 mt-0.5">
                {sub}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
      {biggestCards.map(({ label, trade, color }) => (
        <Card key={label} className="border-border bg-card min-w-0 flex">
          <CardContent className="p-3 text-center flex flex-col items-center justify-center flex-1 w-full">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-1">
              {label}
            </div>
            <div className={cn("min-h-7 flex items-center justify-center")}>
              {metricsLoading ? (
                <Skeleton className="h-5 w-24 mx-auto" />
              ) : trade ? (
                <span className={`text-base font-bold tabular-nums ${color}`}>
                  {trade.pnl >= 0 ? "+" : ""}
                  {fmtPnl.format(trade.pnl)}
                </span>
              ) : (
                <span className="text-base font-bold text-muted-foreground/80">
                  —
                </span>
              )}
            </div>
            {metricsLoading ? (
              <Skeleton className="h-3 w-24 mx-auto mt-0.5" />
            ) : trade ? (
              <div className="flex flex-col items-center gap-1 mt-1 w-full min-[390px]:grid min-[390px]:grid-cols-[1fr_auto_1fr] min-[390px]:items-center min-[390px]:gap-1.5">
                <div className="hidden min-[390px]:flex justify-end mr-1.5">
                  <Avatar size="sm" className="shrink-0">
                    <AvatarImage
                      src={perpIconSrcFromPair(trade.pair) ?? undefined}
                      alt=""
                    />
                    <AvatarFallback className="bg-muted text-[8px] font-semibold text-foreground/70">
                      {(trade.pair.split("-")[0]?.[0] ?? "?").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex flex-col items-center leading-tight gap-0">
                  <span className="text-muted-foreground font-mono">
                    {trade.pair}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {trade.closed_at && (
                      <span className="text-[11px] text-muted-foreground/80">
                        {new Date(trade.closed_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        &apos;
                        {new Date(trade.closed_at)
                          .getFullYear()
                          .toString()
                          .slice(-2)}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1 py-0.5 h-4 font-bold min-[390px]:hidden",
                        trade.side === "long"
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-destructive/20 bg-destructive/10 text-destructive",
                      )}
                    >
                      {trade.side === "long" ? "LONG" : "SHORT"}
                    </Badge>
                  </div>
                </div>
                <div className="hidden min-[390px]:flex justify-start">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1 py-0.5 h-4 font-bold",
                      trade.side === "long"
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-destructive/20 bg-destructive/10 text-destructive",
                    )}
                  >
                    {trade.side === "long" ? "LONG" : "SHORT"}
                  </Badge>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
