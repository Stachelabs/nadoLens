"use client";

import { useWalletFundingStore } from "@/store/walletFundingStore";
import { fetchPositionScopedFunding } from "@/lib/wallet/fetchWalletFunding";
import {
  applySnapshotEntryPrices,
  recomputeUnrealizedTotals,
  type EntryPriceMap,
} from "@/lib/wallet/snapshotEntryPrice";
import {
  applyPositionStats,
  applySessionFunding,
  buildPositionStatsMap,
  type PositionStatsMap,
} from "@/lib/wallet/positionStats";
import {
  computeTradeMetrics,
  mergePnl,
} from "@/lib/wallet/performance";
import { productName } from "@/store/pairsStore";
import type {
  Position,
  TradeMatch,
  WalletStats,
} from "@/types/nado";
import { fromX18BigInt } from "@/types/nado";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccountStream, type FillEvent } from "@/hooks/useAccountStream";
import {
  toSubaccount,
  chunk,
  sleep,
  sortTradesNewestFirst,
  tradeIdentity,
  fetchSubaccounts,
  fetchIsolatedParentMaps,
  fetchSnapshotEntryPrices,
  fetchAllPositions,
  fetchOnePage,
  MATCHES_LIMIT,
  MAX_PAGES,
  MATCHES_BURST_MS,
  type SubaccountEntry,
  type MatchesPageResult,
} from "@/lib/wallet/walletFetchers";
import { useWalletMatchesCacheStore } from "@/store/walletMatchesCacheStore";
import { usePositionMatchesCacheStore } from "@/store/positionMatchesCacheStore";

const POSITIONS_POLL_MS = 6_000;
const POLL_MAX_BACKOFF_MS = 60_000;
const POLL_BACKOFF_THRESHOLD = 3;

