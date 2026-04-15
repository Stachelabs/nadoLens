"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountFilterSelect } from "@/components/wallet/AccountFilterSelect";
import { cn } from "@/lib/utils";
import { perpIconSrcFromPair } from "@/lib/wallet/perpPairIcon";
import {
  resolveSubaccountFilterDisplay,
  SUBACCOUNT_FILTER_ALL,
} from "@/lib/wallet/subaccountFilter";
import { normalizeSubaccountDisplayName } from "@/lib/wallet/subaccountLabel";
import type { Position, SubaccountHealthEntry } from "@/types/nado";
import { RefreshCw } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";

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

/** Quote notional (USD): |base size| × mark/oracle price — see Nado notional / perp balance docs. */
function positionNotionalUsd(pos: Position): number {
  return Math.abs(pos.amount) * pos.mark_price;
}

function fmtPrice(value: number): string {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 1) return fmtPrice6.format(value);
  if (abs < 1000) return fmtPrice3.format(value);
  return fmtUsd.format(value);
}

/** Maps 0–100 health % to a rainbow HSL color (green → yellow → red). */
function healthStyle(pct: number): React.CSSProperties {
  const hue = Math.round((pct / 100) * 142);
  const color = `hsl(${hue}, 65%, 55%)`;
  return {
    color,
    borderColor: `hsl(${hue}, 65%, 35%, 0.35)`,
    backgroundColor: `hsl(${hue}, 65%, 45%, 0.12)`,
  };
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
  /** Cross subaccount labels with non-zero tracked spot (same as Spot Balances badges). */
  crossSubaccountLabels: string[];
  subaccountHealths?: SubaccountHealthEntry[];
  /** Re-fetch Gateway subaccount_info for live marks / unrealized only. */
  onRefreshUnrealized?: () => void | Promise<void>;
  unrealizedRefreshing?: boolean;
  /** True once position-scoped matches (Phase 2a) are done — enables Realized PnL + Fees. */
  positionMatchesComplete?: boolean;
  /** True once position-scoped funding (Phase 2b) is done — enables Funding column. */
  positionFundingComplete?: boolean;
};

