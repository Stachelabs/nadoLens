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
import type { BannerEntry } from "@/components/wallet/WalletBanner";
import { useWalletMatchesCacheStore } from "@/store/walletMatchesCacheStore";
import { usePositionMatchesCacheStore } from "@/store/positionMatchesCacheStore";

const POSITIONS_POLL_MS = 6_000;
const POSITIONS_POLL_PHASE2_MS = 12_000;
const POLL_MAX_BACKOFF_MS = 60_000;
const POLL_BACKOFF_THRESHOLD = 3;
const MATCHES_429_BASE_DELAY = 3_000;
const MATCHES_429_JITTER = 2_000;
const MATCHES_429_MAX_ATTEMPTS = 3;
const MATCHES_STAGGER_MAX_MS = 5_000;
const REMAINING_MATCHES_DELAY_MS = 7_000;
const RETRY_429_DEADLINE_MS = 60_000;
const DISCOVERY_INTERVAL_TICKS = 10;
const DEMOTION_THRESHOLD = 2;

function deriveActiveSubaccounts(
  allSubs: SubaccountEntry[],
  positions: Position[],
): SubaccountEntry[] {
  const subsWithPositions = new Set(
    positions.map((p) => p.subaccount.toLowerCase()),
  );
  return allSubs.filter(
    (s) => subsWithPositions.has(s.subaccount.toLowerCase()),
  );
}


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
  matchedPositionKeys: string[];
  globalMatchesComplete: boolean;
  /** @deprecated Use globalMatchesComplete */
  tradesComplete: boolean;
  error: string | null;
  positionError: string | null;
  matchesError: string | null;
  refreshing: boolean;
  unrealizedRefreshing: boolean;
  spotBalancesRefreshing: boolean;
  bannerState: BannerEntry[];
  refresh: () => Promise<void>;
  refreshUnrealizedPnl: () => Promise<void>;
  refreshSpotBalances: () => Promise<void>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWalletData(rawAddress: string): WalletData {
  const [data, setData] = useState<
    Omit<WalletData, "refresh" | "refreshUnrealizedPnl" | "refreshSpotBalances" | "bannerState">
  >({
    stats: null,
    trades: [],
    loading: true,
    phase1Ready: false,
    snapshotReady: false,
    positionTrades: [],
    positionMatchesComplete: false,
    matchedPositionKeys: [],
    globalMatchesComplete: false,
    tradesComplete: false,
    error: null,
    positionError: null,
    matchesError: null,
    refreshing: false,
    unrealizedRefreshing: false,
    spotBalancesRefreshing: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> | null>(null);
  const pollErrorCountRef = useRef(0);
  const gatewayStaleToastRef = useRef<string | number | null>(null);
  const subaccountsRef = useRef<SubaccountEntry[]>([]);
  const activeSubaccountsRef = useRef<SubaccountEntry[]>([]);
  const pendingDiscoveryRef = useRef(false);
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
  const triggerImmediatePollRef = useRef<() => void>(() => {});
  const positionMatchesCompleteRef = useRef(false);
  const demotionCounterRef = useRef<Map<string, number>>(new Map());
  const [isQueued, setIsQueued] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastRetryFailed, setLastRetryFailed] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRetryingRef = useRef(false);
  const lastRetryFailedRef = useRef(false);
  // Subscribe to fill events via SSE for all cross subaccounts — toast notification only.
  // Falls back to [default] until stats.cross_subaccounts is populated after Phase 1.
  // Ref-stabilized: only changes when the actual subaccount strings change, preventing
  // SSE teardown/reconnect cycles during position refreshes.
  const stableStreamSubsRef = useRef<string[] | null>(null);
  const streamSubaccounts = useMemo<string[] | null>(() => {
    const next = data.stats?.cross_subaccounts?.length
      ? data.stats.cross_subaccounts.map(c => c.subaccount)
      : rawAddress ? [toSubaccount(rawAddress)] : null;
    const prev = stableStreamSubsRef.current;
    if (prev !== null && next !== null && prev.join(",") === next.join(",")) {
      return prev;
    }
    if (prev === null && next === null) return prev;
    stableStreamSubsRef.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable when subaccount list hasn't changed
  }, [data.stats?.cross_subaccounts, rawAddress]);
  const onWsFill = useCallback((event: FillEvent) => {
    pendingDiscoveryRef.current = true;
    // Promote idle sub to active polling on fill
    const fillSub = event.subaccount.toLowerCase();
    const isActive = activeSubaccountsRef.current.some(
      (s) => s.subaccount.toLowerCase() === fillSub,
    );
    if (!isActive) {
      const entry = subaccountsRef.current.find(
        (s) => s.subaccount.toLowerCase() === fillSub,
      );
      if (entry) {
        activeSubaccountsRef.current = [...activeSubaccountsRef.current, entry];
        demotionCounterRef.current.delete(fillSub);
      }
    }
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
    triggerImmediatePollRef.current();
  }, []);
  const onWsPositionChange = useCallback(() => {
    triggerImmediatePollRef.current();
  }, []);
  useAccountStream(streamSubaccounts, { onFill: onWsFill, onPositionChange: onWsPositionChange });

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
    positionMatchesCompleteRef.current = false;
    demotionCounterRef.current = new Map();

    // Seed from matches cache if available and fresh — instant trades on re-visit
    const cached = useWalletMatchesCacheStore.getState().getCache(rawAddress);
    const matchesCacheStale = useWalletMatchesCacheStore.getState().isStale(rawAddress);
    if (cached && !matchesCacheStale && cached.trades.length > 0) {
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
    const posCacheStale = usePositionMatchesCacheStore.getState().isStale(rawAddress);
    if (posCached && !posCacheStale && posCached.positionTrades.length > 0) {
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
          const page = await fetchPage(chunkSubs, pageIdx);
          if (page.queued) setIsQueued(true);
          if (cancelled || page.rateLimited || page.serverError) break;
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

    async function fetchPositionScopedMatches(openPositions: Position[]): Promise<void> {
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
        positionMatchesCompleteRef.current = true;
        setData(prev => ({ ...prev, positionMatchesComplete: true }));
        return;
      }

      const completedProducts = new Set<string>();
      const rateLimitedPairs = new Set<string>();
      const notifiedProducts = new Set<string>();
      const cursorByPair: Record<string, string | undefined> = {};

      const processTradesForPair = (pair: PairKey, pairKey: string, result: MatchesPageResult): void => {
        for (const trade of result.trades) {
          const tradeId = `${trade.submission_idx ?? ""}-${trade.subaccount ?? ""}-${trade.product_id}`;
          if (positionSeenTradeIdsRef.current.has(tradeId)) continue;
          positionSeenTradeIdsRef.current.add(tradeId);
          positionTradesRef.current.push(trade);

          if ((trade.isolated ?? false) !== pair.isIsolated) continue;
          if (trade.pre_balance_amount === undefined) continue;

          const preBalance = fromX18BigInt(trade.pre_balance_amount);
          if (Math.abs(preBalance) < 1e-10) {
            const timeSec = trade.timestamp
              ? Number(BigInt(trade.timestamp) / BigInt(1_000_000_000))
              : 0;
            positionOpenTimeMapRef.current[pairKey] = timeSec;
            completedProducts.add(pairKey);
            return;
          }
        }

        if (!completedProducts.has(pairKey)) {
          if (result.done) {
            completedProducts.add(pairKey);
          } else {
            cursorByPair[pairKey] = result.nextIdx ?? undefined;
          }
        }
      };

      const emitPartialStats = (pairKey: string): void => {
        if (completedProducts.has(pairKey) && !notifiedProducts.has(pairKey) && !cancelled) {
          notifiedProducts.add(pairKey);
          const partialStatsMap = buildPositionStatsMap(positionTradesRef.current, true);
          positionStatsMapRef.current = partialStatsMap;
          setData(prev => ({
            ...prev,
            matchedPositionKeys: [...notifiedProducts],
            stats: prev.stats
              ? { ...prev.stats, positions: applyPositionStats(prev.stats.positions, partialStatsMap) }
              : null,
          }));
        }
      };

      let iteration = 0;
      while (completedProducts.size + rateLimitedPairs.size < pairs.length && iteration < MAX_POSITION_SCOPED_PAGES) {
        if (cancelled) break;
        for (const pair of pairs) {
          if (cancelled) break;
          const pairKey = `${pair.pocketSubaccount}:${pair.productId}`;
          if (completedProducts.has(pairKey) || rateLimitedPairs.has(pairKey)) continue;

          const result = await fetchPage(
            [pair.querySubaccount],
            cursorByPair[pairKey],
            [pair.productId],
          );
          if (result.queued) setIsQueued(true);

          if (result.rateLimited || result.serverError) {
            rateLimitedPairs.add(pairKey);
          } else if (result.trades.length === 0) {
            completedProducts.add(pairKey);
          } else {
            processTradesForPair(pair, pairKey, result);
          }

          emitPartialStats(pairKey);
          await sleep(MATCHES_BURST_MS, signal);
        }
        iteration++;
      }

      // ── Retry rate-limited pairs until all succeed (time-boxed) ────────────────
      if (rateLimitedPairs.size > 0 && !cancelled) {
        const retryDeadline = Date.now() + RETRY_429_DEADLINE_MS;
        let retryRound = 0;
        while (rateLimitedPairs.size > 0 && !cancelled && Date.now() < retryDeadline) {
          const delay = Math.min(
            MATCHES_429_BASE_DELAY * Math.pow(1.5, retryRound) + Math.random() * MATCHES_429_JITTER,
            60_000,
          );
          const remainingSec = Math.max(1, Math.round((retryDeadline - Date.now()) / 1000));
          setData(prev => ({
            ...prev,
            positionError: `Loading position stats — retrying in ${Math.round(delay / 1000)}s (${remainingSec}s remaining)…`,
          }));
          await sleep(delay, signal);
          if (cancelled) break;

          for (const pairKey of [...rateLimitedPairs]) {
            if (cancelled || Date.now() >= retryDeadline) break;
            const pair = pairs.find(p => `${p.pocketSubaccount}:${p.productId}` === pairKey);
            if (!pair) { rateLimitedPairs.delete(pairKey); continue; }

            const result = await fetchPage(
              [pair.querySubaccount],
              cursorByPair[pairKey],
              [pair.productId],
            );
            if (result.queued) setIsQueued(true);

            if (result.rateLimited || result.serverError) continue;

            rateLimitedPairs.delete(pairKey);
            if (result.trades.length === 0) {
              completedProducts.add(pairKey);
            } else {
              processTradesForPair(pair, pairKey, result);
              let miniPage = 0;
              while (!completedProducts.has(pairKey) && miniPage < MAX_POSITION_SCOPED_PAGES - 1 && !cancelled) {
                if (!cursorByPair[pairKey]) break;
                await sleep(MATCHES_BURST_MS, signal);
                const nextResult = await fetchPage(
                  [pair.querySubaccount],
                  cursorByPair[pairKey],
                  [pair.productId],
                );
                if (nextResult.queued) setIsQueued(true);
                if (nextResult.rateLimited || nextResult.serverError) {
                  rateLimitedPairs.add(pairKey);
                  break;
                }
                if (nextResult.trades.length === 0) {
                  completedProducts.add(pairKey);
                } else {
                  processTradesForPair(pair, pairKey, nextResult);
                }
                miniPage++;
              }
            }

            emitPartialStats(pairKey);
            await sleep(MATCHES_BURST_MS, signal);
          }
          retryRound++;
        }
      }

      const matchStatsMap = buildPositionStatsMap(positionTradesRef.current, true);
      positionStatsMapRef.current = matchStatsMap;
      positionMatchesCompleteRef.current = true;
      setData(prev => ({
        ...prev,
        positionTrades: [...positionTradesRef.current],
        positionMatchesComplete: true,
        matchedPositionKeys: [],
        positionError: null,
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

      const positionSessionStatsMap = buildPositionStatsMap(positionTradesRef.current, true);
      positionStatsMapRef.current = positionSessionStatsMap;

      const accumulated = await fetchPositionScopedFunding({
        subaccountsWithPerps,
        openPerpProductIds,
        openTimeKeyByQueryKey,
        positionOpenTimeMap: positionOpenTimeMapRef.current,
      }, signal, (subaccount, batchPayments) => {
        if (cancelled) return;
        useWalletFundingStore.getState().pushSubaccountFunding(rawAddress, subaccount, batchPayments);
        const partialPayments = useWalletFundingStore.getState().forAddress(rawAddress)?.positionFundingPayments ?? [];
        setData(prev => ({
          ...prev,
          stats: prev.stats
            ? {
                ...prev.stats,
                positions: applySessionFunding(
                  applyPositionStats(prev.stats.positions, positionSessionStatsMap),
                  positionSessionStatsMap,
                  partialPayments,
                ),
              }
            : null,
        }));
      });

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
          positionError: null,
          matchesError: null,
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
      activeSubaccountsRef.current = deriveActiveSubaccounts(subs, positionData.positions);
      const activeSubAddrs = activeSubaccountsRef.current.map((s) => s.subaccount);
      const activeChunks = chunk(activeSubAddrs, 5);
      const activeAddrSet = new Set(activeSubAddrs.map((a) => a.toLowerCase()));
      const remainingAddrs = subAddrs.filter((a) => !activeAddrSet.has(a.toLowerCase()));
      const remainingChunks = chunk(remainingAddrs, 5);

      if (positionData.allFailed) {
        setData((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          positionError: null,
          matchesError: "Gateway unavailable — retrying…",
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
        matchedPositionKeys: [],
        globalMatchesComplete: hasCachedTradesForPhase1 && tradesCompleteRef.current,
        tradesComplete: hasCachedTradesForPhase1 && tradesCompleteRef.current,
        refreshing: false,
        unrealizedRefreshing: false,
        spotBalancesRefreshing: false,
        error: null,
        positionError: null,
        matchesError: null,
      });

      // ── Phase 2 + 3 (concurrent, background) ─────────────────────────────

      // Phase 2a: position-scoped matches (Fly.io IP A)
      const phase2a = (async () => {
        await fetchPositionScopedMatches(positionData.positions);
        if (!cancelled && positionTradesRef.current.length > 0) {
          usePositionMatchesCacheStore.getState().setCache(rawAddress, {
            positionTrades: [...positionTradesRef.current],
            positionOpenTimeMap: { ...positionOpenTimeMapRef.current },
          });
        }
      })();

      // Phase 2b: position-scoped funding (Fly.io IP B — separate rate budget, safe to parallelize)
      const phase2b = (async () => {
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
          // Incremental catch-up for trades newer than cache — active subs only
          if (latestKnownIdxRef.current && !cancelled) {
            const activeAddrs = activeSubaccountsRef.current.map((s) => s.subaccount);
            const activeCacheChunks = chunk(activeAddrs, 5);
            const newTrades = await fetchIncrementalTrades(activeCacheChunks, latestKnownIdxRef.current);
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

        await sleep(Math.random() * MATCHES_STAGGER_MAX_MS);
        if (cancelled) return;

        // Step 1: Fetch first pages for ACTIVE subaccounts only (low weight, fast)
        let activeFirstPages: MatchesPageResult[] = [];
        let matchesLoaded = false;
        for (let attempt = 0; attempt < MATCHES_429_MAX_ATTEMPTS && !cancelled; attempt++) {
          try {
            const pages: MatchesPageResult[] = [];
            for (let c = 0; c < activeChunks.length; c++) {
              const subChunk = activeChunks[c]!;
              const p = await fetchPage(subChunk);
              if (p.queued) setIsQueued(true);
              if (p.rateLimited || p.serverError) throw new Error("RATE_LIMIT");
              pages.push(p);
              if (c < activeChunks.length - 1) await sleep(MATCHES_BURST_MS);
            }
            activeFirstPages = pages;
            matchesLoaded = true;
            setIsQueued(false);
            if (isRetryingRef.current || lastRetryFailedRef.current) {
              if (!cancelled) {
                setShowRecovery(true);
                if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
                recoveryTimerRef.current = setTimeout(() => setShowRecovery(false), 3_000);
              }
            }
            isRetryingRef.current = false;
            lastRetryFailedRef.current = false;
            setIsRetrying(false);
            setLastRetryFailed(false);
            setData((prev) => ({ ...prev, matchesError: null }));
            break;
          } catch (e) {
            if (cancelled) return;
            if (e instanceof Error && e.message === "RATE_LIMIT") {
              if (attempt < MATCHES_429_MAX_ATTEMPTS - 1) {
                const delay = MATCHES_429_BASE_DELAY + Math.random() * MATCHES_429_JITTER;
                const delaySec = Math.round(delay / 1000);
                isRetryingRef.current = true;
                setIsRetrying(true);
                setRetryCountdown(Math.max(0, delaySec));
                setData((prev) => ({
                  ...prev,
                  matchesError: `Retrying in ~${delaySec}s (${attempt + 1}/${MATCHES_429_MAX_ATTEMPTS})…`,
                }));
                await sleep(delay);
                setRetryCountdown(0);
                continue;
              }
              isRetryingRef.current = false;
              lastRetryFailedRef.current = true;
              setIsRetrying(false);
              setLastRetryFailed(true);
              setData((prev) => ({
                ...prev,
                matchesError: "Archive unavailable — wait a minute and refresh, or open fewer tabs.",
              }));
              return;
            }
            throw e;
          }
        }
        if (!matchesLoaded || cancelled) return;

        let allTrades = sortTradesNewestFirst(activeFirstPages.flatMap((page) => page.trades));
        seenTradeIdsRef.current = new Set(allTrades.map(tradeIdentity));
        tradesRef.current = allTrades;
        latestKnownIdxRef.current = allTrades[0]?.submission_idx ?? null;
        tradesCompleteRef.current = false;
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
                trades_complete: false,
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
          globalMatchesComplete: remainingChunks.length === 0 && activeFirstPages.every((page) => page.done),
          tradesComplete: remainingChunks.length === 0 && activeFirstPages.every((page) => page.done),
        };});

        // Step 2: Background-load remaining subaccounts (throttled, 7s between chunks)
        // Every chunk MUST succeed — retry with escalating backoff until it does.
        const remainingFirstPages: MatchesPageResult[] = [];
        for (let c = 0; c < remainingChunks.length && !cancelled; c++) {
          if (c > 0) await sleep(REMAINING_MATCHES_DELAY_MS);
          let result: MatchesPageResult | null = null;
          const chunkDeadline = Date.now() + RETRY_429_DEADLINE_MS;
          for (let retry = 0; !cancelled && Date.now() < chunkDeadline; retry++) {
            const page = await fetchPage(remainingChunks[c]!);
            if (page.queued) setIsQueued(true);
            if (cancelled) break;
            if (!page.rateLimited && !page.serverError) {
              result = page;
              break;
            }
            const delay = Math.min(
              MATCHES_429_BASE_DELAY * Math.pow(1.5, retry) + Math.random() * MATCHES_429_JITTER,
              60_000,
            );
            const remainingSec = Math.max(1, Math.round((chunkDeadline - Date.now()) / 1000));
            setData((prev) => ({
              ...prev,
              matchesError: `Loading history — retrying chunk ${c + 1}/${remainingChunks.length} (${remainingSec}s remaining)…`,
            }));
            await sleep(delay, signal);
          }
          if (cancelled || !result) break;
          remainingFirstPages.push(result);
          const uniqueTrades = result.trades.filter((trade) => {
            const id = tradeIdentity(trade);
            if (seenTradeIdsRef.current.has(id)) return false;
            seenTradeIdsRef.current.add(id);
            return true;
          });
          if (uniqueTrades.length > 0) {
            allTrades = sortTradesNewestFirst([...allTrades, ...uniqueTrades]);
            tradesRef.current = allTrades;
            latestKnownIdxRef.current = allTrades[0]?.submission_idx ?? latestKnownIdxRef.current;
            setData((prev) => {
              const fs = useWalletFundingStore.getState().forAddress(rawAddress);
              const pnlStats = buildPnlStats(allTrades, fs?.fundingPaidUsd ?? 0);
              return {
                ...prev,
                trades: allTrades,
                stats: prev.stats ? { ...prev.stats, trades: allTrades, ...pnlStats } : null,
              };
            });
          }
        }

        const firstPages = [...activeFirstPages, ...remainingFirstPages];
        const firstPageChunks = [...activeChunks, ...remainingChunks.slice(0, remainingFirstPages.length)];
        if (!cancelled) {
          const allChunksFetched = remainingFirstPages.length === remainingChunks.length;
          const allDone = firstPages.every((p) => p.done) && allChunksFetched;
          tradesCompleteRef.current = allDone;
          setData((prev) => {
            const fs = useWalletFundingStore.getState().forAddress(rawAddress);
            const pnlStats = buildPnlStats(allTrades, fs?.fundingPaidUsd ?? 0);
            return {
              ...prev,
              matchesError: allChunksFetched ? null : prev.matchesError,
              trades: allTrades,
              globalMatchesComplete: allDone,
              tradesComplete: allDone,
              stats: prev.stats
                ? { ...prev.stats, trades: allTrades, trades_complete: allDone, ...pnlStats }
                : null,
            };
          });
        }

        // Catch-up: one no-cache fetch to bridge Redis cache lag — runs once per page load.
        // Only check active subs — new trades require open positions.
        if (latestKnownIdxRef.current && !cancelled) {
          const activeAddrs = activeSubaccountsRef.current.map((s) => s.subaccount);
          const activeCatchUpChunks = chunk(activeAddrs, 5);
          const catchUpTrades = await fetchIncrementalTrades(activeCatchUpChunks, latestKnownIdxRef.current);
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
            chunk: firstPageChunks[idx],
            done: page.done,
            nextIdx: page.nextIdx,
          }));
          let truncatedByPageLimit = false;
          let anyChunkExhausted = false;
          outerMatches: for (let page = 1; page < MAX_PAGES && !cancelled; page++) {
            const active = chunkStates.filter((state) => !state.done);
            if (active.length === 0) break;

            for (let a = 0; a < active.length; a++) {
              const state = active[a]!;
              let result: MatchesPageResult | null = null;
              const pageDeadline = Date.now() + RETRY_429_DEADLINE_MS;
              for (let retry = 0; !cancelled && Date.now() < pageDeadline; retry++) {
                const page = await fetchPage(
                  state.chunk,
                  state.nextIdx ?? undefined,
                );
                if (page.queued) setIsQueued(true);
                if (cancelled) break;
                if (!page.rateLimited && !page.serverError) {
                  result = page;
                  break;
                }
                const delay = Math.min(
                  MATCHES_429_BASE_DELAY * Math.pow(1.5, retry) + Math.random() * MATCHES_429_JITTER,
                  60_000,
                );
                await sleep(delay, signal);
              }
              if (cancelled) break outerMatches;
              if (!result) {
                anyChunkExhausted = true;
                state.done = true;
                continue;
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
            const allDone = chunkStates.every((state) => state.done) && !anyChunkExhausted;
            tradesCompleteRef.current = allDone || page === MAX_PAGES - 1;
            setData((prev) => {
              const fs = useWalletFundingStore.getState().forAddress(rawAddress);
              const updatedStats = buildPnlStats(allTrades, fs?.fundingPaidUsd ?? 0);
              return {
              ...prev,
              trades: allTrades,
              ...(anyChunkExhausted
                ? { matchesError: "Archive rate limit while loading history — partial data shown." }
                : {}),
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

      // Poll live position marks / unrealized only — subaccount_info only (Gateway).
      // avg_entry (account_snapshots) is cached and only re-fetched when a fill is detected:
      // if any position's amount_x18 changed since the last tick, a fill happened and the
      // avg_entry must be refreshed. Otherwise we skip the Archive call entirely.
      const pollPositionsOnly = async () => {
        try {
          if (cancelled) return;
          let pd = await fetchAllPos(
            activeSubaccountsRef.current,
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

          // Discovery: periodic (60s), on SSE fill, or when a pocket has no parent mapping.
          pollCountRef.current += 1;
          const hasUnmappedIsolated = pd.positions.some(
            (p) => p.isolated && !isolatedParentNameRef.current.has(p.subaccount.toLowerCase()),
          );
          const shouldDiscover =
            hasUnmappedIsolated ||
            pendingDiscoveryRef.current ||
            pollCountRef.current % DISCOVERY_INTERVAL_TICKS === 0;
          if (shouldDiscover) pendingDiscoveryRef.current = false;

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

          const newActive = deriveActiveSubaccounts(
            subaccountsRef.current,
            pd.positions,
          );
          const newActiveSet = new Set(newActive.map((s) => s.subaccount.toLowerCase()));

          // Demotion: track promoted subs that lost all positions for 2 consecutive polls.
          const prevActive = activeSubaccountsRef.current;
          for (const s of prevActive) {
            const key = s.subaccount.toLowerCase();
            if (!newActiveSet.has(key) && !s.isolated) {
              const count = (demotionCounterRef.current.get(key) ?? 0) + 1;
              if (count >= DEMOTION_THRESHOLD) {
                demotionCounterRef.current.delete(key);
              } else {
                demotionCounterRef.current.set(key, count);
                if (!newActive.some((n) => n.subaccount.toLowerCase() === key)) {
                  newActive.push(s);
                }
              }
            } else {
              demotionCounterRef.current.delete(key);
            }
          }
          activeSubaccountsRef.current = newActive;

          // Detect fills: compare amount_x18 with previous poll.
          // prevAmountsRef is empty on the first poll (skip re-fetch — snapshots were just loaded).
          const prev = prevAmountsRef.current;
          const newPositionKeys = new Set(
            pd.positions.map((pos) => `${pos.subaccount}:${pos.product_id}`),
          );
          const changedPositions = prev.size > 0
            ? pd.positions.filter((pos) => {
                const key = `${pos.subaccount}:${pos.product_id}`;
                const prevAmt = prev.get(key);
                return prevAmt === undefined || prevAmt !== pos.amount_x18;
              })
            : [];
          const closedPositionKeys = prev.size > 0
            ? [...prev.keys()].filter((key) => !newPositionKeys.has(key))
            : [];
          const fillDetected = changedPositions.length > 0 || closedPositionKeys.length > 0;
          prevAmountsRef.current = new Map(
            pd.positions.map((pos) => [`${pos.subaccount}:${pos.product_id}`, pos.amount_x18]),
          );

          let tradeHistoryUpdated = false;
          if (fillDetected) {
            // Refresh snapshot entry prices for avg entry accuracy
            const crossSubs = subaccountsRef.current.filter(s => !s.isolated).map(s => s.subaccount);
            entryPriceMapRef.current = await fetchSnapshots(crossSubs);
            if (cancelled) return;
            // Re-fetch position-scoped matches ONLY for changed positions (not all).
            // Closed positions: remove their trades from the cache.
            const changedKeys = new Set(changedPositions.map(
              (p) => `${p.subaccount}:${p.product_id}`,
            ));
            const closedKeySet = new Set(closedPositionKeys);
            positionTradesRef.current = positionTradesRef.current.filter((t) => {
              const key = `${t.subaccount ?? ""}:${t.product_id}`;
              return !changedKeys.has(key) && !closedKeySet.has(key);
            });
            for (const key of [...changedKeys, ...closedKeySet]) {
              delete positionOpenTimeMapRef.current[key];
            }
            await fetchPositionScopedMatches(changedPositions);
            if (cancelled) return;
            positionStatsMapRef.current = buildPositionStatsMap(positionTradesRef.current, true);
            usePositionMatchesCacheStore.getState().setCache(rawAddress, {
              positionTrades: [...positionTradesRef.current],
              positionOpenTimeMap: { ...positionOpenTimeMapRef.current },
            });

            // Also pull new fills into the global trade history (WalletTradeHistory).
            // Only active subs — fills require open positions.
            if (latestKnownIdxRef.current) {
              const activeAddrs = activeSubaccountsRef.current.map((s) => s.subaccount);
              const activeIncrChunks = chunk(activeAddrs, 5);
              const newTrades = await fetchIncrementalTrades(
                activeIncrChunks,
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
        const basePoll = positionMatchesCompleteRef.current
          ? POSITIONS_POLL_MS
          : POSITIONS_POLL_PHASE2_MS;
        const delay = errors >= POLL_BACKOFF_THRESHOLD
          ? Math.min(basePoll * (2 ** (errors - POLL_BACKOFF_THRESHOLD + 1)), POLL_MAX_BACKOFF_MS)
          : basePoll;
        intervalRef.current = setTimeout(() => {
          void pollPositionsOnly().finally(() => {
            if (!cancelled) schedulePoll();
          });
        }, delay);
      };
      let pollInFlight = false;
      triggerImmediatePollRef.current = () => {
        if (cancelled || pollInFlight) return;
        pollInFlight = true;
        if (intervalRef.current) {
          clearTimeout(intervalRef.current);
          intervalRef.current = null;
        }
        void pollPositionsOnly().finally(() => {
          pollInFlight = false;
          if (!cancelled) schedulePoll();
        });
      };
      schedulePoll();
      refreshUnrealizedImplRef.current = async () => {
        if (cancelled) return;
        setData((prev) => ({ ...prev, unrealizedRefreshing: true }));
        const minSpin = sleep(500);
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
            await minSpin;
            setData((prev) => ({ ...prev, unrealizedRefreshing: false }));
            return;
          }
          activeSubaccountsRef.current = deriveActiveSubaccounts(subaccountsRef.current, pd.positions);

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
          await minSpin;
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
          await minSpin;
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

      // Phase 2a (matches, IP A) + Phase 2b (funding, IP B) + snapshots (IP C) run in parallel.
      // Phase 3a (global history) starts AFTER to avoid concurrent rate limit burst on IP A.
      await Promise.all([phase2a, phase2b, snapshotsTask]).catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error("[useWalletData] phase 2 error:", e);
      });
      await phase3a.catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error("[useWalletData] phase 3a error:", e);
      });

      if (!cancelled && tradesRef.current.length > 0) {
        useWalletMatchesCacheStore.getState().setCache(rawAddress, {
          trades: tradesRef.current,
          latestKnownIdx: latestKnownIdxRef.current,
          seenTradeIds: new Set(seenTradeIdsRef.current),
          globalMatchesComplete: tradesCompleteRef.current,
        });
      }
      } finally {
        if (cancelled && mode === "refresh") {
          setData((prev) => ({ ...prev, refreshing: false }));
        }
      }
    };

    refreshImplRef.current = async () => {
      if (cancelled) return;
      setData((prev) => ({ ...prev, refreshing: true, positionError: null, matchesError: null }));
      try {
        const knownIdx = latestKnownIdxRef.current;
        const activeAddrs = activeSubaccountsRef.current.map((s) => s.subaccount);
        const refreshChunks = chunk(activeAddrs, 5);

        // Fetch only new trades since last known idx — active subs only (fills require positions).
        const newTrades = knownIdx
          ? await fetchIncrementalTrades(refreshChunks, knownIdx)
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
          matchesError: prev.matchesError ?? "Refresh failed",
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
          positionError: null,
          matchesError: "Failed to load wallet data",
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
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      isRetryingRef.current = false;
      lastRetryFailedRef.current = false;
      setIsQueued(false);
      setIsRetrying(false);
      setRetryCountdown(0);
      setLastRetryFailed(false);
      setShowRecovery(false);
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

  const error = [data.positionError, data.matchesError].filter(Boolean).join("\n") || null;

  const bannerState = useMemo<BannerEntry[]>(() => {
    const banners: BannerEntry[] = [];

    if (showRecovery) {
      banners.push({ type: "RECOVERY", message: "Back on track." });
    }

    if (lastRetryFailed && (data.positionError || data.matchesError)) {
      banners.push({
        type: "RETRY_EXHAUSTED",
        message: "Couldn't reach the gateway.",
        onRetry: () => refreshImplRef.current(),
      });
    } else if (isRetrying) {
      banners.push({
        type: "RETRY_IN_PROGRESS",
        message: `Gateway hiccup. Retrying in ${retryCountdown}s...`,
        countdown: retryCountdown,
      });
    }

    if (isQueued) {
      banners.push({ type: "QUEUE_WAIT", message: "High traffic — your data is next in line." });
    }

    const posCount = data.stats?.positions?.length ?? 0;
    const crossCount = data.stats?.cross_subaccounts?.length ?? 0;
    if ((posCount > 8 || crossCount > 5) && !data.positionMatchesComplete) {
      banners.push({ type: "WHALE_LOADING", message: "Whale-sized portfolio — crunching the numbers..." });
    }

    return banners.slice(0, 2);
  }, [showRecovery, lastRetryFailed, isRetrying, retryCountdown, isQueued, data.positionError, data.matchesError, data.stats?.positions?.length, data.stats?.cross_subaccounts?.length, data.positionMatchesComplete]);

  return {
    ...data,
    error,
    bannerState,
    refresh: () => refreshImplRef.current(),
    refreshUnrealizedPnl: () => refreshUnrealizedImplRef.current(),
    refreshSpotBalances: () => refreshSpotBalancesImplRef.current(),
  };
}
