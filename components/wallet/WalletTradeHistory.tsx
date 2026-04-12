"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fromX18BigInt } from "@/types/nado";
import type { TradeMatch } from "@/types/nado";
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

type Props = {
  trades: TradeMatch[];
};

export function WalletTradeHistory({ trades }: Props) {
  const [page, setPage] = useState(0);

  if (trades.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">
            Trade History
          </div>
          <div className="text-sm text-muted-foreground/70 text-center py-6">
            No trades found
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPages = Math.ceil(trades.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const pageTrades = trades.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Trade History
            <span className="ml-1.5 text-muted-foreground/50 normal-case tracking-normal">
              {trades.length} total
            </span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              <span className="tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {[
                  "Time",
                  "Pair",
                  "Direction",
                  "Role",
                  "Price",
                  "Qty",
                  "Realized PnL",
                  "Fees",
                ].map((h, i) => (
                  <TableHead
                    key={h}
                    className={cn(
                      "font-normal text-muted-foreground/70 pb-2",
                      i === 0
                        ? "text-left"
                        : i >= 4
                          ? i === 7
                            ? "text-right pr-2"
                            : "text-right pr-4"
                          : "text-center",
                    )}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    <TableCell className="py-2 pr-2">
                      <div className="flex items-center justify-center gap-2">
                        <Avatar size="sm" className="shrink-0">
                          <AvatarImage
                            src={perpIconSrcFromPair(t.pair)}
                            alt=""
                          />
                          <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground/70">
                            {assetInitial(t.pair)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-[72px] flex-col items-center">
                          <span className="font-mono text-foreground">
                            {t.pair}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {t.isolated ? "Isolated" : "Cross"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle">
                      <div className="flex justify-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-3.5 px-2 py-1 text-[10px] font-bold whitespace-nowrap",
                            hasPnl
                              ? t.side === "short"
                                ? "border-red-400/20 bg-red-400/10 text-red-400"
                                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                              : t.side === "long"
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                                : "border-red-400/20 bg-red-400/10 text-red-400",
                          )}
                        >
                          {hasPnl ? closePositionLabel : t.side.toUpperCase()}
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
            <span className="text-[11px] text-muted-foreground/50 tabular-nums">
              {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, trades.length)}{" "}
              of {trades.length}
            </span>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              <span className="tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page === totalPages - 1}
                className="px-2 py-0.5 rounded border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                »
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
