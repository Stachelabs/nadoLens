"use client";

import { buildSubaccountLabelByHex } from "@/lib/wallet/subaccountFilter";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { notFound } from "next/navigation";
import { useWalletData } from "@/hooks/useWalletData";
import { useWalletAnalyticsStore } from "@/store/walletAnalyticsStore";
import { WalletHeader } from "@/components/wallet/WalletHeader";
import { WalletSpotBalances } from "@/components/wallet/WalletSpotBalances";
import { WalletStats } from "@/components/wallet/WalletStats";
import { WalletPositions } from "@/components/wallet/WalletPositions";
import { WalletTradeHistory } from "@/components/wallet/WalletTradeHistory";
import { WalletEquityCurve } from "@/components/wallet/WalletEquityCurve";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { WalletTabNav } from "@/components/wallet/WalletTabNav";
import { WalletFeesByProductChart } from "@/components/wallet/WalletFeesByProductChart";
import { WalletFundingByProductChart } from "@/components/wallet/WalletFundingByProductChart";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const LOAD_TIMEOUT_MS = 30_000;

type Props = {
  params: Promise<{ address: string }>;
}

function WalletContent({ address }: { address: string }) {
  const {
    stats,
    trades,
    fundingPayments,
    phase1Ready,
    tradesComplete,
    fundingComplete,
    globalMatchesComplete,
    globalFundingLoading,
    globalFundingComplete,
    loadGlobalFunding,
    loadFundingForPeriod,
    fundingLoadedSince,
    error,
    refresh,
    refreshing,
    refreshUnrealizedPnl,
    unrealizedRefreshing,
    refreshSpotBalances,
    spotBalancesRefreshing,
    positionMatchesComplete,
    positionFundingComplete,
    snapshotReady,
  } = useWalletData(address);

  const { activeTab, setActiveTab } = useWalletAnalyticsStore();

  const [timedOut, setTimedOut] = useState(false);
  const handleRetry = useCallback(() => {
    setTimedOut(false);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (phase1Ready) return;
    setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase1Ready]);

  useEffect(() => {
    if (activeTab !== "analytics") return;
    void loadFundingForPeriod("7 Days");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const positionCrossSubaccountLabels = useMemo(
    () => stats?.spot_balances_by_subaccount.map((g) => g.label) ?? [],
    [stats],
  );

  const tradeCrossSubaccountLabels = useMemo(
    () => stats?.cross_subaccounts.map((c) => c.label) ?? [],
    [stats],
  );

  const subaccountLabelByHex = useMemo(
    () => (stats ? buildSubaccountLabelByHex(stats) : new Map<string, string>()),
    [stats],
  );

  if (!phase1Ready) {
    if (timedOut) {
      return (
        <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">
            Loading is taking longer than expected. The data source may be unavailable.
          </p>
          <Button onClick={handleRetry}>Retry</Button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-5">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-7 w-28" />
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border bg-card">
              <CardContent className="space-y-2 p-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-10 w-full max-w-sm" />
        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-24 text-destructive text-sm">
        {error ?? "Failed to load wallet data"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <WalletHeader stats={stats} />
      <WalletTabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "trading" && (
        <>
          <WalletSpotBalances
            bySubaccount={stats.spot_balances_by_subaccount}
            mergedBalances={stats.spot_balances}
            onRefreshSpotBalances={refreshSpotBalances}
            spotBalancesRefreshing={spotBalancesRefreshing}
          />
          <WalletPositions
            positions={stats.positions}
            crossSubaccountLabels={positionCrossSubaccountLabels}
            subaccountHealths={stats.subaccount_healths}
            onRefreshUnrealized={refreshUnrealizedPnl}
            unrealizedRefreshing={unrealizedRefreshing}
            positionMatchesComplete={positionMatchesComplete}
            positionFundingComplete={positionFundingComplete}
            snapshotReady={snapshotReady}
            loading={!positionMatchesComplete}
          />
          <WalletStats
            stats={stats}
            tradesComplete={tradesComplete}
            fundingComplete={fundingComplete}
          />
          <WalletSummary
            stats={stats}
            globalMatchesComplete={globalMatchesComplete}
            globalFundingComplete={globalFundingComplete}
            globalFundingLoading={globalFundingLoading}
            loadGlobalFunding={loadGlobalFunding}
            onRefresh={refresh}
            refreshing={refreshing}
            onRefreshUnrealized={refreshUnrealizedPnl}
            unrealizedRefreshing={unrealizedRefreshing}
          />
          <WalletTradeHistory
            trades={trades}
            crossSubaccountLabels={tradeCrossSubaccountLabels}
            subaccountLabelByHex={subaccountLabelByHex}
            onRefreshTrades={refresh}
            tradesRefreshing={refreshing}
            globalMatchesComplete={globalMatchesComplete}
          />
        </>
      )}

      {activeTab === "analytics" && (
        <>
          <WalletEquityCurve
            trades={trades}
            fundingPayments={fundingPayments}
            globalMatchesComplete={globalMatchesComplete}
            globalFundingComplete={globalFundingComplete}
            globalFundingLoading={globalFundingLoading}
            fundingLoadedSince={fundingLoadedSince}
          />
          <WalletFeesByProductChart
            trades={trades}
            globalMatchesComplete={globalMatchesComplete}
          />
          <WalletFundingByProductChart
            fundingPayments={fundingPayments}
            fundingLoadedSince={fundingLoadedSince}
            loadFundingForPeriod={loadFundingForPeriod}
          />
        </>
      )}
    </div>
  );
}

export default function WalletAddressPage({ params }: Props) {
  const { address } = use(params);

  if (!isAddress(address)) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <WalletContent address={address} />
    </div>
  );
}
