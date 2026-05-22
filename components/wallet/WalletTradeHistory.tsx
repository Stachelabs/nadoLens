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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  aggregateByDigest,
  type AggregatedTrade,
} from "@/lib/wallet/aggregateTrades";

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

function fmtDate(ts: string): string {
  const ms = nanoStringToMs(ts);
  if (ms === null) return "—";
  const d = new Date(ms);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function fmtHour(ts: string): string {
  const ms = nanoStringToMs(ts);
  if (ms === null) return "";
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function assetInitial(pair: string): string {
  return (pair.split("-")[0]?.[0] ?? pair[0] ?? "?").toUpperCase();
}

type DisplayRow = {
  key: string;
  timestamp: string;
  pair: string;
  side: "long" | "short";
  is_taker?: boolean;
  isolated?: boolean;
  price: number;
  qty: number;
  pnl: number;
  fee: number;
  hasPnl: boolean;
  fillCount: number;
  fills?: TradeMatch[];
};

function tradeToRow(t: TradeMatch, i: number): DisplayRow {
  const pnl = fromX18BigInt(t.realized_pnl);
  return {
    key: `ind-${i}`,
    timestamp: t.timestamp,
    pair: t.pair,
    side: t.side,
    is_taker: t.is_taker,
    isolated: t.isolated,
    price: fromX18BigInt(t.price),
    qty: Math.abs(fromX18BigInt(t.amount)),
    pnl,
    fee: Math.abs(fromX18BigInt(t.fee)),
    hasPnl: Math.abs(pnl) > 0.001,
    fillCount: 1,
  };
}

function aggToRow(a: AggregatedTrade): DisplayRow {
  return {
    key: a.digest,
    timestamp: a.timestamp,
    pair: a.pair,
    side: a.side,
    is_taker: a.is_taker,
    isolated: a.isolated,
    price: a.price,
    qty: a.amount,
    pnl: a.realized_pnl,
    fee: a.fee,
    hasPnl: Math.abs(a.realized_pnl) > 0.001 || a.closed_amount > 0,
    fillCount: a.fillCount,
    fills: a.fillCount > 1 ? a.fills : undefined,
  };
}

type ViewMode = "aggregated" | "individual";

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
  const [viewMode, setViewMode] = useState<ViewMode>("aggregated");
  const [selectedFilter, setSelectedFilter] = useState(SUBACCOUNT_FILTER_ALL);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const displayRows = useMemo(
    () =>
      viewMode === "aggregated"
        ? aggregateByDigest(filteredTrades).map(aggToRow)
        : filteredTrades.map(tradeToRow),
    [filteredTrades, viewMode],
  );

  if (trades.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">
            Trade History
          </div>
          {!globalMatchesComplete ? (
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
                          col.key === "time" && "w-0 whitespace-nowrap",
                          col.key === "icon" && "w-12 px-1",
                          col.key === "pair" && "sticky left-0 z-20 bg-card",
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
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell className="py-2.5 pr-4">
                        <Skeleton className="h-3 w-24 rounded" />
                      </TableCell>
                      <TableCell className="py-2.5 px-1">
                        <div className="flex justify-center">
                          <Skeleton className="h-7 w-7 rounded-full" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Skeleton className="h-3 w-16 rounded" />
                          <Skeleton className="h-2.5 w-10 rounded" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <div className="flex justify-center">
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <div className="flex justify-center">
                          <Skeleton className="h-5 w-14 rounded-full" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 pr-4">
                        <div className="flex justify-end">
                          <Skeleton className="h-3 w-16 rounded" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 pr-4">
                        <div className="flex justify-end">
                          <Skeleton className="h-3 w-12 rounded" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 pr-4">
                        <div className="flex justify-end">
                          <Skeleton className="h-3 w-14 rounded" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex justify-end">
                          <Skeleton className="h-3 w-12 rounded" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const maxPage = Math.max(0, totalPages - 1);
  const safePage = Math.min(page, maxPage);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = displayRows.slice(pageStart, pageStart + PAGE_SIZE);

  const handleSubaccountFilter = (label: string) => {
    setSelectedFilter(label);
    setPage(0);
  };

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setPage(0);
    setExpandedRows(new Set());
  };

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex gap-3 mb-3 sm:items-center">
          <div className="flex flex-col justify-between sm:flex-row sm:items-center sm:gap-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 pt-1 sm:pt-0">
              Trade History
              <span className="ml-1.5 text-muted-foreground/50 normal-case tracking-normal">
                {displayRows.length}
                {viewMode === "aggregated" ? " orders" : " fills"}
              </span>
            </div>
            <Tabs
              value={viewMode}
              defaultValue="Aggregated"
              onValueChange={(v) => handleViewMode(v as ViewMode)}
              className="flex-row"
            >
              <TabsList className="h-7">
                <TabsTrigger
                  value="aggregated"
                  className="px-2.5 py-0.5 text-[10px] data-active:text-foreground/70 dark:data-active:border-border/50 focus-visible:ring-ring/30"
                >
                  Aggregated
                </TabsTrigger>
                <TabsTrigger
                  value="individual"
                  className="px-2.5 py-0.5 text-[10px] data-active:text-foreground/70 dark:data-active:border-border/50 focus-visible:ring-ring/30"
                >
                  Individual
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="ml-auto flex items-start gap-0.5 sm:items-center sm:gap-2">
            <div className="flex flex-col items-center justify-between sm:flex-row gap-1.5 pb-1 sm:pb-0 sm:gap-2">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0 || displayRows.length === 0}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3" />
                </Button>
                <span className="tabular-nums">
                  {safePage + 1}/{totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => setPage(Math.min(maxPage, safePage + 1))}
                  disabled={
                    safePage === totalPages - 1 || displayRows.length === 0
                  }
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3" />
                </Button>
              </div>
              <AccountFilterSelect
                options={accountFilterOptions}
                value={displayFilter}
                className="w-full max-w-none sm:w-auto sm:max-w-30"
                onValueChange={handleSubaccountFilter}
              />
            </div>
            {onRefreshTrades ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground"
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
                        ? "text-center"
                        : i >= 5
                          ? i === 8
                            ? "text-right pr-2"
                            : "text-right pr-4"
                          : "text-center",
                      col.key === "time" && "w-0 whitespace-nowrap",
                      col.key === "icon" && "w-12 px-1",
                      col.key === "pair" && "sticky left-0 z-20 bg-card",
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
              {displayRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={TRADE_TABLE_COL_COUNT}
                    className="py-8 text-center text-sm text-muted-foreground/70"
                  >
                    No trades for this account filter
                  </TableCell>
                </TableRow>
              ) : null}
              {pageRows.flatMap((row) => {
                const closePositionLabel =
                  row.side === "long" ? "CLOSE SHORT" : "CLOSE LONG";
                const openPositionLabel =
                  row.side === "long" ? "OPEN LONG" : "OPEN SHORT";
                const directionLabel = row.hasPnl
                  ? closePositionLabel
                  : openPositionLabel;
                const pnlColor =
                  row.pnl >= 0 ? "text-primary" : "text-destructive";
                const role =
                  row.is_taker === true
                    ? "TAKER"
                    : row.is_taker === false
                      ? "MAKER"
                      : "UNKNOWN";
                const expandable = viewMode === "aggregated" && !!row.fills;
                const expanded = expandable && expandedRows.has(row.key);

                const parentRow = (
                  <TableRow
                    key={row.key}
                    className={cn(
                      "border-border/50",
                      expandable
                        ? "cursor-pointer hover:bg-muted/30"
                        : "hover:bg-muted/20",
                      expanded && "bg-muted/10",
                    )}
                    onClick={expandable ? () => toggleRow(row.key) : undefined}
                  >
                    <TableCell className="py-0 pr-4 text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {expandable && (
                          <ChevronDown
                            className={cn(
                              "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
                              !expanded && "-rotate-90",
                            )}
                          />
                        )}
                        <span className="sm:hidden text-[11px] leading-tight text-center">
                          <span>{fmtDate(row.timestamp)}</span>
                          <br />
                          <span>{fmtHour(row.timestamp)}</span>
                        </span>
                        <span className="hidden sm:inline">
                          {fmtDate(row.timestamp)} {fmtHour(row.timestamp)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-1 align-middle">
                      <div className="flex justify-center">
                        <Avatar size="sm" className="shrink-0">
                          <AvatarImage
                            src={perpIconSrcFromPair(row.pair) ?? undefined}
                            alt=""
                          />
                          <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground/70">
                            {assetInitial(row.pair)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle sticky left-0 z-10 bg-card">
                      <div className="flex min-w-[72px] flex-col items-center justify-center">
                        <span className="font-mono text-foreground">
                          {row.pair}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70">
                          {row.isolated ? "Isolated" : "Cross"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle">
                      <div className="flex justify-center gap-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2 py-1 text-[10px] font-bold whitespace-nowrap",
                            row.side === "long"
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-destructive/20 bg-destructive/10 text-destructive",
                          )}
                        >
                          {directionLabel}
                        </Badge>
                        {row.fillCount > 1 && (
                          <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground">
                            ×{row.fillCount}
                          </span>
                        )}
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
                      {fmtPrice(row.price)}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right tabular-nums text-foreground/70">
                      {fmtQty(row.qty)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        row.hasPnl ? pnlColor : "text-muted-foreground/70",
                      )}
                    >
                      {row.hasPnl
                        ? `${row.pnl >= 0 ? "+" : ""}${fmtUsd.format(row.pnl)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                      {fmtFee(row.fee)}
                    </TableCell>
                  </TableRow>
                );

                if (!expanded || !row.fills) return [parentRow];

                const subRows = row.fills.map((fill, fi) => {
                  const fillPnl = fromX18BigInt(fill.realized_pnl);
                  const fillHasPnl = Math.abs(fillPnl) > 0.001;
                  const fillCloseLabel =
                    fill.side === "long" ? "CLOSE SHORT" : "CLOSE LONG";
                  const fillOpenLabel =
                    fill.side === "long" ? "OPEN LONG" : "OPEN SHORT";
                  const fillDir = fillHasPnl ? fillCloseLabel : fillOpenLabel;
                  const fillPnlColor =
                    fillPnl >= 0 ? "text-primary/90" : "text-destructive/90";
                  const fillRole =
                    fill.is_taker === true
                      ? "TAKER"
                      : fill.is_taker === false
                        ? "MAKER"
                        : "UNKNOWN";

                  return (
                    <TableRow
                      key={`${row.key}-fill-${fi}`}
                      className="border-border/20 bg-muted/5 hover:bg-muted/15"
                    >
                      <TableCell className="py-1.5 pr-4 text-muted-foreground/90 whitespace-nowrap text-[11px] sm:text-xs">
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-3" />
                          <span className="text-muted-foreground/30">├</span>
                          <span>
                            <span className="sm:hidden leading-tight text-center">
                              <span>{fmtDate(fill.timestamp)}</span>
                              <br />
                              <span>{fmtHour(fill.timestamp)}</span>
                            </span>
                            <span className="hidden sm:inline">
                              {fmtDate(fill.timestamp)}{" "}
                              {fmtHour(fill.timestamp)}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 px-1" />
                      <TableCell className="py-1.5 text-center align-middle sticky left-0 z-10 bg-card">
                        <span className="text-[11px] sm:text-xs text-muted-foreground/90 font-mono">
                          fill {fi + 1}/{row.fillCount}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 text-center align-middle">
                        <span
                          className={cn(
                            "text-[11px] sm:text-xs",
                            fill.side === "long"
                              ? "text-primary/90"
                              : "text-destructive/90",
                          )}
                        >
                          {fillDir}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        <span className="text-[11px] sm:text-xs text-muted-foreground/90">
                          {fillRole}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 pr-4 text-right tabular-nums text-muted-foreground/90 text-[11px] sm:text-xs">
                        {fmtPrice(fromX18BigInt(fill.price))}
                      </TableCell>
                      <TableCell className="py-1.5 pr-4 text-right tabular-nums text-muted-foreground/90 text-[11px] sm:text-xs">
                        {fmtQty(Math.abs(fromX18BigInt(fill.amount)))}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-1.5 pr-4 text-right tabular-nums text-[11px] sm:text-xs",
                          fillHasPnl
                            ? fillPnlColor
                            : "text-muted-foreground/90",
                        )}
                      >
                        {fillHasPnl
                          ? `${fillPnl >= 0 ? "+" : ""}${fmtUsd.format(fillPnl)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground/90 text-[11px] sm:text-xs">
                        {fmtFee(Math.abs(fromX18BigInt(fill.fee)))}
                      </TableCell>
                    </TableRow>
                  );
                });

                return [parentRow, ...subRows];
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground/50 tabular-nums">
            {displayRows.length === 0 ? (
              <>0 of 0</>
            ) : (
              <>
                {pageStart + 1}–
                {Math.min(pageStart + PAGE_SIZE, displayRows.length)} of{" "}
                {displayRows.length}
              </>
            )}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setPage(0)}
              disabled={safePage === 0 || displayRows.length === 0}
              aria-label="First page"
            >
              «
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0 || displayRows.length === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="tabular-nums">
              {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setPage(Math.min(maxPage, safePage + 1))}
              disabled={safePage === totalPages - 1 || displayRows.length === 0}
              aria-label="Next page"
            >
              <ChevronRight className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage === totalPages - 1 || displayRows.length === 0}
              aria-label="Last page"
            >
              »
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
