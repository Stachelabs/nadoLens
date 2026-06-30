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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { perpIconSrcFromPair } from "@/lib/wallet/perpPairIcon";
import {
  resolveSubaccountFilterDisplay,
  SUBACCOUNT_FILTER_ALL,
} from "@/lib/wallet/subaccountFilter";
import { normalizeSubaccountDisplayName } from "@/lib/wallet/subaccountLabel";
import type { Position, SubaccountHealthEntry } from "@/types/nado";
import { useWalletFundingStore } from "@/store/walletFundingStore";
import { Loader2, RefreshCw } from "lucide-react";
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

const COLUMN_DESCRIPTIONS: Record<string, string> = {
  Pair: "Perp market and margin type (Cross or Isolated).",
  Account: "Cross subaccount this position belongs to.",
  Health:
    "Position health as a percentage. 100% = safe, 0% = at liquidation threshold. Color transitions green → yellow → red.",
  Size: "Base quantity held, with USD notional (size × oracle price) below.",
  "Avg entry":
    "Volume-weighted average entry price from all historical fills for this position.",
  "Oracle Price":
    "Current oracle/mark price used to compute unrealized PnL and liquidation estimates.",
  "Liq Price":
    "Estimated liquidation price. Highlighted in red when within 10% of the current oracle price.",
  "Unrealized PnL":
    "Open position gain/loss at the current oracle price. Not settled until the position is closed.",
  "Realized PnL":
    "Net P&L from closed fills minus trading fees plus funding received, for this position's current session.",
  Funding:
    "Cumulative funding payments. Positive = received (you are short in a positive-rate market), negative = paid.",
  Fees: "Total trading fees paid across all fills (taker + maker). Already deducted in the Realized PnL net figure.",
};

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
  matchedPositionKeys?: string[];
  /** True once snapshot entry prices are applied — gates Unrealized PnL column. */
  snapshotReady?: boolean;
  /** True while Gateway positions are being fetched (Phase 1 in progress). */
  loading?: boolean;
  isOwnWallet?: boolean;
  onClosePosition?: (position: Position) => void;
  closingProductIds?: Set<number>;
};

