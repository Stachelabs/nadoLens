"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Position, SubaccountHealthEntry } from "@/types/nado";
import { RefreshCw } from "lucide-react";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const fmtPrice3 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const fmtPrice6 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});
const fmtQty4 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const fmtQty5 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 5 });

function fmtQty(value: number): string {
  return Math.abs(value) < 1 ? fmtQty5.format(value) : fmtQty4.format(value);
}

function fmtPrice(value: number): string {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 1) return fmtPrice6.format(value);
  if (abs < 1000) return fmtPrice3.format(value);
  return fmtUsd.format(value);
}

function fmtFunding(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return sign + fmtUsd.format(Math.abs(value));
}

/** "ETH-PERP" → "E", "BTC-PERP" → "B" */
function assetInitial(pair: string): string {
  return (pair.split("-")[0]?.[0] ?? pair[0] ?? "?").toUpperCase();
}

type Props = {
  positions: Position[];
  subaccountHealths?: SubaccountHealthEntry[];
  /** Re-fetch Gateway subaccount_info for live marks / unrealized only. */
  onRefreshUnrealized?: () => void | Promise<void>;
  unrealizedRefreshing?: boolean;
};

export function WalletPositions({
  positions,
  subaccountHealths = [],
  onRefreshUnrealized,
  unrealizedRefreshing = false,
}: Props) {
  const healthBySubaccount = new Map(
    subaccountHealths.map((h) => [h.subaccount.toLowerCase(), h.health_score]),
  );

  const normalizeCrossLabel = (name?: string): string => {
    if (!name) return "main";
    if (name === "default") return "main";
    const m = /^default_(\d+)$/.exec(name);
    if (m) return m[1] ?? "main";
    return name;
  };

  const displaySubaccount = (pos: Position): string => {
    if (!pos.isolated) return normalizeCrossLabel(pos.subaccount_name);
    if (pos.parent_subaccount_name) {
      return normalizeCrossLabel(pos.parent_subaccount_name);
    }
    return `isolated ${pos.subaccount.slice(-4)}`;
  };

  const accountSortRank = (name: string): number => {
    if (name === "main") return 0;
    const n = Number.parseInt(name, 10);
    if (Number.isFinite(n)) return n;
    return Number.MAX_SAFE_INTEGER;
  };

  const orderedPositions = [...positions].sort((a, b) => {
    const aAcc = displaySubaccount(a);
    const bAcc = displaySubaccount(b);
    const byAccount = accountSortRank(aAcc) - accountSortRank(bAcc);
    if (byAccount !== 0) return byAccount;

    // Within each account: cross first, then isolated.
    if (a.isolated !== b.isolated) return a.isolated ? 1 : -1;

    // Stable secondary ordering for readability.
    return a.pair.localeCompare(b.pair);
  });

  const hasMultipleSubaccounts =
    new Set(positions.map((p) => p.subaccount.toLowerCase())).size > 1;

  if (positions.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">
            Open Positions
          </div>
          <div className="text-sm text-muted-foreground/70 text-center py-6">
            No open positions
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3 min-h-6">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Open Positions{" "}
            <span className="ml-1 text-muted-foreground/50">
              ({positions.length})
            </span>
          </div>
          {onRefreshUnrealized ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
              disabled={unrealizedRefreshing}
              onClick={() => void onRefreshUnrealized()}
              aria-label="Refresh mark prices and unrealized PnL"
            >
              <RefreshCw
                className={cn("size-3", unrealizedRefreshing && "animate-spin")}
                aria-hidden
              />
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {[
                  "Pair",
                  ...(hasMultipleSubaccounts ? ["Sub account"] : []),
                  "Health",
                  "Size",
                  "Avg entry",
                  "Mark",
                  "Liq Price",
                  "Unrealized PnL",
                  "Realized",
                  "Funding",
                  "Fees",
                ].map((h) => (
                  <TableHead
                    key={h}
                    className={cn(
                      "font-normal text-muted-foreground/70 pb-2",
                      h === "Health" || h === "Pair" || h === "Sub account"
                        ? "text-center pr-2"
                        : "text-right pr-4",
                    )}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedPositions.map((pos) => {
                const isLong = pos.amount >= 0;
                const pnlColor =
                  pos.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400";
                const fundingColor =
                  (pos.funding_cumulative ?? 0) >= 0
                    ? "text-emerald-400"
                    : "text-red-400";
                const realizedNet =
                  pos.realized_pnl_cumulative != null
                    ? pos.realized_pnl_cumulative -
                      (pos.fees_cumulative ?? 0) +
                      (pos.funding_cumulative ?? 0)
                    : null;
                const realizedColor =
                  realizedNet != null && realizedNet >= 0
                    ? "text-emerald-400"
                    : "text-red-400";
                const nearLiq =
                  pos.liquidation_price > 0 &&
                  Math.abs(pos.mark_price - pos.liquidation_price) /
                    pos.mark_price <
                    0.1;

                const healthScore = healthBySubaccount.get(
                  pos.subaccount.toLowerCase(),
                );
                const healthPct =
                  healthScore != null ? Math.round(healthScore * 100) : null;

                return (
                  <TableRow
                    key={`${pos.subaccount}-${pos.product_id}-${pos.isolated ? "i" : "c"}`}
                    className="border-border/50"
                  >
                    <TableCell className="py-2 pr-2">
                      <div className="flex items-center justify-center gap-2">
                        {/* 1 — Avatar */}
                        <div className="flex shrink-0 items-center justify-center">
                          <Avatar size="sm">
                            <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground/70">
                              {assetInitial(pos.pair)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        {/* 2 — Symbol + type */}
                        <div className="flex flex-col items-center justify-center min-w-[72px]">
                          <span className="font-mono text-foreground">
                            {pos.pair}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {pos.isolated ? "Isolated" : "Cross"}
                          </span>
                        </div>
                        {/* 3 — Long/Short badge */}
                        <div className="inline-flex shrink-0 items-center justify-center p-0 m-0">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[8px] px-0.75 py-0 h-3.5 font-bold",
                              isLong
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                                : "border-red-400/20 bg-red-400/10 text-red-400",
                            )}
                          >
                            {isLong ? "LONG" : "SHORT"}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    {hasMultipleSubaccounts ? (
                      <TableCell className="py-2 pr-2 text-center text-foreground/80">
                        {displaySubaccount(pos)}
                      </TableCell>
                    ) : null}
                    <TableCell className="py-2 pr-2 text-center">
                      {healthPct != null && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] px-2 py-0.5 h-5 font-mono tabular-nums font-semibold",
                            healthPct > 66
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                              : healthPct > 33
                                ? "border-orange-400/30 bg-orange-400/10 text-orange-400"
                                : "border-red-400/30 bg-red-400/10 text-red-400",
                          )}
                        >
                          {healthPct}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {fmtQty(Math.abs(pos.amount))}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {pos.entry_price != null
                        ? fmtPrice(pos.entry_price)
                        : "—"}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground">
                      {fmtPrice(pos.mark_price)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        nearLiq
                          ? "text-red-400 font-bold"
                          : "text-muted-foreground",
                      )}
                    >
                      {pos.liquidation_price > 0
                        ? fmtPrice(pos.liquidation_price)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        pnlColor,
                      )}
                    >
                      {pos.unrealized_pnl >= 0 ? "+" : ""}
                      {fmtUsd.format(pos.unrealized_pnl)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        realizedNet != null
                          ? realizedColor
                          : "text-muted-foreground/40",
                      )}
                    >
                      {realizedNet != null
                        ? `${realizedNet >= 0 ? "+" : ""}${fmtUsd.format(realizedNet)}`
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        pos.funding_cumulative != null
                          ? fundingColor
                          : "text-muted-foreground/40",
                      )}
                    >
                      {pos.funding_cumulative != null
                        ? fmtFunding(pos.funding_cumulative)
                        : "—"}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-muted-foreground/60">
                      {pos.fees_cumulative != null
                        ? fmtUsd.format(pos.fees_cumulative)
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
