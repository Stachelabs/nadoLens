"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { nanoStringToMs } from "@/lib/wallet/nanoTime";
import type { WalletStats } from "@/types/nado";
import { useWalletFundingStore } from "@/store/walletFundingStore";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const fmtUsdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatTimestamp(nanoTs: string | null): string {
  const ms = nanoTs ? nanoStringToMs(nanoTs) : null;
  if (ms === null) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatSinceBadge(nanoTs: string | null): string | null {
  const ms = nanoTs ? nanoStringToMs(nanoTs) : null;
  if (ms === null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear().toString().slice(-2);
  return `Since ${month} '${year}`;
}

function timeAgo(nanoTs: string | null): string {
  const ms = nanoTs ? nanoStringToMs(nanoTs) : null;
  if (ms === null) return "—";
  const diffMs = Date.now() - ms;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
}

type Props = {
  stats: WalletStats;
  globalMatchesComplete?: boolean;
  matchesError?: string | null;
  /** Re-fetch subaccounts, matches, funding — updates equity, overview, PnL from history. */
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  /** Re-fetch Gateway subaccount_info — live unrealized only (not all-time PnL). */
  onRefreshUnrealized?: () => void | Promise<void>;
  unrealizedRefreshing?: boolean;
};

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "flex min-h-6 min-w-32 shrink-0 items-center justify-end overflow-visible text-right text-sm font-bold leading-normal tabular-nums font-mono",
          valueClass ?? "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  loading,
  badge,
  action,
  className,
  children,
}: {
  title: string;
  loading?: boolean;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(className)}>
      <div className="flex items-center justify-between gap-2 mb-2 min-h-6">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          {title}
          {loading && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
          )}
          {badge}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function WalletSummary({
  stats,
  globalMatchesComplete = true,
  matchesError,
  onRefresh,
  refreshing = false,
  onRefreshUnrealized,
  unrealizedRefreshing = false,
}: Props) {
  const globalFundingComplete = useWalletFundingStore(
    (s) => s.forActive()?.globalFundingComplete ?? false,
  );
  const globalFundingLoading = useWalletFundingStore(
    (s) => s.forActive()?.globalFundingLoading ?? false,
  );
  const activeAddress = useWalletFundingStore((s) => s.activeAddress);
  const loadGlobalFunding = useWalletFundingStore((s) => s.loadGlobalFunding);
  const fundingPaidUsd = useWalletFundingStore(
    (s) => s.forActive()?.fundingPaidUsd ?? 0,
  );
  const unrealizedPnl = stats.unrealized_pnl_usd;
  const isUnrealizedPositive = unrealizedPnl >= 0;
  const isPerpPnlPositive = stats.trading_pnl_usd >= 0;
  const isAllTimePnlPositive = stats.net_pnl_usd >= 0;
  const isFundingPositive = fundingPaidUsd >= 0;
  const tradesLoading = !globalMatchesComplete;

  const showSinceBadge = !globalMatchesComplete || !!matchesError;
  const sinceText = showSinceBadge ? formatSinceBadge(stats.first_trade_at) : null;
  const sinceSuffix = matchesError
    ? " (partial)"
    : !globalMatchesComplete
      ? " (loading older...)"
      : "";

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="flex min-w-0 w-full flex-col gap-6 lg:flex-1 lg:basis-0">
            <Section title="Trader Equity">
              <Row
                label="Equity"
                value={stats.total_equity_usd !== null ? fmtUsd.format(stats.total_equity_usd) : "—"}
              />
              <Row
                label="Maintenance"
                value={fmtUsd.format(stats.maintenance_margin)}
              />
            </Section>

            <Section
              title="Positions"
              loading={!globalMatchesComplete}
              badge={
                sinceText ? (
                  <span className="normal-case tracking-normal text-[10px] font-normal text-muted-foreground/60">
                    {sinceText}{sinceSuffix}
                  </span>
                ) : null
              }
              action={
                onRefreshUnrealized ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                    disabled={unrealizedRefreshing}
                    onClick={() => void onRefreshUnrealized()}
                    aria-label="Refresh unrealized PnL and mark prices"
                  >
                    <RefreshCw
                      className={cn(
                        "size-3",
                        unrealizedRefreshing && "animate-spin",
                      )}
                      aria-hidden
                    />
                  </Button>
                ) : null
              }
            >
              <Row
                label="Unrealized PnL"
                value={`${isUnrealizedPositive ? "+" : ""}${fmtUsd.format(unrealizedPnl)}`}
                valueClass={isUnrealizedPositive ? "text-bull" : "text-bear"}
              />
              <Row
                label="Perp PnL"
                value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : `${isPerpPnlPositive ? "+" : ""}${fmtUsd.format(stats.trading_pnl_usd)}`}
                valueClass={tradesLoading ? undefined : isPerpPnlPositive ? "text-bull" : "text-bear"}
              />
              <Row
                label="All Time PnL"
                value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : `${isAllTimePnlPositive ? "+" : ""}${fmtUsd.format(stats.net_pnl_usd)}`}
                valueClass={tradesLoading ? undefined : isAllTimePnlPositive ? "text-bull" : "text-bear"}
              />
            </Section>
          </div>

          <Section
            className="min-w-0 w-full overflow-visible lg:flex-1 lg:basis-0"
            title="Overview"
            loading={!globalMatchesComplete}
            action={
              onRefresh ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground hover:text-foreground -mr-1"
                  disabled={refreshing}
                  onClick={() => void onRefresh()}
                  aria-label="Refresh account snapshot, volumes, and funding"
                >
                  <RefreshCw
                    className={cn("size-3", refreshing && "animate-spin")}
                    aria-hidden
                  />
                </Button>
              ) : null
            }
          >
            <Row
              label="Total Volume"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : fmtUsdCompact.format(stats.total_volume_usd)}
            />
            <Row
              label="Perp Volume"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : fmtUsdCompact.format(stats.perp_volume_usd)}
            />
            <Row
              label="Spot Volume"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : fmtUsdCompact.format(stats.spot_volume_usd)}
            />
            <Row
              label="Spot Trades"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : stats.spot_trades_count.toString()}
            />
            <Row
              label="Perp Trades"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : stats.perp_trades_count.toString()}
            />
            <Row
              label="Total Fees"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : fmtUsd.format(stats.total_fees_usd)}
              valueClass={tradesLoading ? undefined : "text-bear"}
            />
            <Row
              label="Total Funding"
              value={
                globalFundingComplete ? (
                  `${isFundingPositive ? "+" : ""}${fmtUsd.format(fundingPaidUsd)}`
                ) : globalFundingLoading ? (
                  <span
                    role="status"
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-sans text-xs font-normal leading-normal"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full bg-muted-foreground/40 animate-pulse"
                      aria-hidden
                    />
                    <span
                      style={{
                        background: 'linear-gradient(90deg, var(--muted-foreground) 20%, var(--foreground) 50%, var(--muted-foreground) 80%)',
                        backgroundSize: '200% 100%',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        animation: 'shimmer-text 2s linear infinite',
                      }}
                    >
                      Funding loading ...
                    </span>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 text-[10px] px-2"
                    onClick={() =>
                      activeAddress && void loadGlobalFunding?.(activeAddress)
                    }
                  >
                    Add funding history
                  </Button>
                )
              }
              valueClass={
                globalFundingComplete
                  ? isFundingPositive
                    ? "text-bull"
                    : "text-bear"
                  : "text-bull"
              }
            />
            <Row
              label="First Trade"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : formatTimestamp(stats.first_trade_at)}
            />
            <Row
              label="Last Trade"
              value={tradesLoading ? <Skeleton className="h-4 w-24 rounded-sm" /> : timeAgo(stats.last_trade_at)}
            />
          </Section>
        </div>
      </CardContent>
    </Card>
  );
}
