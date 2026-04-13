"use client";

import { AccountFilterSelect } from "@/components/wallet/AccountFilterSelect";
import {
  resolveSubaccountFilterDisplay,
  SUBACCOUNT_FILTER_ALL,
  tradeMatchesSubaccountFilter,
} from "@/lib/wallet/subaccountFilter";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fromX18BigInt } from "@/types/nado";
import type { TradeMatch } from "@/types/nado";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { nanoStringToMs } from "@/lib/wallet/nanoTime";
import { perpIconSrcFromPair } from "@/lib/wallet/perpPairIcon";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 50;

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
const fmtQty4 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
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

function fmtFee(value: number): string {
  return Math.abs(value) < 1 ? fmtPrice3.format(value) : fmtUsd.format(value);
}

function fmtTime(ts: string): string {
  const ms = nanoStringToMs(ts);
  if (ms === null) return "—";
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function assetInitial(pair: string): string {
  return (pair.split("-")[0]?.[0] ?? pair[0] ?? "?").toUpperCase();
}

const TRADE_TABLE_COLUMNS: readonly { key: string; label: string | null }[] = [
  { key: "time", label: "Time" },
  { key: "icon", label: null },
  { key: "pair", label: "Pair" },
  { key: "direction", label: "Direction" },
  { key: "role", label: "Role" },
  { key: "price", label: "Price" },
  { key: "qty", label: "Qty" },
  { key: "pnl", label: "Realized PnL" },
  { key: "fees", label: "Fees" },
];

const TRADE_TABLE_COL_COUNT = TRADE_TABLE_COLUMNS.length;

type Props = {
  trades: TradeMatch[];
  crossSubaccountLabels: string[];
  /** Maps subaccount hex (lowercase) → display label (main, 1, …). */
  subaccountLabelByHex: Map<string, string>;
  /** Incremental matches fetch (newer than newest cached trade). */
  onRefreshTrades?: () => void | Promise<void>;
  tradesRefreshing?: boolean;
  /** When false and no trades yet, show skeleton placeholder rows. */
  globalMatchesComplete?: boolean;
};

export function WalletTradeHistory({
  trades,
  crossSubaccountLabels,
  subaccountLabelByHex,
  onRefreshTrades,
  tradesRefreshing = false,
  globalMatchesComplete = true,
}: Props) {
  const [page, setPage] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState(SUBACCOUNT_FILTER_ALL);

  const displayFilter = useMemo(
    () => resolveSubaccountFilterDisplay(selectedFilter, crossSubaccountLabels),
    [selectedFilter, crossSubaccountLabels],
  );

  const accountFilterOptions = useMemo(
    () => [SUBACCOUNT_FILTER_ALL, ...crossSubaccountLabels],
    [crossSubaccountLabels],
  );

  const filteredTrades = useMemo(
    () =>
      trades.filter((t) =>
        tradeMatchesSubaccountFilter(t, subaccountLabelByHex, displayFilter),
      ),
    [trades, subaccountLabelByHex, displayFilter],
  );

  if (trades.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">
            Trade History
          </div>
          {!globalMatchesComplete ? (
            <div className="flex flex-col gap-2 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground/70 text-center py-6">
              No trades found
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Once we have any trades, render the table even if global pagination is still running.

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / PAGE_SIZE));
  const maxPage = Math.max(0, totalPages - 1);
  const safePage = Math.min(page, maxPage);
  const pageStart = safePage * PAGE_SIZE;
  const pageTrades = filteredTrades.slice(pageStart, pageStart + PAGE_SIZE);

  const handleSubaccountFilter = (label: string) => {
    setSelectedFilter(label);
    setPage(0);
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3 min-h-6">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Trade History
            <span className="ml-1.5 text-muted-foreground/50 normal-case tracking-normal">
              {filteredTrades.length} total
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AccountFilterSelect
              options={accountFilterOptions}
              value={displayFilter}
              onValueChange={handleSubaccountFilter}
            />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <button
                type="button"
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0 || filteredTrades.length === 0}
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              <span className="tabular-nums">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(maxPage, safePage + 1))}
                disabled={
                  safePage === totalPages - 1 || filteredTrades.length === 0
                }
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
            </div>
            {onRefreshTrades ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                disabled={tradesRefreshing}
                onClick={() => void onRefreshTrades()}
                aria-label="Fetch new trades since last sync"
              >
                <RefreshCw
                  className={cn("size-3", tradesRefreshing && "animate-spin")}
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
                {TRADE_TABLE_COLUMNS.map((col, i) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "font-normal text-muted-foreground/70 pb-2",
                      i === 0
                        ? "text-left"
                        : i >= 5
                          ? i === 8
                            ? "text-right pr-2"
                            : "text-right pr-4"
                          : "text-center",
                      col.key === "icon" && "w-12 px-1",
                    )}
                  >
                    {col.label === null ? (
                      <span className="sr-only">Asset icon</span>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrades.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={TRADE_TABLE_COL_COUNT}
                    className="py-8 text-center text-sm text-muted-foreground/70"
                  >
                    No trades for this account filter
                  </TableCell>
                </TableRow>
              ) : null}
              {pageTrades.map((t, i) => {
                const pnl = fromX18BigInt(t.realized_pnl);
                const price = fromX18BigInt(t.price);
                const qty = Math.abs(fromX18BigInt(t.amount));
                const fee = fromX18BigInt(t.fee);
                const hasPnl = Math.abs(pnl) > 0.001;
                // Fill side is opposite of the position being reduced on close:
                // long fill → closing a short | short fill → closing a long
                const closePositionLabel =
                  t.side === "long" ? "CLOSE SHORT" : "CLOSE LONG";
                const openPositionLabel =
                  t.side === "long" ? "OPEN LONG" : "OPEN SHORT";
                const directionLabel = hasPnl
                  ? closePositionLabel
                  : openPositionLabel;
                const pnlColor = pnl >= 0 ? "text-emerald-400" : "text-red-400";
                const role =
                  t.is_taker === true
                    ? "TAKER"
                    : t.is_taker === false
                      ? "MAKER"
                      : "UNKNOWN";

                return (
                  <TableRow
                    key={pageStart + i}
                    className="border-border/50 hover:bg-muted/20"
                  >
                    <TableCell className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {fmtTime(t.timestamp)}
                    </TableCell>
                    <TableCell className="py-2 px-1 align-middle">
                      <div className="flex justify-center">
                        <Avatar size="sm" className="shrink-0">
                          <AvatarImage
                            src={perpIconSrcFromPair(t.pair)}
                            alt=""
                          />
                          <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground/70">
                            {assetInitial(t.pair)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle">
                      <div className="flex min-w-[72px] flex-col items-center justify-center">
                        <span className="font-mono text-foreground">{t.pair}</span>
                        <span className="text-[10px] text-muted-foreground/70">
                          {t.isolated ? "Isolated" : "Cross"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle">
                      <div className="flex justify-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2 py-1 text-[10px] font-bold whitespace-nowrap",
                            t.side === "long"
                              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                              : "border-red-400/20 bg-red-400/10 text-red-400",
                          )}
                        >
                          {directionLabel}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold",
                          role === "TAKER"
                            ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
                            : role === "MAKER"
                              ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                              : "border-muted-foreground/20 bg-muted/10 text-muted-foreground",
                        )}
                      >
                        {role}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {fmtPrice(price)}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {fmtQty(qty)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        hasPnl ? pnlColor : "text-muted-foreground/70",
                      )}
                    >
                      {hasPnl
                        ? `${pnl >= 0 ? "+" : ""}${fmtUsd.format(pnl)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                      {fmtFee(fee)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground/50 tabular-nums">
            {filteredTrades.length === 0 ? (
              <>0 of 0</>
            ) : (
              <>
                {pageStart + 1}–
                {Math.min(pageStart + PAGE_SIZE, filteredTrades.length)} of{" "}
                {filteredTrades.length}
              </>
            )}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <button
              type="button"
              onClick={() => setPage(0)}
              disabled={safePage === 0 || filteredTrades.length === 0}
              className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0 || filteredTrades.length === 0}
              className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ←
            </button>
            <span className="tabular-nums">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(maxPage, safePage + 1))}
              disabled={
                safePage === totalPages - 1 || filteredTrades.length === 0
              }
              className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages - 1)}
              disabled={
                safePage === totalPages - 1 || filteredTrades.length === 0
              }
              className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              »
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
