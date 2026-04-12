"use client";

import { buildSubaccountLabelByHex } from "@/lib/wallet/subaccountFilter";
import { use, useMemo } from "react";
import { isAddress } from "viem";
import { notFound } from "next/navigation";
import { useWalletData } from "@/hooks/useWalletData";
import { WalletHeader } from "@/components/wallet/WalletHeader";
import { WalletSpotBalances } from "@/components/wallet/WalletSpotBalances";
import { WalletStats } from "@/components/wallet/WalletStats";
import { WalletPositions } from "@/components/wallet/WalletPositions";
import { WalletTradeHistory } from "@/components/wallet/WalletTradeHistory";
import { WalletEquityCurve } from "@/components/wallet/WalletEquityCurve";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { Spinner } from "@/components/ui/Spinner";

type Props = {
  params: Promise<{ address: string }>;
}

function WalletContent({ address }: { address: string }) {
  const {
    stats,
    trades,
    fundingPayments,
    loading,
    tradesComplete,
    fundingComplete,
    error,
    refresh,
    refreshing,
    refreshUnrealizedPnl,
    unrealizedRefreshing,
    refreshSpotBalances,
    spotBalancesRefreshing,
  } = useWalletData(address);

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

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Spinner size={48} />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center py-24 text-destructive text-sm">
        {error ?? "Failed to load wallet data"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WalletHeader stats={stats} />
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
      />
      <WalletStats
        stats={stats}
        tradesComplete={tradesComplete}
        fundingComplete={fundingComplete}
      />
      <WalletSummary
        stats={stats}
        tradesComplete={tradesComplete}
        fundingComplete={fundingComplete}
        onRefresh={refresh}
        refreshing={refreshing}
        onRefreshUnrealized={refreshUnrealizedPnl}
        unrealizedRefreshing={unrealizedRefreshing}
      />
      <WalletEquityCurve
        trades={trades}
        fundingPayments={fundingPayments}
        tradesComplete={tradesComplete}
      />
      <WalletTradeHistory
        trades={trades}
        crossSubaccountLabels={tradeCrossSubaccountLabels}
        subaccountLabelByHex={subaccountLabelByHex}
        onRefreshTrades={refresh}
        tradesRefreshing={refreshing}
      />
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