function buildPnlStats(
  trades: TradeMatch[],
  funding_pnl_usd: number,
) {
  const tradeMetrics = computeTradeMetrics(trades);
  return mergePnl(tradeMetrics, funding_pnl_usd);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletData = {
  stats: WalletStats | null;
  trades: TradeMatch[];
  loading: boolean;
  phase1Ready: boolean;
  snapshotReady: boolean;
  positionTrades: TradeMatch[];
  positionMatchesComplete: boolean;
  globalMatchesComplete: boolean;
  /** @deprecated Use globalMatchesComplete */
  tradesComplete: boolean;
  error: string | null;
  refreshing: boolean;
  unrealizedRefreshing: boolean;
  spotBalancesRefreshing: boolean;
  refresh: () => Promise<void>;
  refreshUnrealizedPnl: () => Promise<void>;
  refreshSpotBalances: () => Promise<void>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWalletData(rawAddress: string): WalletData {
  const [data, setData] = useState<
    Omit<WalletData, "refresh" | "refreshUnrealizedPnl" | "refreshSpotBalances">
  >({
    stats: null,
    trades: [],
    loading: true,
    phase1Ready: false,
    snapshotReady: false,
    positionTrades: [],
    positionMatchesComplete: false,
    globalMatchesComplete: false,
    tradesComplete: false,
    error: null,
    refreshing: false,
    unrealizedRefreshing: false,
    spotBalancesRefreshing: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> | null>(null);
  const pollErrorCountRef = useRef(0);
  const gatewayStaleToastRef = useRef<string | number | null>(null);
  const subaccountsRef = useRef<SubaccountEntry[]>([]);
  const isolatedParentNameRef = useRef<Map<string, string>>(new Map());
  const isolatedParentSubaccountRef = useRef<Map<string, string>>(new Map());
  const tradesRef = useRef<TradeMatch[]>([]);
  /** Snapshot-derived entry prices — primary source. */
  const entryPriceMapRef = useRef<EntryPriceMap>(new Map());
  /** Position stats (fees + realized PnL) derived from all fetched trades. */
  const positionStatsMapRef = useRef<PositionStatsMap>(new Map());
  /** Highest submission_idx seen across all fetched trades — incremental fetch cursor. */
  const latestKnownIdxRef = useRef<string | null>(null);
  /** All trade identities seen — deduplication safety net across incremental fetches. */
  const seenTradeIdsRef = useRef<Set<string>>(new Set());
  /** amount_x18 per position key from previous poll — used to detect fills. */
  const prevAmountsRef = useRef<Map<string, string>>(new Map());
  /** Poll tick counter — used to schedule periodic pocket discovery (every 6 ticks = 30s). */
  const pollCountRef = useRef(0);
  /** Whether the full match history has been loaded — passed to buildPositionStatsMap. */
  const tradesCompleteRef = useRef(false);
  const refreshImplRef = useRef<() => Promise<void>>(async () => {});
  const refreshUnrealizedImplRef = useRef<() => Promise<void>>(async () => {});
  const refreshSpotBalancesImplRef = useRef<() => Promise<void>>(async () => {});
  // Subscribe to fill events via SSE for all cross subaccounts — toast notification only.
  // Falls back to [default] until stats.cross_subaccounts is populated after Phase 1.
  // Position stats are refreshed by the 6s poll fillDetected path (Archive, not WS).
  const streamSubaccounts = useMemo<string[] | null>(() =>
    data.stats?.cross_subaccounts?.length
      ? data.stats.cross_subaccounts.map(c => c.subaccount)
      : rawAddress ? [toSubaccount(rawAddress)] : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable when subaccount list hasn't changed
    [data.stats?.cross_subaccounts, rawAddress],
  );
  const onWsFill = useCallback((event: FillEvent) => {
    const pairLabel = productName(event.product_id) || `#${event.product_id}`;
    const direction = event.is_bid ? "Long" : "Short";
    const qty = Math.abs(fromX18BigInt(event.filled_qty));
    const price = fromX18BigInt(event.price);
    const role = event.is_taker ? "taker" : "maker";
    const toastFn = event.is_bid ? toast.success : toast.error;
    const fmtQty = Math.abs(qty) < 1
      ? qty.toLocaleString("en-US", { maximumFractionDigits: 5 })
      : qty.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const absPrice = Math.abs(price);
    const fmtPrice = absPrice > 0 && absPrice < 1
      ? price.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6 })
      : absPrice < 1000
        ? price.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3 })
        : price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    toastFn(`${pairLabel} — ${direction}`, {
      description: `${fmtQty} @ ${fmtPrice} · ${role}`,
    });
  }, []);
  useAccountStream(streamSubaccounts, { onFill: onWsFill });

  /** Position-scoped trades — separate from tradesRef (global). */
  const positionTradesRef = useRef<TradeMatch[]>([]);
  /** Earliest open time per position key — boundary for position-scoped funding. */
  const positionOpenTimeMapRef = useRef<Record<string, number>>({});
  /** Dedup set for position-scoped trade IDs. */
  const positionSeenTradeIdsRef = useRef<Set<string>>(new Set());
  /** Position-scoped funding payments — persisted so the poller can use them as fallback. */
  useEffect(() => {
    if (!rawAddress) return;

    let cancelled = false;
    const controller = new AbortController();
    const { signal } = controller;
    prevAmountsRef.current = new Map();
    positionTradesRef.current = [];
    positionOpenTimeMapRef.current = {};
    positionSeenTradeIdsRef.current = new Set();

    // Seed from matches cache if available — instant trades on re-visit
    const cached = useWalletMatchesCacheStore.getState().getCache(rawAddress);
    if (cached && cached.trades.length > 0) {
      tradesRef.current = cached.trades;
      latestKnownIdxRef.current = cached.latestKnownIdx;
      seenTradeIdsRef.current = new Set(cached.seenTradeIds);
      tradesCompleteRef.current = cached.globalMatchesComplete;
      const fs = useWalletFundingStore.getState().forAddress(rawAddress);
      const cachedPnl = buildPnlStats(cached.trades, fs?.fundingPaidUsd ?? 0);
      setData(prev => ({
        ...prev,
        trades: cached.trades,
        globalMatchesComplete: cached.globalMatchesComplete,
        tradesComplete: cached.globalMatchesComplete,
        stats: prev.stats ? { ...prev.stats, trades: cached.trades, ...cachedPnl } : null,
      }));
    }

    // Seed position stats from cache — instant Realized PnL on re-visit
    const posCached = usePositionMatchesCacheStore.getState().getCache(rawAddress);
    if (posCached && posCached.positionTrades.length > 0) {
      positionStatsMapRef.current = buildPositionStatsMap(posCached.positionTrades, true);
    }

    // Local wrappers that bind the shared signal to extracted fetchers
    const fetchSubs = () => fetchSubaccounts(rawAddress, signal);
    const fetchIsoMaps = (subs: SubaccountEntry[]) => fetchIsolatedParentMaps(subs, signal);
    const fetchSnapshots = (crossSubs: string[]) => fetchSnapshotEntryPrices(crossSubs, signal);
    const fetchAllPos = (
      subs: SubaccountEntry[],
      parentNameMap: Map<string, string>,
      parentSubMap: Map<string, string>,
    ) => fetchAllPositions(subs, parentNameMap, parentSubMap, signal);
    const fetchPage = (
      subs: string[],
      lastIdx?: string,
      productIds?: number[],
      noCache?: boolean,
    ) => fetchOnePage(subs, signal, lastIdx, productIds, noCache);


    /**
     * Fetch only trades newer than a known submission_idx (incremental).
     * Newest-first pages per chunk; stops when boundary is hit.
     * Double deduplication: BigInt cursor (layer 1) + seenTradeIdsRef (layer 2).
     */
    const MAX_INCREMENTAL_PAGES = 5;
    const fetchIncrementalTrades = async (
      chunks: string[][],
      knownIdx: string,
    ): Promise<TradeMatch[]> => {
      const newTrades: TradeMatch[] = [];
      const knownBigInt = BigInt(knownIdx);
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunkSubs = chunks[ci]!;
        let pageIdx: string | undefined = undefined;
        for (let p = 0; p < MAX_INCREMENTAL_PAGES; p++) {
          // Always bypass cache: incremental fetches specifically look for fills newer than
          // latestKnownIdx — a cached first page would return stale data without the new fill.
          const page = await fetchPage(chunkSubs, pageIdx, undefined, true);
          if (cancelled || page.rateLimited) break;
          let boundaryHit = false;
          for (const trade of page.trades) {
            try {
              if (BigInt(trade.submission_idx) <= knownBigInt) {
                boundaryHit = true;
                break;
              }
            } catch { /* non-numeric idx — include the trade */ }
            const id = tradeIdentity(trade);
            if (!seenTradeIdsRef.current.has(id)) {
              seenTradeIdsRef.current.add(id);
              newTrades.push(trade);
            }
          }
          if (boundaryHit || page.done) break;
          if (page.nextIdx) pageIdx = page.nextIdx;
          else break;
        }
        if (ci < chunks.length - 1) await sleep(MATCHES_BURST_MS);
      }
      return newTrades;
    };

    // ── Phase 2a: Position-scoped matches ─────────────────────────────────────
    // Cap independent of MAX_PAGES — keeps position-scoped fetching bounded.
    const MAX_POSITION_SCOPED_PAGES = 5;

    async function fetchPositionScopedMatches(openPositions: Position[], noCache = false): Promise<void> {
      type PairKey = {
        pocketSubaccount: string  // pocket address — unique position ID, matches funding key
        querySubaccount: string   // parent for isolated (Archive fills), pocket for cross
        productId: number
        isIsolated: boolean
      };
      const pairs: PairKey[] = openPositions
        .filter(p => fromX18BigInt(p.amount_x18) !== 0)
        .map(p => ({
          pocketSubaccount: p.subaccount,
          querySubaccount: p.isolated
            ? (p.parent_subaccount ?? p.subaccount)
            : p.subaccount,
          productId: p.product_id,
          isIsolated: p.isolated,
        }));

      if (pairs.length === 0) {
        setData(prev => ({ ...prev, positionMatchesComplete: true }));
        return;
      }

      const completedProducts = new Set<string>();
      const cursorByPair: Record<string, string | undefined> = {};

      let iteration = 0;
      while (completedProducts.size < pairs.length && iteration < MAX_POSITION_SCOPED_PAGES) {
        if (cancelled) break;
        for (const pair of pairs) {
          if (cancelled) break;
          const pairKey = `${pair.pocketSubaccount}:${pair.productId}`;
          if (completedProducts.has(pairKey)) continue;

          const result = await fetchPage(
            [pair.querySubaccount],
            cursorByPair[pairKey],
            [pair.productId],
            // Bypass Redis cache on first page only (no cursor) when fill-triggered.
            // Paginated pages are historical — always safe to cache.
            !cursorByPair[pairKey] ? noCache : false,
          );

          if (result.rateLimited || result.trades.length === 0) {
            completedProducts.add(pairKey);
            continue;
          }

          for (const trade of result.trades) {
            const tradeId = `${trade.submission_idx ?? ""}-${trade.subaccount ?? ""}-${trade.product_id}`;
            if (positionSeenTradeIdsRef.current.has(tradeId)) continue;
            positionSeenTradeIdsRef.current.add(tradeId);
            positionTradesRef.current.push(trade);

            // Only check the session-open boundary for trades matching this position's type.
            // When querying by parent for isolated, the page may also contain cross fills.
            if ((trade.isolated ?? false) !== pair.isIsolated) continue;

            // pre_balance_amount undefined → no boundary data on this trade, keep paginating.
            if (trade.pre_balance_amount === undefined) continue;

            const preBalance = fromX18BigInt(trade.pre_balance_amount);
            if (Math.abs(preBalance) < 1e-10) {
              // Found the session opener: position was flat before this trade.
              const timeSec = trade.timestamp
                ? Number(BigInt(trade.timestamp) / BigInt(1_000_000_000))
                : 0;
              positionOpenTimeMapRef.current[pairKey] = timeSec;
              completedProducts.add(pairKey);
              break;
            }
          }

          if (!completedProducts.has(pairKey)) {
            if (result.done) {
              completedProducts.add(pairKey);
            } else {
              cursorByPair[pairKey] = result.nextIdx ?? undefined;
            }
          }

          await new Promise<void>(r => setTimeout(r, MATCHES_BURST_MS));
        }
        iteration++;
      }

      // Build and apply stats immediately so Fees + Realized PnL show real values
      // the moment positionMatchesComplete flips — before Phase 2b (funding) loads.
      const matchStatsMap = buildPositionStatsMap(positionTradesRef.current, true);
      positionStatsMapRef.current = matchStatsMap;
      setData(prev => ({
        ...prev,
        positionTrades: [...positionTradesRef.current],
        positionMatchesComplete: true,
        stats: prev.stats
          ? {
              ...prev.stats,
              positions: applyPositionStats(prev.stats.positions, matchStatsMap),
            }
          : null,
      }));
    }

    // ── Phase 2b: Position-scoped funding ─────────────────────────────────────
    async function loadPositionFundingPhase2b(openPositions: Position[]): Promise<void> {
      const openPerpProductIds = Array.from(new Set(
        openPositions
          .filter(p => fromX18BigInt(p.amount_x18) !== 0)
          .map(p => p.product_id),
      ));

      if (openPerpProductIds.length === 0) {
        useWalletFundingStore.getState().setPositionFunding(rawAddress, [], []);
        return;
      }

      const openTimeKeyByQueryKey = new Map<string, string>();
      const subaccountsWithPerps = Array.from(new Set(
        openPositions
          .filter(p => fromX18BigInt(p.amount_x18) !== 0)
          .map(p => {
            const querySubaccount = p.isolated
              ? (p.parent_subaccount ?? p.subaccount)
              : p.subaccount;
            openTimeKeyByQueryKey.set(
              `${querySubaccount}:${p.product_id}`,
              `${p.subaccount}:${p.product_id}`,
            );
            return querySubaccount;
          }),
      ));

      const accumulated = await fetchPositionScopedFunding({
        subaccountsWithPerps,
        openPerpProductIds,
        openTimeKeyByQueryKey,
        positionOpenTimeMap: positionOpenTimeMapRef.current,
      }, signal);

      const positionSessionStatsMap = buildPositionStatsMap(positionTradesRef.current, true);
      positionStatsMapRef.current = positionSessionStatsMap;
      useWalletFundingStore.getState().setPositionFunding(rawAddress, accumulated, openPerpProductIds);

      if (!cancelled) {
        setData(prev => ({
          ...prev,
          stats: prev.stats
            ? {
                ...prev.stats,
                positions: applySessionFunding(
                  applyPositionStats(prev.stats.positions, positionSessionStatsMap),
                  positionSessionStatsMap,
                  accumulated,
                ),
              }
            : null,
        }));
      }
    }

    const loadWallet = async (mode: "initial" | "refresh") => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }

      if (mode === "refresh") {
        setData((prev) => ({
          ...prev,
          refreshing: true,
          error: null,
        }));
      }

      try {
      const subs = await fetchSubs();
      if (cancelled) return;
      subaccountsRef.current = subs;
      {
        const parentMaps = await fetchIsoMaps(subs);
        isolatedParentNameRef.current =
          parentMaps.parentNameByIsolatedSubaccount;
        isolatedParentSubaccountRef.current =
          parentMaps.parentSubaccountByIsolatedSubaccount;
      }
      if (
        isolatedParentNameRef.current.size === 0 &&
        subs.some((s) => s.isolated)
      ) {
        await sleep(200);
        const parentMaps = await fetchIsoMaps(subs);
        isolatedParentNameRef.current =
          parentMaps.parentNameByIsolatedSubaccount;
        isolatedParentSubaccountRef.current =
          parentMaps.parentSubaccountByIsolatedSubaccount;
      }
      if (cancelled) return;
      const subAddrs = subs.map((s) => s.subaccount);
      useWalletFundingStore.getState().setSubaccounts(rawAddress, subAddrs);

      const subaccountChunks = chunk(subAddrs, 5);

      const positionData = await fetchAllPos(
        subs,
        isolatedParentNameRef.current,
        isolatedParentSubaccountRef.current,
      );
      if (cancelled) return;

      if (positionData.allFailed) {
        setData((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: "Gateway unavailable — retrying…",
        }));
        intervalRef.current = setTimeout(() => {
          if (!cancelled) void loadWallet("refresh");
        }, POSITIONS_POLL_MS * 2);
        return;
      }

      // ── Phase 1: positions loaded — render immediately ────────────────────
      const initialPnlStats = buildPnlStats([], 0);
      const initPositions = applySessionFunding(
        applyPositionStats(
          applySnapshotEntryPrices(positionData.positions, entryPriceMapRef.current),
          positionStatsMapRef.current,
        ),
        positionStatsMapRef.current,
        [],
      );
      const initTotals = recomputeUnrealizedTotals(initPositions, positionData.equityUsd, positionData.unrealizedTotal);
      const hasCachedTradesForPhase1 = tradesRef.current.length > 0;
      const cachedPnlForPhase1 = hasCachedTradesForPhase1
        ? buildPnlStats(tradesRef.current, useWalletFundingStore.getState().forAddress(rawAddress)?.fundingPaidUsd ?? 0)
        : initialPnlStats;
      setData({
        stats: {
          address: rawAddress,
          health_score: positionData.healthScore,
          subaccount_healths: positionData.subaccountHealths,
          total_equity_usd: initTotals.equityUsd,
          available_margin: positionData.availableMargin,
          maintenance_margin: positionData.maintenanceMargin,
          unrealized_pnl_usd: initTotals.unrealizedTotal,
          positions: initPositions,
          spot_balances: positionData.spotBalances,
          spot_balances_by_subaccount: positionData.spotBalancesBySubaccount,
          cross_subaccounts: positionData.crossSubaccounts,
          trades: hasCachedTradesForPhase1 ? tradesRef.current : [],
          trades_complete: hasCachedTradesForPhase1 && tradesCompleteRef.current,
          ...cachedPnlForPhase1,
        },
        trades: hasCachedTradesForPhase1 ? tradesRef.current : [],
        loading: false,
        phase1Ready: true,
        snapshotReady: false,
        positionTrades: [],
        positionMatchesComplete: false,
        globalMatchesComplete: hasCachedTradesForPhase1 && tradesCompleteRef.current,
        tradesComplete: hasCachedTradesForPhase1 && tradesCompleteRef.current,
        refreshing: false,
        unrealizedRefreshing: false,
        spotBalancesRefreshing: false,
        error: null,
      });

      // ── Phase 2 + 3 (concurrent, background) ─────────────────────────────

      // Phase 2: position-scoped matches → position-scoped funding (sequential)
      const phase2 = (async () => {
        await fetchPositionScopedMatches(positionData.positions, true);
        if (!cancelled && positionTradesRef.current.length > 0) {
          usePositionMatchesCacheStore.getState().setCache(rawAddress, {
            positionTrades: [...positionTradesRef.current],
            positionOpenTimeMap: { ...positionOpenTimeMapRef.current },
          });
        }
        if (cancelled) return;
        await loadPositionFundingPhase2b(positionData.positions);
      })();

      // Snapshot entry prices (background, updates avg entry)
      const snapshotsTask = (async () => {
        const crossSubaccounts = subs.filter((s) => !s.isolated).map((s) => s.subaccount);
        entryPriceMapRef.current = await fetchSnapshots(crossSubaccounts);
        if (cancelled) return;
        setData((prev) => {
          if (!prev.stats) return { ...prev, snapshotReady: true };
          const fs = useWalletFundingStore.getState().forAddress(rawAddress);
          const ef = (fs?.fundingPayments.length ?? 0) > 0
            ? (fs?.fundingPayments ?? []) : (fs?.positionFundingPayments ?? []);
          const corrected = applySessionFunding(
            applyPositionStats(
              applySnapshotEntryPrices(prev.stats.positions, entryPriceMapRef.current),
              positionStatsMapRef.current,
            ),
            positionStatsMapRef.current,
            ef,
          );
          const totals = recomputeUnrealizedTotals(corrected, prev.stats.total_equity_usd, prev.stats.unrealized_pnl_usd);
          return {
            ...prev,
            snapshotReady: true,
            stats: {
              ...prev.stats,
              positions: corrected,
              unrealized_pnl_usd: totals.unrealizedTotal,
              total_equity_usd: totals.equityUsd,
            },
          };
        });
      })();

      // Phase 3a: global background pagination loop (first page + remaining pages)
      // If cache already has complete trades, skip full pagination — incremental only.
      const hasCachedTrades = cached && cached.trades.length > 0;
      const phase3a = (async () => {
        if (hasCachedTrades && cached.globalMatchesComplete) {
          // Phase 1 wiped trades/flags via full setData replace — restore from refs
          if (!cancelled) {
            const fs = useWalletFundingStore.getState().forAddress(rawAddress);
            const pnl = buildPnlStats(tradesRef.current, fs?.fundingPaidUsd ?? 0);
            setData(prev => ({
              ...prev,
              trades: tradesRef.current,
              globalMatchesComplete: true,
              tradesComplete: true,
              stats: prev.stats
                ? { ...prev.stats, trades: tradesRef.current, trades_complete: true, ...pnl }
                : null,
            }));
          }
          // Incremental catch-up for trades newer than cache
          if (latestKnownIdxRef.current && !cancelled) {
            const newTrades = await fetchIncrementalTrades(subaccountChunks, latestKnownIdxRef.current);
            if (!cancelled && newTrades.length > 0) {
              const merged = sortTradesNewestFirst([...newTrades, ...tradesRef.current]);
              tradesRef.current = merged;
              seenTradeIdsRef.current = new Set(merged.map(tradeIdentity));
              latestKnownIdxRef.current = merged[0]?.submission_idx ?? latestKnownIdxRef.current;
              const fs = useWalletFundingStore.getState().forAddress(rawAddress);
              const pnl = buildPnlStats(merged, fs?.fundingPaidUsd ?? 0);
              setData(prev => ({
                ...prev,
                trades: merged,
                stats: prev.stats ? { ...prev.stats, trades: merged, ...pnl } : null,
              }));
            }
          }
          return;
        }

        let firstPages: MatchesPageResult[];
        try {
          const pages: MatchesPageResult[] = [];
          for (let c = 0; c < subaccountChunks.length; c++) {
            const subChunk = subaccountChunks[c]!;
            const p = await fetchPage(subChunk);
            if (p.rateLimited) throw new Error("RATE_LIMIT");
            pages.push(p);
            if (c < subaccountChunks.length - 1) await sleep(MATCHES_BURST_MS);
          }
          firstPages = pages;
        } catch (e) {
          if (cancelled) return;
          if (e instanceof Error && e.message === "RATE_LIMIT") {
            setData((prev) => ({
              ...prev,
              error:
                prev.error ??
                "Archive rate limit — wait a minute and refresh, or open fewer tabs.",
            }));
            return;
          }
          throw e;
        }
        if (cancelled) return;

        let allTrades = sortTradesNewestFirst(firstPages.flatMap((page) => page.trades));
        seenTradeIdsRef.current = new Set(allTrades.map(tradeIdentity));
        tradesRef.current = allTrades;
        latestKnownIdxRef.current = allTrades[0]?.submission_idx ?? null;
        tradesCompleteRef.current = false;
        // positionStatsMapRef is set exclusively by Phase 2b (position-scoped matches).
        // Global trades are used only for overall wallet PnL stats, not per-position columns.
        // Update data after first-page trades arrive
        setData((prev) => {
          const fs = useWalletFundingStore.getState().forAddress(rawAddress);
          const pnlStats = buildPnlStats(allTrades, fs?.fundingPaidUsd ?? 0);
          return {
          ...prev,
          trades: allTrades,
          stats: prev.stats
            ? {
                ...prev.stats,
                trades: allTrades,
                trades_complete: firstPages.every((page) => page.done),
                ...pnlStats,
                positions: (() => {
                  const ef = (fs?.fundingPayments.length ?? 0) > 0
                    ? (fs?.fundingPayments ?? []) : (fs?.positionFundingPayments ?? []);
                  return applySessionFunding(
                    applyPositionStats(
                      applySnapshotEntryPrices(prev.stats.positions, entryPriceMapRef.current),
                      positionStatsMapRef.current,
                    ),
                    positionStatsMapRef.current,
                    ef,
                  );
                })(),
              }
            : null,
          globalMatchesComplete: firstPages.every((page) => page.done),
          tradesComplete: firstPages.every((page) => page.done),
        };});

        // Catch-up: one no-cache fetch to bridge Redis cache lag — runs once per page load.
        // If Redis served stale data (old 24h TTL entry), this surfaces trades made after
        // the cache was written without waiting for a poll tick or manual refresh.
        if (latestKnownIdxRef.current && !cancelled) {
          const catchUpTrades = await fetchIncrementalTrades(subaccountChunks, latestKnownIdxRef.current);
          if (!cancelled && catchUpTrades.length > 0) {
            allTrades = sortTradesNewestFirst([...catchUpTrades, ...allTrades]);
            seenTradeIdsRef.current = new Set(allTrades.map(tradeIdentity));
            tradesRef.current = allTrades;
            latestKnownIdxRef.current = allTrades[0]?.submission_idx ?? latestKnownIdxRef.current;
            setData((prev) => {
              const catchUpStats = buildPnlStats(allTrades, useWalletFundingStore.getState().forAddress(rawAddress)?.fundingPaidUsd ?? 0);
              return {
              ...prev,
              trades: allTrades,
              stats: prev.stats ? { ...prev.stats, trades: allTrades, ...catchUpStats } : null,
            };});
          }
        }

        // Background: fetch remaining pages
        if (firstPages.some((page) => !page.done)) {
          const chunkStates = firstPages.map((page, idx) => ({
            chunk: subaccountChunks[idx],
            done: page.done,
            nextIdx: page.nextIdx,
          }));
          let truncatedByPageLimit = false;
          outerMatches: for (let page = 1; page < MAX_PAGES && !cancelled; page++) {
            const active = chunkStates.filter((state) => !state.done);
            if (active.length === 0) break;

            for (let a = 0; a < active.length; a++) {
              const state = active[a]!;
              const result = await fetchPage(
                state.chunk,
                state.nextIdx ?? undefined,
              );
              if (cancelled) break outerMatches;
              if (result.rateLimited) {
                setData((prev) => ({
                  ...prev,
                  error:
                    prev.error ??
                    "Archive rate limit while loading history — partial data shown.",
                  globalMatchesComplete: false,
                  tradesComplete: false,
                  stats: prev.stats
                    ? { ...prev.stats, trades_complete: false }
                    : null,
                }));
                break outerMatches;
              }

              state.done = result.done;
              state.nextIdx = result.nextIdx;
              const uniqueTrades = result.trades.filter((trade) => {
                const id = tradeIdentity(trade);
                if (seenTradeIdsRef.current.has(id)) return false;
                seenTradeIdsRef.current.add(id);
                return true;
              });
              allTrades = sortTradesNewestFirst([...allTrades, ...uniqueTrades]);
              if (a < active.length - 1) await sleep(MATCHES_BURST_MS);
            }

            tradesRef.current = allTrades;
            latestKnownIdxRef.current = allTrades[0]?.submission_idx ?? latestKnownIdxRef.current;
            const allDone = chunkStates.every((state) => state.done);
            tradesCompleteRef.current = allDone || page === MAX_PAGES - 1;
            setData((prev) => {
              const fs = useWalletFundingStore.getState().forAddress(rawAddress);
              const updatedStats = buildPnlStats(allTrades, fs?.fundingPaidUsd ?? 0);
              return {
              ...prev,
              trades: allTrades,
              globalMatchesComplete: allDone || page === MAX_PAGES - 1,
              tradesComplete: allDone || page === MAX_PAGES - 1,
              stats: prev.stats
                ? {
                    ...prev.stats,
                    trades: allTrades,
                    trades_complete: allDone || page === MAX_PAGES - 1,
                    ...updatedStats,
                    positions: (() => {
                      const ef = (fs?.fundingPayments.length ?? 0) > 0
                        ? (fs?.fundingPayments ?? []) : (fs?.positionFundingPayments ?? []);
                      return applySessionFunding(
                        applyPositionStats(
                          applySnapshotEntryPrices(prev.stats.positions, entryPriceMapRef.current),
                          positionStatsMapRef.current,
                        ),
                        positionStatsMapRef.current,
                        ef,
                      );
                    })(),
                  }
                : null,
            };});

            if (allDone) break;
            if (page === MAX_PAGES - 1) truncatedByPageLimit = true;
          }

          // Ensure UI keeps "loading history" when we hit local page cap.
          if (!cancelled) {
            setData((prev) => ({
              ...prev,
              globalMatchesComplete: !truncatedByPageLimit,
              tradesComplete: !truncatedByPageLimit,
              stats: prev.stats
                ? { ...prev.stats, trades_complete: !truncatedByPageLimit }
                : null,
            }));
          }
        }
      })();

      // Wait for all background tasks — don't block UI (already rendered at Phase 1)
      await Promise.all([phase2, snapshotsTask, phase3a]).catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error("[useWalletData] background phase error:", e);
      });

      if (!cancelled && tradesRef.current.length > 0) {
        useWalletMatchesCacheStore.getState().setCache(rawAddress, {
          trades: tradesRef.current,
          latestKnownIdx: latestKnownIdxRef.current,
          seenTradeIds: new Set(seenTradeIdsRef.current),
          globalMatchesComplete: tradesCompleteRef.current,
        });
      }

      // Poll live position marks / unrealized only — subaccount_info only (Gateway).
      // avg_entry (account_snapshots) is cached and only re-fetched when a fill is detected:
      // if any position's amount_x18 changed since the last tick, a fill happened and the
      // avg_entry must be refreshed. Otherwise we skip the Archive call entirely.
      const pollPositionsOnly = async () => {
        try {
          if (cancelled) return;
          let pd = await fetchAllPos(
            subaccountsRef.current,
            isolatedParentNameRef.current,
            isolatedParentSubaccountRef.current,
          );
          if (cancelled) return;

          if (pd.anyFailed) {
            pollErrorCountRef.current += 1;
            if (pollErrorCountRef.current >= POLL_BACKOFF_THRESHOLD && !gatewayStaleToastRef.current) {
              gatewayStaleToastRef.current = toast.warning(
                "Gateway unstable — showing last known data",
                { duration: Infinity },
              );
            }
            return;
          }

          if (gatewayStaleToastRef.current) {
            toast.dismiss(gatewayStaleToastRef.current);
            gatewayStaleToastRef.current = null;
          }
          pollErrorCountRef.current = 0;

          // Periodic isolated pocket discovery (every 6 ticks = 30s) + immediate fix
          // when a known pocket has no parent mapping.
          // Calls isolated_positions on each cross subaccount — lightweight Gateway query.
          // Rebuilds subaccountsRef with ONLY active pockets (prunes dead ones too).
          pollCountRef.current += 1;
          const hasUnmappedIsolated = pd.positions.some(
            (p) => p.isolated && !isolatedParentNameRef.current.has(p.subaccount.toLowerCase()),
          );
          const shouldDiscover = hasUnmappedIsolated || pollCountRef.current % 6 === 0;

          if (shouldDiscover) {
            const freshMaps = await fetchIsoMaps(subaccountsRef.current);
            if (cancelled) return;

            // Rebuild isolated entries: only pockets currently active in isolated_positions.
            const activePockets = freshMaps.parentNameByIsolatedSubaccount; // key = pocket lower
            const crossSubs = subaccountsRef.current.filter((s) => !s.isolated);
            const isolatedEntries: SubaccountEntry[] = [];
            for (const pocket of activePockets.keys()) {
              const existing = subaccountsRef.current.find(
                (s) => s.subaccount.toLowerCase() === pocket,
              );
              isolatedEntries.push(existing ?? { subaccount: pocket, isolated: true });
            }
            const newList = [...crossSubs, ...isolatedEntries];

            const listChanged =
              newList.length !== subaccountsRef.current.length ||
              newList.some(
                (s, i) =>
                  s.subaccount.toLowerCase() !==
                  subaccountsRef.current[i]?.subaccount.toLowerCase(),
              );

            subaccountsRef.current = newList;
            isolatedParentNameRef.current = freshMaps.parentNameByIsolatedSubaccount;
            isolatedParentSubaccountRef.current = freshMaps.parentSubaccountByIsolatedSubaccount;

            if (listChanged || hasUnmappedIsolated) {
              const refreshed = await fetchAllPos(
                subaccountsRef.current,
                isolatedParentNameRef.current,
                isolatedParentSubaccountRef.current,
              );
              if (cancelled) return;
              if (refreshed.anyFailed) {
                pollErrorCountRef.current += 1;
                return;
              }
              pd = refreshed;
            }
          }

          // Detect fills: compare amount_x18 with previous poll.
          // prevAmountsRef is empty on the first poll (skip re-fetch — snapshots were just loaded).
          const prev = prevAmountsRef.current;
          const newPositionKeys = new Set(
            pd.positions.map((pos) => `${pos.subaccount}:${pos.product_id}`),
          );
          const fillDetected =
            prev.size > 0 &&
            (pd.positions.some((pos) => {
              const key = `${pos.subaccount}:${pos.product_id}`;
              const prevAmt = prev.get(key);
              return prevAmt === undefined || prevAmt !== pos.amount_x18;
            }) ||
              // Position closed: a previously-tracked key is no longer in the poll.
              [...prev.keys()].some((key) => !newPositionKeys.has(key)));
          prevAmountsRef.current = new Map(
            pd.positions.map((pos) => [`${pos.subaccount}:${pos.product_id}`, pos.amount_x18]),
          );

          let tradeHistoryUpdated = false;
          if (fillDetected) {
            // Refresh snapshot entry prices for avg entry accuracy
            const crossSubs = subaccountsRef.current.filter(s => !s.isolated).map(s => s.subaccount);
            entryPriceMapRef.current = await fetchSnapshots(crossSubs);
            if (cancelled) return;
            // Re-fetch position-scoped matches from the session opener (pre_balance=0 boundary).
            // This is the authoritative source for per-position fees and realized PnL.
            // Avoids the Archive-lag race where global trades find a stale prior-session boundary.
            positionTradesRef.current = [];
            positionSeenTradeIdsRef.current = new Set();
            positionOpenTimeMapRef.current = {};
            await fetchPositionScopedMatches(pd.positions, true);
            if (cancelled) return;
            positionStatsMapRef.current = buildPositionStatsMap(positionTradesRef.current, true);
            usePositionMatchesCacheStore.getState().setCache(rawAddress, {
              positionTrades: [...positionTradesRef.current],
              positionOpenTimeMap: { ...positionOpenTimeMapRef.current },
            });

            // Also pull new fills into the global trade history (WalletTradeHistory).
            // Redis TTL for first-page is 15s, so this sees fresh data after the fill.
            if (latestKnownIdxRef.current) {
              const newTrades = await fetchIncrementalTrades(
                subaccountChunks,
                latestKnownIdxRef.current,
              );
              if (!cancelled && newTrades.length > 0) {
                const merged = sortTradesNewestFirst([...newTrades, ...tradesRef.current]);
                tradesRef.current = merged;
                latestKnownIdxRef.current = merged[0]?.submission_idx ?? latestKnownIdxRef.current;
                tradeHistoryUpdated = true;
              }
            }
          }
          if (cancelled) return;
          // Use global funding if loaded (CTA clicked), otherwise fall back to position-scoped funding.
          const fState = useWalletFundingStore.getState().forAddress(rawAddress);
          const effectiveFunding = (fState?.fundingPayments.length ?? 0) > 0
            ? (fState?.fundingPayments ?? [])
            : (fState?.positionFundingPayments ?? []);
          const pollPositions = applySessionFunding(
            applyPositionStats(
              applySnapshotEntryPrices(pd.positions, entryPriceMapRef.current),
              positionStatsMapRef.current,
            ),
            positionStatsMapRef.current,
            effectiveFunding,
          );
          const pollTotals = recomputeUnrealizedTotals(pollPositions, pd.equityUsd, pd.unrealizedTotal);
          const tradeStats = tradeHistoryUpdated
            ? buildPnlStats(tradesRef.current, fState?.fundingPaidUsd ?? 0)
            : {};
          setData((prev) => ({
            ...prev,
            ...(tradeHistoryUpdated ? { trades: tradesRef.current } : {}),
            stats: prev.stats
              ? {
                  ...prev.stats,
                  positions: pollPositions,
                  health_score: pd.healthScore,
                  subaccount_healths: pd.subaccountHealths,
                  total_equity_usd: pollTotals.equityUsd,
                  available_margin: pd.availableMargin,
                  maintenance_margin: pd.maintenanceMargin,
                  spot_balances: pd.spotBalances,
                  spot_balances_by_subaccount: pd.spotBalancesBySubaccount,
                  cross_subaccounts: pd.crossSubaccounts,
                  unrealized_pnl_usd: pollTotals.unrealizedTotal,
                  ...(tradeHistoryUpdated ? { trades: tradesRef.current } : {}),
                  ...tradeStats,
                }
              : null,
          }));
          if (tradeHistoryUpdated) {
            useWalletMatchesCacheStore.getState().setCache(rawAddress, {
              trades: tradesRef.current,
              latestKnownIdx: latestKnownIdxRef.current,
              seenTradeIds: new Set(seenTradeIdsRef.current),
            });
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          console.error('[useWalletData] pollPositionsOnly error:', e);
          pollErrorCountRef.current += 1;
        }
      };

      const schedulePoll = () => {
        const errors = pollErrorCountRef.current;
        const delay = errors >= POLL_BACKOFF_THRESHOLD
          ? Math.min(POSITIONS_POLL_MS * (2 ** (errors - POLL_BACKOFF_THRESHOLD + 1)), POLL_MAX_BACKOFF_MS)
          : POSITIONS_POLL_MS;
        intervalRef.current = setTimeout(() => {
          void pollPositionsOnly().finally(() => {
            if (!cancelled) schedulePoll();
          });
        }, delay);
      };
      schedulePoll();

      refreshUnrealizedImplRef.current = async () => {
        if (cancelled) return;
        setData((prev) => ({ ...prev, unrealizedRefreshing: true }));
        try {
          // Re-discover subaccounts from Archive — picks up brand-new isolated pockets
          // created after the initial page load.
          const freshSubs = await fetchSubs();
          if (cancelled) return;
          subaccountsRef.current = freshSubs;

          // Re-fetch isolated parent maps with the updated subaccount list.
          const freshMaps = await fetchIsoMaps(freshSubs);
          if (!cancelled) {
            isolatedParentNameRef.current = freshMaps.parentNameByIsolatedSubaccount;
            isolatedParentSubaccountRef.current = freshMaps.parentSubaccountByIsolatedSubaccount;
          }
          if (cancelled) return;

          const pd = await fetchAllPos(
            subaccountsRef.current,
            isolatedParentNameRef.current,
            isolatedParentSubaccountRef.current,
          );
          if (cancelled) return;

          if (pd.anyFailed) {
            setData((prev) => ({ ...prev, unrealizedRefreshing: false }));
            return;
          }

          // Refresh snapshot entry prices for avg entry accuracy
          const refreshedCrossSubs = subaccountsRef.current
            .filter((s) => !s.isolated)
            .map((s) => s.subaccount);
          entryPriceMapRef.current = await fetchSnapshots(refreshedCrossSubs);
          if (cancelled) return;
          // Re-fetch position-scoped matches so position stats reflect the current session
          positionTradesRef.current = [];
          positionSeenTradeIdsRef.current = new Set();
          positionOpenTimeMapRef.current = {};
          await fetchPositionScopedMatches(pd.positions);
          if (cancelled) return;
          positionStatsMapRef.current = buildPositionStatsMap(positionTradesRef.current, true);
          usePositionMatchesCacheStore.getState().setCache(rawAddress, {
            positionTrades: [...positionTradesRef.current],
            positionOpenTimeMap: { ...positionOpenTimeMapRef.current },
          });

          const fStore = useWalletFundingStore.getState().forAddress(rawAddress);
          const effectiveFundingR = (fStore?.fundingPayments.length ?? 0) > 0
            ? (fStore?.fundingPayments ?? [])
            : (fStore?.positionFundingPayments ?? []);
          const refreshPositions = applySessionFunding(
            applyPositionStats(
              applySnapshotEntryPrices(pd.positions, entryPriceMapRef.current),
              positionStatsMapRef.current,
            ),
            positionStatsMapRef.current,
            effectiveFundingR,
          );
          const refreshTotals = recomputeUnrealizedTotals(refreshPositions, pd.equityUsd, pd.unrealizedTotal);
          setData((prev) => ({
            ...prev,
            unrealizedRefreshing: false,
            stats: prev.stats
              ? {
                  ...prev.stats,
                  positions: refreshPositions,
                  health_score: pd.healthScore,
                  subaccount_healths: pd.subaccountHealths,
                  total_equity_usd: refreshTotals.equityUsd,
                  available_margin: pd.availableMargin,
                  maintenance_margin: pd.maintenanceMargin,
                  spot_balances: pd.spotBalances,
                  spot_balances_by_subaccount: pd.spotBalancesBySubaccount,
                  cross_subaccounts: pd.crossSubaccounts,
                  unrealized_pnl_usd: refreshTotals.unrealizedTotal,
                }
              : null,
          }));
        } catch {
          setData((prev) => ({ ...prev, unrealizedRefreshing: false }));
        }
      };

      refreshSpotBalancesImplRef.current = async () => {
        if (cancelled) return;
        setData((prev) => ({ ...prev, spotBalancesRefreshing: true }));
        try {
          const freshSubs = await fetchSubs();
          if (cancelled) {
            setData((prev) => ({ ...prev, spotBalancesRefreshing: false }));
            return;
          }
          subaccountsRef.current = freshSubs;

          const crossSubs = freshSubs.filter((s) => !s.isolated);
          if (crossSubs.length === 0) {
            setData((prev) => ({
              ...prev,
              spotBalancesRefreshing: false,
              stats: prev.stats
                ? {
                    ...prev.stats,
                    spot_balances: [],
                    spot_balances_by_subaccount: [],
                    cross_subaccounts: [],
                  }
                : null,
            }));
            return;
          }

          const pd = await fetchAllPos(
            crossSubs,
            isolatedParentNameRef.current,
            isolatedParentSubaccountRef.current,
          );
          if (cancelled) {
            setData((prev) => ({ ...prev, spotBalancesRefreshing: false }));
            return;
          }

          if (pd.anyFailed) {
            setData((prev) => ({ ...prev, spotBalancesRefreshing: false }));
            return;
          }

          setData((prev) => ({
            ...prev,
            spotBalancesRefreshing: false,
            stats: prev.stats
              ? {
                  ...prev.stats,
                  spot_balances: pd.spotBalances,
                  spot_balances_by_subaccount: pd.spotBalancesBySubaccount,
                  cross_subaccounts: pd.crossSubaccounts,
                }
              : null,
          }));
        } catch {
          setData((prev) => ({ ...prev, spotBalancesRefreshing: false }));
        }
      };
      } finally {
        if (cancelled && mode === "refresh") {
          setData((prev) => ({ ...prev, refreshing: false }));
        }
      }
    };

    refreshImplRef.current = async () => {
      if (cancelled) return;
      setData((prev) => ({ ...prev, refreshing: true, error: null }));
      try {
        const knownIdx = latestKnownIdxRef.current;
        const subAddrs = subaccountsRef.current.map((s) => s.subaccount);
        const chunks = chunk(subAddrs, 5);

        // Fetch only new trades since last known idx (incremental).
        // Fall back to full reload if no cursor (shouldn't happen after initial load).
        const newTrades = knownIdx
          ? await fetchIncrementalTrades(chunks, knownIdx)
          : [];

        if (cancelled) return;

        if (newTrades.length > 0) {
          const updatedTrades = sortTradesNewestFirst([...newTrades, ...tradesRef.current]);
          tradesRef.current = updatedTrades;
          latestKnownIdxRef.current = updatedTrades[0]?.submission_idx ?? latestKnownIdxRef.current;
          setData((prev) => {
            if (!prev.stats) return prev;
            const pnl = buildPnlStats(updatedTrades, useWalletFundingStore.getState().forAddress(rawAddress)?.fundingPaidUsd ?? 0);
            return { ...prev, trades: updatedTrades, stats: { ...prev.stats, trades: updatedTrades, ...pnl } };
          });
        }

        setData((prev) => ({ ...prev, refreshing: false }));
      } catch {
        setData((prev) => ({
          ...prev,
          refreshing: false,
          error: prev.error ?? "Refresh failed",
        }));
      }
    };

    void loadWallet("initial").catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error("[useWalletData] loadWallet failed:", e);
      if (!cancelled)
        setData((p) => ({
          ...p,
          loading: false,
          refreshing: false,
          unrealizedRefreshing: false,
          spotBalancesRefreshing: false,
          globalMatchesComplete: true,
          tradesComplete: true,
          stats: p.stats ? { ...p.stats, trades_complete: true } : null,
          error: "Failed to load wallet data",
        }));
    });

    return () => {
      cancelled = true;
      controller.abort();
      if (intervalRef.current) clearTimeout(intervalRef.current);
      if (gatewayStaleToastRef.current) {
        toast.dismiss(gatewayStaleToastRef.current);
        gatewayStaleToastRef.current = null;
      }
    };
  }, [rawAddress]);

  // Rebuild stats.net_pnl_usd when global funding finishes loading.
  // buildPnlStats only reruns on trade changes — this bridges the gap.
  useEffect(() => {
    if (!rawAddress) return;
    let prev = useWalletFundingStore.getState().forAddress(rawAddress)?.fundingPaidUsd ?? 0;
    const unsub = useWalletFundingStore.subscribe((state) => {
      const next = state.forAddress(rawAddress)?.fundingPaidUsd ?? 0;
      if (next === prev) return;
      prev = next;
      if (tradesRef.current.length === 0) return;
      setData((d) => {
        if (!d.stats) return d;
        const pnlStats = buildPnlStats(tradesRef.current, next);
        return { ...d, stats: { ...d.stats, ...pnlStats } };
      });
    });
    return unsub;
  }, [rawAddress]);

  return {
    ...data,
    refresh: () => refreshImplRef.current(),
    refreshUnrealizedPnl: () => refreshUnrealizedImplRef.current(),
    refreshSpotBalances: () => refreshSpotBalancesImplRef.current(),
  };
}
