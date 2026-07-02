"use client";

import { buildSubaccountLabelByHex } from "@/lib/wallet/subaccountFilter";
import { normalizeSubaccountDisplayName, subaccountDisplayLabelSortKey } from "@/lib/wallet/subaccountLabel";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { notFound } from "next/navigation";
import { useWalletData } from "@/hooks/useWalletData";
import { useOpenOrders } from "@/hooks/useOpenOrders";
import { useTriggerOrders } from "@/hooks/useTriggerOrders";
import { useWalletFunding } from "@/hooks/useWalletFunding";
import { useExecute } from "@/hooks/useExecute";
import { useWalletAnalyticsStore } from "@/store/walletAnalyticsStore";
import { WalletHeader } from "@/components/wallet/WalletHeader";
import { WalletSpotBalances } from "@/components/wallet/WalletSpotBalances";
import { WalletStats } from "@/components/wallet/WalletStats";
import { WalletOpenOrders } from "@/components/wallet/WalletOpenOrders";
import { WalletPositions } from "@/components/wallet/WalletPositions";
import { WalletTradeHistory } from "@/components/wallet/WalletTradeHistory";
import { WalletEquityCurve } from "@/components/wallet/WalletEquityCurve";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { WalletTabNav } from "@/components/wallet/WalletTabNav";
import { WalletVolumeByProductChart } from "@/components/wallet/WalletVolumeByProductChart";
import { WalletFeesByProductChart } from "@/components/wallet/WalletFeesByProductChart";
import { WalletFundingByProductChart } from "@/components/wallet/WalletFundingByProductChart";
import { ClosePositionDialog } from "@/components/wallet/ClosePositionDialog";
import { InkLoader } from "@/components/ui/InkLoader";
import { Button } from "@/components/ui/button";
import { WalletBanner } from "@/components/wallet/WalletBanner";
import { Spinner } from "@/components/ui/Spinner";
import { nanoStringToMs } from "@/lib/wallet/nanoTime";
import type { Position } from "@/types/nado";
import { toast } from "sonner";

const LOAD_TIMEOUT_MS = 30_000;