export function WalletPositions({
  positions,
  crossSubaccountLabels,
  subaccountHealths = [],
  onRefreshUnrealized,
  unrealizedRefreshing = false,
  positionMatchesComplete = true,
  positionFundingComplete = true,
}: Props) {
  const [selectedFilter, setSelectedFilter] = useState(SUBACCOUNT_FILTER_ALL);

  const displayFilter = useMemo(
    () => resolveSubaccountFilterDisplay(selectedFilter, crossSubaccountLabels),
    [selectedFilter, crossSubaccountLabels],
  );

  const accountFilterOptions = useMemo(
    () => [SUBACCOUNT_FILTER_ALL, ...crossSubaccountLabels],
    [crossSubaccountLabels],
  );

  const displaySubaccount = useCallback((pos: Position): string => {
    if (!pos.isolated)
      return normalizeSubaccountDisplayName(pos.subaccount_name);
    if (pos.parent_subaccount_name) {
      return normalizeSubaccountDisplayName(pos.parent_subaccount_name);
    }
    return `isolated ${pos.subaccount.slice(-4)}`;
  }, []);

  const filteredPositions = useMemo(() => {
    if (displayFilter === SUBACCOUNT_FILTER_ALL) return positions;
    return positions.filter((p) => displaySubaccount(p) === displayFilter);
  }, [positions, displayFilter, displaySubaccount]);

  const accountSortRank = (name: string): number => {
    if (name === "main") return 0;
    const n = Number.parseInt(name, 10);
    if (Number.isFinite(n)) return n;
    return Number.MAX_SAFE_INTEGER;
  };

  const orderedPositions = useMemo(() => {
    return [...filteredPositions].sort((a, b) => {
      const aAcc = displaySubaccount(a);
      const bAcc = displaySubaccount(b);
      const byAccount = accountSortRank(aAcc) - accountSortRank(bAcc);
      if (byAccount !== 0) return byAccount;

      if (a.isolated !== b.isolated) return a.isolated ? 1 : -1;

      const byProductId = a.product_id - b.product_id;
      if (byProductId !== 0) return byProductId;

      return a.pair.localeCompare(b.pair);
    });
  }, [filteredPositions, displaySubaccount]);

  const healthBySubaccount = new Map(
    subaccountHealths.map((h) => [h.subaccount.toLowerCase(), h.health_score]),
  );

  const hasMultipleSubaccounts =
    new Set(filteredPositions.map((p) => p.subaccount.toLowerCase())).size > 1;

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

  if (filteredPositions.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3 min-h-6">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
              Open Positions
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <AccountFilterSelect
                options={accountFilterOptions}
                value={displayFilter}
                onValueChange={setSelectedFilter}
              />
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
                    className={cn(
                      "size-3",
                      unrealizedRefreshing && "animate-spin",
                    )}
                    aria-hidden
                  />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="text-sm text-muted-foreground/70 text-center py-6">
            No open position for this subaccount
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3 min-h-6">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Open Positions{" "}
            <span className="ml-1 text-muted-foreground/50">
              ({orderedPositions.length})
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AccountFilterSelect
              options={accountFilterOptions}
              value={displayFilter}
              onValueChange={setSelectedFilter}
            />
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
                  className={cn(
                    "size-3",
                    unrealizedRefreshing && "animate-spin",
                  )}
                  aria-hidden
                />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {[
                  "Pair",
                  ...(hasMultipleSubaccounts ? ["Account"] : []),
                  "Health",
                  "Size",
                  "Avg entry",
                  "Oracle Price",
                  "Liq Price",
                  "Unrealized PnL",
                  "Realized PnL",
                  "Funding",
                  "Fees",
                ].map((h) => (
                  <TableHead
                    key={h}
                    className={cn(
                      "font-normal text-muted-foreground/70 pb-2",
                      h === "Health" || h === "Pair" || h === "Account"
                        ? "text-center pr-2"
                        : "text-right pr-4",
                    )}
                  >
                    {h === "Realized PnL" &&
                    positionMatchesComplete &&
                    !positionFundingComplete ? (
                      <div className="flex flex-col items-end gap-0.5 leading-tight">
                        <span>Realized PnL</span>
                        <span className="text-[9px] text-muted-foreground/50 flex items-center gap-0.5 font-normal normal-case tracking-normal">
                          <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40 animate-pulse" />
                          Funding loading ...
                        </span>
                      </div>
                    ) : (
                      h
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedPositions.map((pos) => {
                const isLong = pos.amount >= 0;
                const pnlColor =
                  pos.unrealized_pnl >= 0 ? "text-primary" : "text-destructive";
                const fundingColor =
                  (pos.funding_cumulative ?? 0) >= 0
                    ? "text-primary"
                    : "text-destructive";
                const realizedNet =
                  pos.realized_pnl_cumulative != null
                    ? pos.realized_pnl_cumulative -
                      (pos.fees_cumulative ?? 0) +
                      (pos.funding_cumulative ?? 0)
                    : null;
                const realizedColor =
                  realizedNet != null && realizedNet >= 0
                    ? "text-primary"
                    : "text-destructive";
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
                      <div className="flex items-center justify-evenly">
                        {/* 1 — Avatar */}
                        <div className="flex shrink-0 items-center justify-center pr-1.25">
                          <Avatar size="sm">
                            <AvatarImage
                              src={perpIconSrcFromPair(pos.pair)}
                              alt=""
                            />
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
                        <div className="inline-flex shrink-0 items-center justify-center pl-1.25">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1 py-0.5 h-4 font-bold",
                              isLong
                                ? "border-primary/20 bg-primary/10 text-primary"
                                : "border-destructive/20 bg-destructive/10 text-destructive",
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
                          className="text-[11px] px-2 py-0.5 h-5 font-mono tabular-nums font-semibold"
                          style={healthStyle(healthPct)}
                        >
                          {healthPct}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      <div className="flex flex-col items-end gap-1.25">
                        <span className="leading-none">
                          {fmtQty(Math.abs(pos.amount))}
                        </span>
                        <span className="text-[10px] leading-none text-muted-foreground/70">
                          {pos.mark_price > 0
                            ? fmtUsd.format(positionNotionalUsd(pos))
                            : "—"}
                        </span>
                      </div>
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
                          ? "text-destructive font-bold"
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
                        positionMatchesComplete && realizedNet != null
                          ? realizedColor
                          : "text-muted-foreground/40",
                      )}
                    >
                      {!positionMatchesComplete ? (
                        <Skeleton className="h-3.5 w-16 ml-auto rounded-sm" />
                      ) : realizedNet != null ? (
                        `${realizedNet >= 0 ? "+" : ""}${fmtUsd.format(realizedNet)}`
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        positionFundingComplete &&
                          pos.funding_cumulative != null
                          ? fundingColor
                          : "text-muted-foreground/40",
                      )}
                    >
                      {!positionFundingComplete ? (
                        <Skeleton className="h-3.5 w-14 ml-auto rounded-sm" />
                      ) : pos.funding_cumulative != null ? (
                        fmtFunding(pos.funding_cumulative)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-muted-foreground/60">
                      {!positionMatchesComplete ? (
                        <Skeleton className="h-3.5 w-12 ml-auto rounded-sm" />
                      ) : pos.fees_cumulative != null ? (
                        fmtUsd.format(pos.fees_cumulative)
                      ) : (
                        "—"
                      )}
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