export function WalletPositions({
  positions,
  crossSubaccountLabels,
  subaccountHealths = [],
  onRefreshUnrealized,
  unrealizedRefreshing = false,
  positionMatchesComplete = true,
  matchedPositionKeys = [],
  snapshotReady = true,
  loading = false,
  isOwnWallet = false,
  onClosePosition,
  closingProductIds,
}: Props) {
  const positionFundingComplete = useWalletFundingStore((s) => s.forActive()?.positionFundingComplete ?? false);
  const fundedSubaccounts = useWalletFundingStore((s) => s.forActive()?.positionFundedSubaccounts ?? []);
  const matchedSet = useMemo(() => new Set(matchedPositionKeys), [matchedPositionKeys]);
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

  if (loading && positions.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-3">
            Open Positions
          </div>
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-1">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <Skeleton className="h-4 flex-1 rounded-sm" />
                <Skeleton className="h-4 w-16 rounded-sm" />
                <Skeleton className="h-4 w-20 rounded-sm" />
                <Skeleton className="h-4 w-20 rounded-sm" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-3">
            Open Positions
          </div>
          <div className="text-sm text-muted-foreground/80 text-center py-6">
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
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
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
          <div className="text-sm text-muted-foreground/80 text-center py-6">
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
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
            Open Positions{" "}
            <span className="ml-1 text-muted-foreground/80">
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
                  "_icon",
                  "Pair",
                  "_badge",
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
                  ...(isOwnWallet ? ["_actions"] : []),
                ].map((h) => {
                  if (h.startsWith("_"))
                    return <TableHead key={h} className="pb-2 px-1" />;
                  const centered =
                    h === "Health" || h === "Pair" || h === "Account";
                  const description = COLUMN_DESCRIPTIONS[h];
                  const label =
                    h === "Realized PnL" &&
                    positionMatchesComplete &&
                    !positionFundingComplete ? (
                      <div className="flex flex-col items-end gap-0.5 leading-tight">
                        <span>{h}</span>
                        <span className="text-[9px] text-muted-foreground/80 flex items-center gap-0.5 font-normal normal-case tracking-normal">
                          <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40 animate-pulse" />
                          Funding loading ...
                        </span>
                      </div>
                    ) : (
                      h
                    );

                  return (
                    <TableHead
                      key={h}
                      className={cn(
                        "font-normal text-muted-foreground/80 pb-2",
                        centered ? "text-center pr-2" : "text-right pr-4",
                        h === "Pair" && "sticky left-0 z-20 bg-card",
                      )}
                    >
                      {description ? (
                        <HoverCard>
                          <HoverCardTrigger className="cursor-help">
                            {label}
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="top"
                            align={centered ? "center" : "end"}
                            className="w-52 text-xs"
                          >
                            <p className="font-medium text-foreground mb-1">
                              {h}
                            </p>
                            <p className="text-muted-foreground leading-relaxed">
                              {description}
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      ) : (
                        label
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedPositions.map((pos) => {
                const isLong = pos.amount >= 0;
                const posMatchKey = `${pos.subaccount}:${pos.product_id}`;
                const posMatchReady = positionMatchesComplete || matchedSet.has(posMatchKey);
                const pnlColor =
                  pos.unrealized_pnl >= 0 ? "text-primary" : "text-destructive";
                const posFundingQuerySub = (pos.isolated
                  ? (pos.parent_subaccount ?? pos.subaccount)
                  : pos.subaccount
                ).toLowerCase();
                const posFundingReady = positionFundingComplete || fundedSubaccounts.includes(posFundingQuerySub);
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
                    <TableCell className="py-2 px-1">
                      <Avatar size="sm">
                        <AvatarImage
                          src={perpIconSrcFromPair(pos.pair) ?? undefined}
                          alt=""
                        />
                        <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground/70">
                          {assetInitial(pos.pair)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="py-2 pr-2 sticky left-0 z-10 bg-card transition-colors group-hover:bg-[color-mix(in_srgb,var(--muted)_50%,var(--card))]">
                      <div className="flex flex-col items-center justify-center min-w-[72px]">
                        <span className="font-mono text-foreground">
                          {pos.pair}
                        </span>
                        <span className="text-[10px] text-muted-foreground/80">
                          {pos.isolated ? "Isolated" : "Cross"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-1">
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
                        <span className="text-[10px] leading-none text-muted-foreground/80">
                          {pos.mark_price > 0
                            ? fmtUsd.format(positionNotionalUsd(pos))
                            : "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {pos.entry_price != null ? (
                        fmtPrice(pos.entry_price)
                      ) : !snapshotReady || !posMatchReady ? (
                        <Skeleton className="h-3.5 w-16 ml-auto rounded-sm" />
                      ) : (
                        "—"
                      )}
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
                        snapshotReady ? pnlColor : "text-muted-foreground/80",
                      )}
                    >
                      {!snapshotReady ? (
                        <Skeleton className="h-3.5 w-16 ml-auto rounded-sm" />
                      ) : (
                        <>
                          {pos.unrealized_pnl >= 0 ? "+" : ""}
                          {fmtUsd.format(pos.unrealized_pnl)}
                        </>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        posMatchReady && realizedNet != null
                          ? realizedColor
                          : "text-muted-foreground/80",
                      )}
                    >
                      {!posMatchReady ? (
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
                        posFundingReady &&
                          pos.funding_cumulative != null
                          ? fundingColor
                          : "text-muted-foreground/80",
                      )}
                    >
                      {!posFundingReady ? (
                        <Skeleton className="h-3.5 w-14 ml-auto rounded-sm" />
                      ) : pos.funding_cumulative != null ? (
                        fmtFunding(pos.funding_cumulative)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-muted-foreground/80">
                      {!posMatchReady ? (
                        <Skeleton className="h-3.5 w-12 ml-auto rounded-sm" />
                      ) : pos.fees_cumulative != null ? (
                        fmtUsd.format(pos.fees_cumulative)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {isOwnWallet && (
                      <TableCell className="py-2 px-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive hover:border-destructive/30"
                          disabled={closingProductIds?.has(pos.product_id) ?? false}
                          onClick={() => onClosePosition?.(pos)}
                        >
                          {closingProductIds?.has(pos.product_id) ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "Close"
                          )}
                        </Button>
                      </TableCell>
                    )}
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