function formatSinceDate(nanoTs: string | null): string | null {
  const ms = nanoTs ? nanoStringToMs(nanoTs) : null;
  if (ms === null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
}

type Props = {
  params: Promise<{ address: string }>;
}

function WalletContent({ address }: { address: string }) {
  const { address: connectedAddress, isConnected } = useAccount();
  const isOwnWallet = isConnected && !!connectedAddress && connectedAddress.toLowerCase() === address.toLowerCase();
  const { cancelLimitOrder, cancelTriggerOrder, closePosition, isReady: executeReady } = useExecute();

  const [cancellingKeys, setCancellingKeys] = useState<Set<string>>(new Set());
  const [closingKeys, setClosingKeys] = useState<Set<string>>(new Set());
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);
  const [isClosing, setIsClosing] = useState(false);

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
    dataCompleteness,
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

  const positionCrossSubaccountLabels = useMemo(() => {
    if (!stats) return [];
    const labels = new Set<string>();
    for (const pos of stats.positions) {
      if (pos.isolated && pos.parent_subaccount_name) {
        labels.add(normalizeSubaccountDisplayName(pos.parent_subaccount_name));
      } else {
        labels.add(normalizeSubaccountDisplayName(pos.subaccount_name));
      }
    }
    return [...labels].sort((a, b) => subaccountDisplayLabelSortKey(a) - subaccountDisplayLabelSortKey(b));
  }, [stats]);

  const tradeCrossSubaccountLabels = useMemo(
    () => stats?.cross_subaccounts.map((c) => c.label) ?? [],
    [stats],
  );

  const subaccountLabelByHex = useMemo(
    () => (stats ? buildSubaccountLabelByHex(stats) : new Map<string, string>()),
    [stats],
  );

  const ordersCrossSubaccounts = useMemo(
    () => stats?.cross_subaccounts ?? null,
    [stats],
  );
  const {
    orders: openOrders,
    loading: openOrdersLoading,
    refreshing: openOrdersRefreshing,
    refresh: refreshOpenOrders,
  } = useOpenOrders(address, ordersCrossSubaccounts, phase1Ready);

  const {
    triggerOrders,
    loading: triggerOrdersLoading,
    signatureNeeded,
    requestSignature,
    hasSigned: _triggerHasSigned,
  } = useTriggerOrders(address, ordersCrossSubaccounts, phase1Ready);

  const handleCancelOrder = useCallback(
    async (params: { kind: "limit" | "trigger"; productId: number; digest: string; subaccountName: string; pair: string }) => {
      if (!executeReady) return;
      const cancelKey = `${params.productId}-${params.digest}`;
      setCancellingKeys((prev) => new Set([...prev, cancelKey]));
      try {
        if (params.kind === "limit") {
          await cancelLimitOrder({ subaccountName: params.subaccountName, productId: params.productId, digest: params.digest });
        } else {
          await cancelTriggerOrder({ subaccountName: params.subaccountName, productId: params.productId, digest: params.digest });
        }
        toast.success(`Order cancelled — ${params.pair}`);
        refreshOpenOrders();
      } catch (e) {
        if (e instanceof Error && (e.message.includes("rejected") || e.message.includes("denied"))) {
          toast.warning("Signature rejected");
        } else if (e instanceof Error) {
          toast.error(e.message);
        } else {
          toast.error("Failed to cancel order");
        }
      } finally {
        setCancellingKeys((prev) => {
          const next = new Set(prev);
          next.delete(cancelKey);
          return next;
        });
      }
    },
    [executeReady, cancelLimitOrder, cancelTriggerOrder, refreshOpenOrders],
  );

  const handleClosePosition = useCallback(
    async (params: { productId: number; amountX18: string; subaccountName: string; pair: string; isLong: boolean; isolated: boolean }) => {
      if (!executeReady) return;
      if (!connectedAddress || connectedAddress.toLowerCase() !== address.toLowerCase()) {
        toast.warning("Wallet changed — action cancelled");
        return;
      }
      const key = `${params.subaccountName}:${params.productId}`;
      setIsClosing(true);
      setClosingKeys((prev) => new Set([...prev, key]));
      try {
        await closePosition({
          subaccountName: params.subaccountName,
          productId: params.productId,
          amountX18: params.amountX18,
          isLong: params.isLong,
          isolated: params.isolated,
        });
        toast.success(`Market close placed — ${params.pair}`);
        setClosingPosition(null);
        await refresh();
      } catch (e) {
        if (e instanceof Error && (e.message.includes("rejected") || e.message.includes("denied"))) {
          toast.warning("Signature rejected");
        } else if (e instanceof Error) {
          toast.error(e.message);
        } else {
          toast.error("Failed to close position");
        }
      } finally {
        setIsClosing(false);
        setClosingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [executeReady, closePosition, refresh, connectedAddress, address],
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
          {!globalMatchesComplete && (
            <div className="flex items-center justify-center gap-2.5 py-2">
              <Spinner size={15} />
              <span
                style={{
                  background:
                    'linear-gradient(90deg, var(--muted-foreground) 20%, var(--foreground) 50%, var(--muted-foreground) 80%)',
                  backgroundSize: '200% 100%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'shimmer-text 2s linear infinite',
                }}
                className="text-xs font-medium"
              >
                {(() => {
                  const since = formatSinceDate(stats.first_trade_at);
                  return since
                    ? `Loading trades... Showing data since ${since}`
                    : "Loading trades...";
                })()}
              </span>
            </div>
          )}
          <WalletStats
            stats={stats}
            tradesComplete={tradesComplete}
            globalMatchesComplete={globalMatchesComplete}
            dataCompleteness={dataCompleteness}
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
            isOwnWallet={isOwnWallet}
            onClosePosition={setClosingPosition}
            closingKeys={closingKeys}
          />
          <WalletOpenOrders
            orders={openOrders}
            triggerOrders={triggerOrders}
            crossSubaccountLabels={tradeCrossSubaccountLabels}
            onRefresh={refreshOpenOrders}
            refreshing={openOrdersRefreshing}
            loading={openOrdersLoading}
            signatureNeeded={signatureNeeded}
            onRequestSignature={requestSignature}
            triggerLoading={triggerOrdersLoading}
            isOwnWallet={isOwnWallet}
            onCancelOrder={handleCancelOrder}
            cancellingKeys={cancellingKeys}
          />
          <WalletTradeHistory
            trades={trades}
            crossSubaccountLabels={tradeCrossSubaccountLabels}
            subaccountLabelByHex={subaccountLabelByHex}
            onRefreshTrades={refresh}
            tradesRefreshing={refreshing}
            globalMatchesComplete={globalMatchesComplete}
            dataCompleteness={dataCompleteness}
          />
        </>
      )}

      {activeTab === "analytics" && (
        <>
          <WalletEquityCurve
            trades={trades}
            globalMatchesComplete={globalMatchesComplete}
            dataCompleteness={dataCompleteness}
          />
          <WalletVolumeByProductChart
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

      <ClosePositionDialog
        position={closingPosition}
        open={closingPosition !== null}
        onOpenChange={(open) => { if (!open) setClosingPosition(null); }}
        onConfirm={handleClosePosition}
        isClosing={isClosing}
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
