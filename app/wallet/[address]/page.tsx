"use client";

import { buildSubaccountLabelByHex } from "@/lib/wallet/subaccountFilter";
import { normalizeSubaccountDisplayName, subaccountDisplayLabelSortKey } from "@/lib/wallet/subaccountLabel";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { notFound } from "next/navigation";
import { useWalletData } from "@/hooks/useWalletData";
import { useOpenOrders } from "@/hooks/useOpenOrders";
import { useOrderStream } from "@/hooks/useOrderStream";
import { useTriggerOrders } from "@/hooks/useTriggerOrders";
import { useLinkedSigner } from "@/hooks/useLinkedSigner";
import { useWalletFunding } from "@/hooks/useWalletFunding";
import { useExecute, SDK_TIMEOUT_MS, ORDER_EXPIRY_S } from "@/hooks/useExecute";
import { useWalletAnalyticsStore } from "@/store/walletAnalyticsStore";
import { WalletHeader } from "@/components/wallet/WalletHeader";
import { WalletSpotBalances } from "@/components/wallet/WalletSpotBalances";
import { WalletStats } from "@/components/wallet/WalletStats";
import { WalletOpenOrders } from "@/components/wallet/WalletOpenOrders";
import { WalletPositions, closingKey } from "@/components/wallet/WalletPositions";
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
import { getNadoErrorMessage } from "@/lib/wallet/nadoErrorMessages";
import { toast } from "sonner";

