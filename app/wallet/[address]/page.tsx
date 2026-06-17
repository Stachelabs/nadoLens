"use client";

import { buildSubaccountLabelByHex } from "@/lib/wallet/subaccountFilter";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { notFound } from "next/navigation";
import { useWalletData } from "@/hooks/useWalletData";
import { useWalletFunding } from "@/hooks/useWalletFunding";
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
import { InkLoader } from "@/components/ui/InkLoader";
import { Button } from "@/components/ui/button";
import { WalletBanner } from "@/components/wallet/WalletBanner";

const LOAD_TIMEOUT_MS = 30_000;

type Props = {
  params: Promise<{ address: string }>;
}

function WalletContent({ address }: { address: string }) {
  useWalletFunding(address);
  const {
    stats,
    trades,
    phase1Ready,
    tradesComplete,
    globalMatchesComplete,
    error,
    refresh,
    refreshing,
    refreshUnrealizedPnl,
    unrealizedRefreshing,
    refreshSpotBalances,
    spotBalancesRefreshing,
    positionMatchesComplete,
    matchedPositionKeys,
    snapshotReady,
    bannerState,
    matchesError,
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
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <InkLoader size={160} />
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive whitespace-pre-line">
          {error}
        </div>
      )}
      <WalletBanner banners={bannerState} />
      <WalletTabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "overview" && (
        <>
          <WalletHeader stats={stats} />
          <WalletSpotBalances
            bySubaccount={stats.spot_balances_by_subaccount}
            mergedBalances={stats.spot_balances}
            onRefreshSpotBalances={refreshSpotBalances}
            spotBalancesRefreshing={spotBalancesRefreshing}
          />
          <WalletStats
            stats={stats}
            tradesComplete={tradesComplete}
            globalMatchesComplete={globalMatchesComplete}
            matchesError={matchesError}
          />
          <WalletSummary
            stats={stats}
            globalMatchesComplete={globalMatchesComplete}
            matchesError={matchesError}
            onRefresh={refresh}
            refreshing={refreshing}
            onRefreshUnrealized={refreshUnrealizedPnl}
            unrealizedRefreshing={unrealizedRefreshing}
          />
        </>
      )}

      {activeTab === "trading" && (
        <>
          <WalletHeader stats={stats} />
          <WalletPositions
            positions={stats.positions}
            crossSubaccountLabels={positionCrossSubaccountLabels}
            subaccountHealths={stats.subaccount_healths}
            onRefreshUnrealized={refreshUnrealizedPnl}
            unrealizedRefreshing={unrealizedRefreshing}
            positionMatchesComplete={positionMatchesComplete}
            matchedPositionKeys={matchedPositionKeys}
            snapshotReady={snapshotReady}
            loading={!positionMatchesComplete}
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
            globalMatchesComplete={globalMatchesComplete}
          />
          <WalletFeesByProductChart
            trades={trades}
            globalMatchesComplete={globalMatchesComplete}
          />
          <WalletFundingByProductChart />
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
