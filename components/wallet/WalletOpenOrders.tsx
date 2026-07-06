"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { productName } from "@/store/pairsStore";
import { fromX18BigInt } from "@/types/nado";
import type { NadoOrder, TriggerOrderInfo, TriggerOrderStatus } from "@/lib/schemas/nado";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LoadingShimmer } from "@/components/ui/LoadingShimmer";
import { CircleHelp, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import React, { useMemo, useState } from "react";

function OpenOrdersHelpTooltip({ has1CT }: { has1CT?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label="What are open orders?"
      >
        <CircleHelp className="size-3" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-left leading-relaxed">
        {has1CT
          ? "1-Click Trading detected. Enable Live Orders to auto-refresh your TP/SL and TWAP orders silently — one signature per session, no more popups."
          : "Shows your limit, TP/SL, and TWAP orders. Enable 1-Click Trading on Nado to unlock silent auto-refresh."}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Unified row type ──────────────────────────────────────────────────────

type LimitOrderRow = {
  kind: "limit";
  key: string;
  productId: number;
  digest: string;
  subaccountLabel: string;
  subaccountName: string;
  orderType: string;
  isLong: boolean;
  price: number;
  absTotal: number;
  absFilled: number;
  orderValue: number;
  reduceOnly: boolean;
  placedAt: number;
  triggerLabel?: undefined;
  triggerDetail?: undefined;
  statusLabel?: undefined;
};

type TriggerOrderRow = {
  kind: "trigger";
  key: string;
  productId: number;
  digest: string | null;
  subaccountLabel: string;
  subaccountName: string;
  orderType: string;
  isLong: boolean;
  price: number;
  absTotal: number;
  absFilled: number;
  orderValue: number;
  reduceOnly: boolean;
  placedAt: number;
  triggerLabel: string;
  triggerDetail: string;
  statusLabel: string;
  statusColor: string;
};

type UnifiedRow = LimitOrderRow | TriggerOrderRow;

// ─── Props ──────────────────────────────────────────────────────────────────

type OpenOrderEntry = NadoOrder & { subaccountLabel: string };
type TriggerOrderEntry = TriggerOrderInfo & { subaccountLabel: string };

type CancelOrderParams = {
  kind: "limit" | "trigger";
  productId: number;
  digest: string;
  subaccountName: string;
  pair: string;
};

type Props = {
  orders: OpenOrderEntry[];
  triggerOrders: TriggerOrderEntry[];
  crossSubaccountLabels: string[];
  onRefresh: () => void;
  refreshing: boolean;
  loading: boolean;
  signatureNeeded: boolean;
  onRequestSignature: () => void;
  triggerLoading: boolean;
  isOwnWallet?: boolean;
  onCancelOrder?: (params: CancelOrderParams) => void;
  cancellingKeys?: Set<string>;
  streamConnected?: boolean;
  has1CT?: boolean;
  linkedSignerActive?: boolean;
};

// ─── Formatters ─────────────────────────────────────────────────────────────

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

function assetInitial(pair: string): string {
  return (pair.split("-")[0]?.[0] ?? pair[0] ?? "?").toUpperCase();
}

const ENTIRE_POSITION_THRESHOLD = 999_999_999;

function isReduceOnly(appendix?: string): boolean {
  if (!appendix) return false;
  try {
    return (BigInt(appendix) & (BigInt(1) << BigInt(11))) !== BigInt(0);
  } catch {
    return false;
  }
}

function getOrderExecutionType(appendix?: string): "default" | "fok" | "ioc" | "post_only" {
  if (!appendix) return "default";
  try {
    const bits = (BigInt(appendix) >> BigInt(9)) & BigInt(0b11);
    if (bits === BigInt(1)) return "fok";
    if (bits === BigInt(2)) return "ioc";
    if (bits === BigInt(3)) return "post_only";
    return "default";
  } catch {
    return "default";
  }
}

function isEntirePosition(absTotal: number): boolean {
  return absTotal > ENTIRE_POSITION_THRESHOLD;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  default: "Limit",
  ioc: "IOC",
  fok: "FOK",
  post_only: "Post Only",
};

function isTriggerAbove(trigger: TriggerOrderInfo["order"]["trigger"]): boolean | null {
  if (!("price_trigger" in trigger)) return null;
  const req = trigger.price_trigger.price_requirement;
  if ("oracle_price_above" in req || "last_price_above" in req || "mid_price_above" in req) return true;
  if ("oracle_price_below" in req || "last_price_below" in req || "mid_price_below" in req) return false;
  return null;
}

function getTriggerTypeLabel(
  trigger: TriggerOrderInfo["order"]["trigger"],
  amount: number,
  appendix?: string,
): string {
  if ("time_trigger" in trigger) return "TWAP";

  const above = isTriggerAbove(trigger);
  if (above === null) return "Trigger";

  const isSell = amount < 0;
  const isTP = (isSell && above) || (!isSell && !above);

  const execType = getOrderExecutionType(appendix);
  const isMarket = execType === "ioc" || execType === "fok";

  const kind = isTP ? "TP" : "SL";
  const exec = isMarket ? "Market" : "Limit";
  return `${kind} ${exec}`;
}

function getTriggerDetail(trigger: TriggerOrderInfo["order"]["trigger"]): string {
  if ("price_trigger" in trigger) {
    const req = trigger.price_trigger.price_requirement;
    if ("oracle_price_above" in req) return `Oracle > ${fmtPrice(fromX18BigInt(req.oracle_price_above))}`;
    if ("oracle_price_below" in req) return `Oracle < ${fmtPrice(fromX18BigInt(req.oracle_price_below))}`;
    if ("last_price_above" in req) return `Last > ${fmtPrice(fromX18BigInt(req.last_price_above))}`;
    if ("last_price_below" in req) return `Last < ${fmtPrice(fromX18BigInt(req.last_price_below))}`;
    if ("mid_price_above" in req) return `Mid > ${fmtPrice(fromX18BigInt(req.mid_price_above))}`;
    if ("mid_price_below" in req) return `Mid < ${fmtPrice(fromX18BigInt(req.mid_price_below))}`;
    return "Price trigger";
  }
  if ("time_trigger" in trigger) {
    const secs = trigger.time_trigger.interval;
    if (secs >= 3600) return `Every ${Math.round(secs / 3600)}h`;
    return `Every ${Math.round(secs / 60)}m`;
  }
  return "";
}

function getStatusLabel(status: TriggerOrderStatus): string {
  if (status === "waiting_price") return "Waiting";
  if (status === "waiting_dependency") return "Pending";
  if (status === "triggering") return "Triggering";
  if (typeof status === "object") {
    if ("twap_executing" in status) return `TWAP ${status.twap_executing.current_execution}/${status.twap_executing.total_executions}`;
    if ("twap_completed" in status) return `Done ${status.twap_completed.executed}/${status.twap_completed.total}`;
    if ("cancelled" in status) return "Cancelled";
    if ("triggered" in status) return "Triggered";
    if ("internal_error" in status) return "Error";
  }
  return "Active";
}

function getStatusColor(status: TriggerOrderStatus): string {
  if (status === "waiting_price" || status === "waiting_dependency") return "text-[var(--warn)]";
  if (status === "triggering") return "text-primary";
  if (typeof status === "object") {
    if ("twap_executing" in status) return "text-primary";
    if ("twap_completed" in status) return "text-primary";
    if ("cancelled" in status) return "text-muted-foreground";
    if ("triggered" in status) return "text-primary";
    if ("internal_error" in status) return "text-destructive";
  }
  return "text-muted-foreground";
}

const COLUMN_DESCRIPTIONS: Record<string, string> = {
  Pair: "Market this order is placed on.",
  Account: "Cross subaccount that placed this order.",
  Type: "Order type: Limit, SL Market, SL Limit, TP Market, TP Limit, or TWAP.",
  Direction: "Trade direction. Reduce-only orders show Close Long / Close Short.",
  "Order Price": "Limit price for this order.",
  "Trigger": "Trigger condition for TP/SL and TWAP orders.",
  "Filled / Total": "Unfilled amount remaining vs original order size.",
  "Order Value": "Notional value: price × total amount in USD.",
  "Reduce Only": "If checked, this order can only reduce an existing position.",
  Status: "Current order status.",
  Time: "When this order was placed.",
};

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Row builders ───────────────────────────────────────────────────────────

function subaccountNameFromSender(sender: string): string {
  const nameHex = sender.slice(42);
  const bytes = [];
  for (let i = 0; i < nameHex.length; i += 2) {
    const byte = parseInt(nameHex.slice(i, i + 2), 16);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return bytes.length > 0 ? String.fromCharCode(...bytes) : "default";
}

function buildLimitRow(order: OpenOrderEntry): LimitOrderRow {
  const price = fromX18BigInt(order.price_x18);
  const totalAmount = fromX18BigInt(order.amount);
  const unfilledAmount = fromX18BigInt(order.unfilled_amount);
  const isLong = totalAmount >= 0;
  const absTotal = Math.abs(totalAmount);
  const absFilled = absTotal - Math.abs(unfilledAmount);
  return {
    kind: "limit",
    key: `limit-${order.digest}`,
    productId: order.product_id,
    digest: order.digest,
    subaccountLabel: order.subaccountLabel,
    subaccountName: subaccountNameFromSender(order.sender),
    orderType: ORDER_TYPE_LABELS[order.order_type] ?? order.order_type,
    isLong,
    price,
    absTotal,
    absFilled,
    orderValue: price * absTotal,
    reduceOnly: isReduceOnly(order.appendix),
    placedAt: order.placed_at,
  };
}

function buildTriggerRow(entry: TriggerOrderEntry): TriggerOrderRow {
  const price = fromX18BigInt(entry.order.order.priceX18);
  const totalAmount = fromX18BigInt(entry.order.order.amount);
  const isLong = totalAmount >= 0;
  const absTotal = Math.abs(totalAmount);
  const typeLabel = getTriggerTypeLabel(entry.order.trigger, totalAmount, entry.order.order.appendix);
  const entirePos = isEntirePosition(absTotal);
  return {
    kind: "trigger",
    key: `trigger-${entry.order.digest ?? `${entry.order.product_id}-${entry.placed_at}`}`,
    productId: entry.order.product_id,
    digest: entry.order.digest,
    subaccountLabel: entry.subaccountLabel,
    subaccountName: subaccountNameFromSender(entry.order.order.sender),
    orderType: typeLabel,
    isLong,
    price,
    absTotal,
    absFilled: 0,
    orderValue: entirePos ? 0 : price * absTotal,
    reduceOnly: isReduceOnly(entry.order.order.appendix),
    placedAt: entry.placed_at,
    triggerLabel: typeLabel,
    triggerDetail: getTriggerDetail(entry.order.trigger),
    statusLabel: getStatusLabel(entry.status),
    statusColor: getStatusColor(entry.status),
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WalletOpenOrders({
  orders,
  triggerOrders,
  crossSubaccountLabels,
  onRefresh,
  refreshing,
  loading,
  signatureNeeded,
  onRequestSignature,
  triggerLoading,
  isOwnWallet = false,
  onCancelOrder,
  cancellingKeys,
  streamConnected = false,
  has1CT = false,
  linkedSignerActive = false,
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

  const allRows = useMemo(() => {
    const limitRows = orders.map(buildLimitRow);
    const triggerRows = triggerOrders.map(buildTriggerRow);
    const combined = [...limitRows, ...triggerRows];
    combined.sort((a, b) => {
      const byProduct = a.productId - b.productId;
      if (byProduct !== 0) return byProduct;
      return b.placedAt - a.placedAt;
    });
    return combined;
  }, [orders, triggerOrders]);

  const filteredRows = useMemo(() => {
    if (displayFilter === SUBACCOUNT_FILTER_ALL) return allRows;
    return allRows.filter(
      (r) => normalizeSubaccountDisplayName(r.subaccountLabel) === displayFilter,
    );
  }, [allRows, displayFilter]);

  const hasTriggerOrders = triggerOrders.length > 0;
  const hasMultipleSubaccounts =
    new Set(allRows.map((r) => r.subaccountLabel)).size > 1;

  const showTriggerColumn = hasTriggerOrders;
  const showStatusColumn = hasTriggerOrders;

  // Loading state
  if (loading && allRows.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-3">
            Open Orders
            {isOwnWallet && <OpenOrdersHelpTooltip has1CT={has1CT} />}
          </div>
          <LoadingShimmer text="Loading open orders..." />
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (allRows.length === 0 && !signatureNeeded) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3 min-h-6">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80">
              Open Orders
              {isOwnWallet && <OpenOrdersHelpTooltip has1CT={has1CT} />}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {signatureNeeded && (
                <SignatureButton onClick={onRequestSignature} loading={triggerLoading} has1CT={has1CT} />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                disabled={refreshing}
                onClick={onRefresh}
                aria-label="Refresh open orders"
              >
                <RefreshCw
                  className={cn("size-3", refreshing && "animate-spin")}
                  aria-hidden
                />
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground/80 text-center py-6">
            No open orders
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filtered empty state
  if (filteredRows.length === 0 && !signatureNeeded) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3 min-h-6">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80">
              Open Orders
              {isOwnWallet && <OpenOrdersHelpTooltip has1CT={has1CT} />}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <AccountFilterSelect
                options={accountFilterOptions}
                value={displayFilter}
                onValueChange={setSelectedFilter}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                disabled={refreshing}
                onClick={onRefresh}
                aria-label="Refresh open orders"
              >
                <RefreshCw
                  className={cn("size-3", refreshing && "animate-spin")}
                  aria-hidden
                />
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground/80 text-center py-6">
            No open orders for this subaccount
          </div>
        </CardContent>
      </Card>
    );
  }

  const columns = [
    "_icon",
    "Pair",
    ...(hasMultipleSubaccounts ? ["Account"] : []),
    "Type",
    "Direction",
    "Order Price",
    ...(showTriggerColumn ? ["Trigger"] : []),
    "Filled / Total",
    "Order Value",
    "Reduce Only",
    ...(showStatusColumn ? ["Status"] : []),
    "Time",
    ...(isOwnWallet ? ["_actions"] : []),
  ];

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3 min-h-6">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80">
            Open Orders{" "}
            <span className="text-muted-foreground/80">
              ({filteredRows.length})
            </span>
            {isOwnWallet && <OpenOrdersHelpTooltip has1CT={has1CT} />}
            {(streamConnected || linkedSignerActive) && (
              <span className="flex items-center gap-1 text-[9px] font-medium text-primary normal-case tracking-normal">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {signatureNeeded && (
              <SignatureButton onClick={onRequestSignature} loading={triggerLoading} has1CT={has1CT} />
            )}
            <AccountFilterSelect
              options={accountFilterOptions}
              value={displayFilter}
              onValueChange={setSelectedFilter}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
              disabled={refreshing}
              onClick={onRefresh}
              aria-label="Refresh open orders"
            >
              <RefreshCw
                className={cn("size-3", refreshing && "animate-spin")}
                aria-hidden
              />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {columns.map((h) => {
                  if (h.startsWith("_"))
                    return <TableHead key={h} className="pb-2 px-1" />;
                  const centered = h === "Pair" || h === "Account" || h === "Direction" || h === "Type" || h === "Reduce Only" || h === "Status";
                  const description = COLUMN_DESCRIPTIONS[h];

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
                            {h}
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
                        h
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const pair = productName(row.productId);
                const iconSrc = perpIconSrcFromPair(pair);
                const accountLabel = normalizeSubaccountDisplayName(row.subaccountLabel);

                return (
                  <TableRow
                    key={row.key}
                    className="border-border hover:bg-muted/30"
                  >
                    {/* Icon */}
                    <TableCell className="py-2 px-1 w-8">
                      <Avatar className="size-7">
                        {iconSrc ? (
                          <AvatarImage src={iconSrc} alt={pair} />
                        ) : null}
                        <AvatarFallback className="text-[10px] font-medium bg-muted">
                          {assetInitial(pair)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>

                    {/* Pair */}
                    <TableCell className="py-2 px-1 sticky left-0 z-20 bg-card font-medium text-foreground whitespace-nowrap">
                      {pair}
                    </TableCell>

                    {/* Account (conditional) */}
                    {hasMultipleSubaccounts && (
                      <TableCell className="py-2 pr-2 text-center text-muted-foreground whitespace-nowrap">
                        {accountLabel}
                      </TableCell>
                    )}

                    {/* Order Type */}
                    <TableCell className="py-2 pr-2 text-center">
                      <span className={cn(
                        "text-[10px]",
                        row.kind === "trigger"
                          ? row.orderType.startsWith("TP")
                            ? "text-purple-400 font-medium"
                            : row.orderType.startsWith("SL")
                              ? "text-[var(--warn)] font-medium"
                              : "text-purple-400 font-medium"
                          : "text-muted-foreground",
                      )}>
                        {row.orderType}
                      </span>
                    </TableCell>

                    {/* Direction */}
                    <TableCell className="py-2 pr-2 text-center">
                      {row.reduceOnly ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0",
                            row.isLong
                              ? "text-[var(--bear)] border-[var(--bear)]/30 bg-[var(--bear)]/10"
                              : "text-[var(--bull)] border-[var(--bull)]/30 bg-[var(--bull)]/10",
                          )}
                        >
                          {row.isLong ? "CLOSE SHORT" : "CLOSE LONG"}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0",
                            row.isLong
                              ? "text-[var(--bull)] border-[var(--bull)]/30 bg-[var(--bull)]/10"
                              : "text-[var(--bear)] border-[var(--bear)]/30 bg-[var(--bear)]/10",
                          )}
                        >
                          {row.isLong ? "OPEN LONG" : "OPEN SHORT"}
                        </Badge>
                      )}
                    </TableCell>

                    {/* Order Price */}
                    <TableCell className="py-2 pr-4 text-right text-foreground whitespace-nowrap tabular-nums">
                      {fmtPrice(row.price)}
                    </TableCell>

                    {/* Trigger (conditional) */}
                    {showTriggerColumn && (
                      <TableCell className="py-2 pr-4 text-right whitespace-nowrap">
                        {row.triggerDetail ? (
                          <span className="text-muted-foreground text-[10px]">
                            {row.triggerDetail}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                    )}

                    {/* Filled / Total */}
                    <TableCell className="py-2 pr-4 text-right whitespace-nowrap tabular-nums">
                      {isEntirePosition(row.absTotal) ? (
                        <span className="text-foreground text-xs">Entire Position</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-foreground">
                            {fmtQty(row.absFilled)} / {fmtQty(row.absTotal)}
                          </span>
                          {row.absFilled > 0 && (
                            <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/60 rounded-full"
                                style={{
                                  width: `${Math.min((row.absFilled / row.absTotal) * 100, 100)}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Order Value */}
                    <TableCell className="py-2 pr-4 text-right text-muted-foreground whitespace-nowrap tabular-nums">
                      {isEntirePosition(row.absTotal) ? "—" : fmtUsd.format(row.orderValue)}
                    </TableCell>

                    {/* Reduce Only */}
                    <TableCell className="py-2 pr-2 text-center text-muted-foreground">
                      {row.reduceOnly ? "✓" : "—"}
                    </TableCell>

                    {/* Status (conditional) */}
                    {showStatusColumn && (
                      <TableCell className="py-2 pr-2 text-center whitespace-nowrap">
                        {row.kind === "trigger" ? (
                          <span className={cn("text-[10px] font-medium", row.statusColor)}>
                            {row.statusLabel}
                          </span>
                        ) : (
                          <span className="text-primary text-[10px] font-medium">Active</span>
                        )}
                      </TableCell>
                    )}

                    {/* Time */}
                    <TableCell className="py-2 pr-4 text-right whitespace-nowrap">
                      <HoverCard>
                        <HoverCardTrigger className="cursor-help text-muted-foreground">
                          {formatRelativeTime(row.placedAt)}
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="top"
                          align="end"
                          className="w-auto text-xs px-3 py-2"
                        >
                          {formatAbsoluteTime(row.placedAt)}
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>

                    {/* Cancel action */}
                    {isOwnWallet && (() => {
                      const digest = row.digest;
                      if (!digest) return <TableCell className="py-2 px-1" />;
                      const cancelKey = `${row.productId}-${digest}`;
                      const isCancelling = cancellingKeys?.has(cancelKey) ?? false;
                      return (
                        <TableCell className="py-2 px-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-destructive hover:border-destructive/30"
                            disabled={isCancelling}
                            onClick={() => onCancelOrder?.({
                              kind: row.kind,
                              productId: row.productId,
                              digest,
                              subaccountName: row.subaccountName,
                              pair,
                            })}
                            aria-label={`Cancel ${pair} order`}
                          >
                            {isCancelling ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <>
                                <X className="size-3" />
                                Cancel
                              </>
                            )}
                          </Button>
                        </TableCell>
                      );
                    })()}
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

// ─── Signature CTA ──────────────────────────────────────────────────────────

function SignatureButton({ onClick, loading, has1CT }: { onClick: () => void; loading: boolean; has1CT: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-6 gap-1.5 text-[10px] border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
      onClick={onClick}
      disabled={loading}
    >
      <ShieldCheck className="size-3" aria-hidden />
      {loading ? "Signing…" : has1CT ? "Enable Live Orders" : "Show TP/SL & TWAP"}
    </Button>
  );
}