const LOAD_TIMEOUT_MS = 30_000;
// After a client-side close-position timeout, the previous signed order can
// still be sitting live in the user's wallet (pending approval) until its own
// on-chain expiration passes. Keep the retry guard held until then, so a
// retry click can't queue a second live signature request in the wallet
// while the first one might still be approved.
const CLOSE_RETRY_HOLD_MS = ORDER_EXPIRY_S * 1000 - SDK_TIMEOUT_MS;

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
  const { cancelLimitOrder, cancelTriggerOrder, cancelTriggerProductOrders, closePosition, isReady: executeReady } = useExecute();

  const [cancellingKeys, setCancellingKeys] = useState<Set<string>>(new Set());
  const [closingKeys, setClosingKeys] = useState<Set<string>>(new Set());
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);
  const cancelRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (cancelRefreshTimerRef.current) clearTimeout(cancelRefreshTimerRef.current);
    };
  }, []);

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
    linkedSigners,
    has1CT,
    signatureNeeded: linkedSignerNeeded,
    deriveKeys,
    deriving: linkedSignerDeriving,
  } = useLinkedSigner(address, ordersCrossSubaccounts, phase1Ready);

  // Get the first available linked signer WalletClient for WS stream auth
  const firstLinkedSignerClient = useMemo(() => {
    const first = linkedSigners.values().next();
    return first.done ? null : first.value.walletClient;
  }, [linkedSigners]);

  // Build linked signer map for trigger orders
  const triggerLinkedSigners = useMemo(() => {
    if (linkedSigners.size === 0) return undefined;
    const map = new Map<string, { subaccountName: string; walletClient: typeof firstLinkedSignerClient }>();
    for (const [sub, entry] of linkedSigners) {
      map.set(sub, { subaccountName: entry.subaccountName, walletClient: entry.walletClient });
    }
    return map;
  }, [linkedSigners, firstLinkedSignerClient]);

  const orderUpdateRef = useRef<((event: import("@/lib/schemas/nado").OrderUpdateEvent) => void) | null>(null);
  const handleOrderStreamEvent = useCallback((event: import("@/lib/schemas/nado").OrderUpdateEvent) => {
    orderUpdateRef.current?.(event);
  }, []);

  const orderStreamSubaccounts = useMemo(
    () => ordersCrossSubaccounts?.map((s) => s.subaccount) ?? null,
    [ordersCrossSubaccounts],
  );

  const {
    connected: orderStreamConnected,
    signatureNeeded: orderStreamSignatureNeeded,
    requestSignature: requestOrderStreamSignature,
  } = useOrderStream({
    onOrderUpdate: handleOrderStreamEvent,
    enabled: isOwnWallet && phase1Ready,
    subaccounts: orderStreamSubaccounts,
    linkedSignerClient: firstLinkedSignerClient,
  });

  const {
    orders: openOrders,
    loading: openOrdersLoading,
    refreshing: openOrdersRefreshing,
    refresh: refreshOpenOrders,
    handleOrderUpdate,
    markSelfCancelled,
  } = useOpenOrders(address, ordersCrossSubaccounts, phase1Ready, orderStreamConnected);

  useEffect(() => {
    orderUpdateRef.current = handleOrderUpdate;
  });

  const {
    triggerOrders,
    loading: triggerOrdersLoading,
    signatureNeeded: triggerSignatureNeeded,
    requestSignature: triggerRequestSignature,
    hasSigned: _triggerHasSigned,
    refresh: refreshTriggerOrders,
  } = useTriggerOrders(address, ordersCrossSubaccounts, phase1Ready, triggerLinkedSigners);

  // Unified signature needed: linked signer takes priority over individual hooks
  const signatureNeeded = linkedSignerNeeded || (!has1CT && (orderStreamSignatureNeeded || triggerSignatureNeeded));
  const requestSignature = useCallback(() => {
    if (linkedSignerNeeded) {
      deriveKeys();
      return;
    }
    if (orderStreamSignatureNeeded) requestOrderStreamSignature();
    if (triggerSignatureNeeded) triggerRequestSignature();
  }, [linkedSignerNeeded, deriveKeys, orderStreamSignatureNeeded, requestOrderStreamSignature, triggerSignatureNeeded, triggerRequestSignature]);

  const refreshAllOrders = useCallback(() => {
    refreshOpenOrders();
    refreshTriggerOrders();
  }, [refreshOpenOrders, refreshTriggerOrders]);

  const handleCancelOrder = useCallback(
    async (params: { kind: "limit" | "trigger"; productId: number; digest: string; subaccountName: string; pair: string }) => {
      if (!executeReady) return;
      const cancelKey = `${params.productId}-${params.digest}`;
      if (cancellingKeys.has(cancelKey)) return;
      setCancellingKeys((prev) => new Set([...prev, cancelKey]));
      try {
        if (params.kind === "limit") {
          markSelfCancelled(params.digest);
          await cancelLimitOrder({ subaccountName: params.subaccountName, productId: params.productId, digest: params.digest });
        } else {
          await cancelTriggerOrder({ subaccountName: params.subaccountName, productId: params.productId, digest: params.digest });
        }
        toast.success(`Order cancelled — ${params.pair}`);
        if (cancelRefreshTimerRef.current) clearTimeout(cancelRefreshTimerRef.current);
        cancelRefreshTimerRef.current = setTimeout(() => {
          refreshOpenOrders(true);
          refreshTriggerOrders();
        }, 1500);
      } catch (e) {
        if (e instanceof Error && (e.message.includes("rejected") || e.message.includes("denied"))) {
          toast.warning("Signature rejected");
        } else {
          toast.error(getNadoErrorMessage(e));
        }
      } finally {
        setCancellingKeys((prev) => {
          const next = new Set(prev);
          next.delete(cancelKey);
          return next;
        });
      }
    },
    [executeReady, cancellingKeys, markSelfCancelled, cancelLimitOrder, cancelTriggerOrder, refreshOpenOrders, refreshTriggerOrders],
  );

  const handleCancelProductTriggerOrders = useCallback(
    async (params: { productId: number; subaccountName: string; pair: string }) => {
      if (!executeReady) return;
      const cancelKey = `product-${params.productId}`;
      if (cancellingKeys.has(cancelKey)) return;
      setCancellingKeys((prev) => new Set([...prev, cancelKey]));
      try {
        await cancelTriggerProductOrders({ subaccountName: params.subaccountName, productId: params.productId });
        toast.success(`All ${params.pair} trigger orders cancelled`);
        if (cancelRefreshTimerRef.current) clearTimeout(cancelRefreshTimerRef.current);
        cancelRefreshTimerRef.current = setTimeout(() => {
          refreshTriggerOrders();
        }, 1500);
      } catch (e) {
        if (e instanceof Error && (e.message.includes("rejected") || e.message.includes("denied"))) {
          toast.warning("Signature rejected");
        } else {
          toast.error(getNadoErrorMessage(e));
        }
      } finally {
        setCancellingKeys((prev) => {
          const next = new Set(prev);
          next.delete(cancelKey);
          return next;
        });
      }
    },
    [executeReady, cancellingKeys, cancelTriggerProductOrders, refreshTriggerOrders],
  );

  const handleClosePosition = useCallback(
    async (params: { productId: number; amountX18: string; subaccountName: string; pair: string; isLong: boolean; isolated: boolean; markPrice: number; slippagePct: number }) => {
      if (!executeReady) return;
      if (!connectedAddress || connectedAddress.toLowerCase() !== address.toLowerCase()) {
        toast.warning("Wallet changed — action cancelled");
        return;
      }
      const key = `${params.subaccountName}:${params.productId}`;
      if (closingKeys.has(key)) return;
      setClosingKeys((prev) => new Set([...prev, key]));
      let holdGuard = false;
      try {
        await closePosition(
          {
            subaccountName: params.subaccountName,
            productId: params.productId,
            amountX18: params.amountX18,
            isLong: params.isLong,
            isolated: params.isolated,
            markPrice: params.markPrice,
            slippagePct: params.slippagePct,
          },
          (outcome) => {
            // Fires only if the order call resolves AFTER we already showed a
            // timeout error and re-enabled Close — reconcile instead of leaving
            // the outcome silently unreflected in the UI, whichever way it went.
            if (outcome.ok) {
              toast.info(`${params.pair} — order actually went through after the timeout, refreshing`);
              void refresh();
            } else {
              toast.warning(`${params.pair} — that timed-out request was rejected (likely expired), no order was placed`);
            }
          },
        );
        toast.success(`Market close placed — ${params.pair}`);
        setClosingPosition(null);
        await refresh();
      } catch (e) {
        if (e instanceof Error && (e.message.includes("rejected") || e.message.includes("denied"))) {
          toast.warning("Signature rejected");
        } else if (e instanceof Error && e.message === "Request timed out") {
          toast.error("Request timed out — if a wallet popup is still open, reject it before retrying");
          // The signed request may still be sitting live in the wallet until its
          // own on-chain expiration passes — hold the retry guard that long so a
          // retry can't queue a second live signature request alongside it.
          holdGuard = true;
          setTimeout(() => {
            setClosingKeys((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          }, CLOSE_RETRY_HOLD_MS);
        } else {
          toast.error(getNadoErrorMessage(e));
        }
      } finally {
        if (!holdGuard) {
          setClosingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [executeReady, closingKeys, closePosition, refresh, connectedAddress, address],
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
            positionMatchesComplete={positionMatchesComplete}
            snapshotReady={snapshotReady}
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
            onRefresh={refreshAllOrders}
            refreshing={openOrdersRefreshing}
            loading={openOrdersLoading}
            signatureNeeded={signatureNeeded}
            onRequestSignature={requestSignature}
            triggerLoading={triggerOrdersLoading || linkedSignerDeriving}
            isOwnWallet={isOwnWallet}
            onCancelOrder={handleCancelOrder}
            onCancelProductTriggerOrders={handleCancelProductTriggerOrders}
            cancellingKeys={cancellingKeys}
            streamConnected={orderStreamConnected}
            has1CT={has1CT}
            linkedSignerActive={linkedSigners.size > 0}
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
        isClosing={closingPosition !== null && closingKeys.has(closingKey(closingPosition))}
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
