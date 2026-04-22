"use client";

import { buildSubaccountLabelByHex } from "@/lib/wallet/subaccountFilter";
import { use, useEffect, useMemo } from "react";
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
import { Spinner } from "@/components/ui/Spinner";

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
  } = useWalletData(address);

  const { activeTab, setActiveTab } = useWalletAnalyticsStore();

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
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Spinner size={48} />
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
