"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

  const items = [
    {
      label: "Win Rate",
      value: `${stats.win_rate.toFixed(1)}%`,
      color: stats.win_rate >= 50 ? "text-primary" : "text-destructive",
      sub: null,
    },
    {
      label: "Total PnL",
      value: `${isPnlPositive ? "+" : ""}${fmtUsd.format(stats.net_pnl_usd)}`,
      color: isPnlPositive ? "text-primary" : "text-destructive",
      sub: null,
    },
    {
      label: "Volume",
      value: fmtUsd.format(stats.total_volume_usd),
      color: "text-foreground/70",
      sub: null,
    },
    {
      label: "Avg Trade Size",
      color: "text-foreground/70",
      value: fmtUsd.format(stats.avg_trade_size_usd),
      sub: null,
    },
    {
      label: "Total Fees",
      value: fmtUsd.format(stats.total_fees_usd),
      color: "text-destructive",
      sub: null,
    },
    {
      label: "Trades (matches)",
      value: totalTrades.toString(),
      color: "text-foreground/70",
      sub:
        stats.perp_trades_count > 0 || stats.spot_trades_count > 0
          ? `${stats.perp_trades_count} perp · ${stats.spot_trades_count} spot`
          : null,
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
      {items.map(({ label, value, color, sub }) => (
        <Card key={label} className="border-border bg-card min-w-0 flex">
          <CardContent className="p-3 text-center flex flex-col items-center justify-center flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-1">
              {label}
              {!tradesComplete && (
                <span className="inline-block ml-1 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse align-middle" />
              )}
            </div>
            <div className={cn("min-h-7 flex items-center justify-center")}>
              <span className={`text-base font-bold tabular-nums ${color}`}>
                {value}
              </span>
            </div>
            {sub ? (
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
              {trade ? (
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
            {trade ? (
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
