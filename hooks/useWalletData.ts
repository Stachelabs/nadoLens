"use client";

import {
  type ArchiveMatch,
  ArchiveMatchesResponseSchema,
  ArchiveSubaccountsResponseSchema,
  IsolatedPositionsDataSchema,
  InterestAndFundingPaymentsResponseSchema,
} from "@/lib/schemas/nado";
import { parseSubaccountInfo } from "@/lib/parseSubaccountInfo";
import type { FundingPaymentEntry } from "@/lib/wallet/buildEquityCurve";
import {
  applySnapshotEntryPrices,
  buildEntryPriceMap,
  recomputeUnrealizedTotals,
  type EntryPriceMap,
} from "@/lib/wallet/snapshotEntryPrice";
import {
  applyPositionStats,
  applySessionFunding,
  buildPositionStatsMap,
  type PositionStatsMap,
} from "@/lib/wallet/positionStats";
import { AccountSnapshotsResponseSchema } from "@/lib/schemas/nado";
import {
  computeTradeMetrics,
  mergePnl,
} from "@/lib/wallet/performance";
import { usePairsStore, productName } from "@/store/pairsStore";
import {
  normalizeSubaccountDisplayName,
  subaccountDisplayLabelSortKey,
} from "@/lib/wallet/subaccountLabel";
import { isEmptyTrackedSpotBalances } from "@/lib/wallet/spotTracked";
import { nanoStringToUnixSec } from "@/lib/wallet/nanoTime";
import { type EquityPeriod, getPeriodBoundsUtc } from "@/lib/wallet/equityPeriod";
import type {
  CrossSubaccountEntry,
  Position,
  SpotBalance,
  SpotBalancesGroup,
  SubaccountHealthEntry,
  TradeMatch,
  WalletStats,
} from "@/types/nado";
import { fromX18BigInt } from "@/types/nado";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccountStream, type FillEvent } from "@/hooks/useAccountStream";

// Poll interval for live positions + marks.
// subaccount_info = weight 2, account_snapshots = weight ~2 → 4 weight/poll/subaccount.
// At 5s: 48 weight/min/user → safe for ~50 concurrent users within 2400/min IP limit.
// Lower to 1_000 for personal/single-user deployments (10% of budget).
const POSITIONS_POLL_MS = 6_000;
const MATCHES_LIMIT = 500;
const MAX_PAGES = 50;
/** Space out Archive `matches` calls to avoid saturating the service. */
const MATCHES_BURST_MS = 220;
const FUNDING_BURST_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MatchesPageResult = {
  trades: TradeMatch[];
  nextIdx: string | null;
  done: boolean;
  /** True when Archive kept returning 429 after retries — do not treat as end of history. */
  rateLimited?: boolean;
};

type FundingFetchResult = {
  totalFundingUsd: number;
  payments: FundingPaymentEntry[];
  complete: boolean;
  rateLimited?: boolean;
  /** Cursor for resuming pagination. null = subaccount exhausted. */
  nextMaxIdx?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSubaccount(address: string): string {
  const addr = address.toLowerCase().replace("0x", "");
  if (addr.length === 64) return `0x${addr}`; // already bytes32
  return `0x${addr}64656661756c740000000000`;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

const PARSE_FALLBACK = {
  positions: [] as Position[],
  spotBalances: [] as SpotBalance[],
  equityUsd: 0,
  availableMargin: 0,
  maintenanceMargin: 0,
  healthScore: 1,
  unrealizedTotal: 0,
}

function parsePositions(
  raw: unknown,
  isolated = false,
): {
  positions: Position[];
  spotBalances: SpotBalance[];
  equityUsd: number;
  availableMargin: number;
  maintenanceMargin: number;
  healthScore: number;
  unrealizedTotal: number;
} {
  const parsed = parseSubaccountInfo(raw, isolated)
  if (!parsed) return PARSE_FALLBACK
  return {
    positions: parsed.positions,
    spotBalances: parsed.spotBalances,
    equityUsd: parsed.equityUsd,
    availableMargin: parsed.availableMargin,
    maintenanceMargin: parsed.totalMaintMargin,
    healthScore: parsed.healthScore,
    unrealizedTotal: parsed.unrealizedTotal,
  }
}

// txMap: submission_idx → real Unix timestamp (seconds) from the txs[] field
function parseMatchesBatch(matches: ArchiveMatch[], txMap: Map<string, number>): TradeMatch[] {
  return matches.map((m): TradeMatch => {
    const isPerpTrade = !!(
      m.pre_balance?.base?.perp?.product_id !== undefined
        ? m.pre_balance.base.perp.product_id
        : m.post_balance?.base?.perp?.product_id
    );
    const productId =
      m.pre_balance?.base?.perp?.product_id ??
      m.post_balance?.base?.perp?.product_id ??
      0;
    const side: "long" | "short" =
      BigInt(m.base_filled ?? "0") >= BigInt(0) ? "long" : "short";
    // Real timestamp from txs[] — Unix seconds per Nado docs; fall back to 0 if missing
    const timeSec = txMap.get(m.submission_idx) ?? 0;

    // Encode as synthetic "large int" string — must use BigInt (timeSec * 1e9 exceeds Number precision)
    const timestampStr =
      timeSec > 0
        ? (BigInt(timeSec) * BigInt(1_000_000_000)).toString()
        : "0";

    // Fill price for avg-entry replay = |(quote_filled + fee) / base_filled| in x18.
    // This follows Nado Definitions/Formulas docs for matches fill price.
    // We do not add sequencer_fee separately because `fee` is the exchange fee field used in formula.
    const WAD_LOCAL = BigInt(10) ** BigInt(18);
    let priceX18Str: string;
    try {
      const baseB = BigInt(m.base_filled ?? "0");
      if (baseB !== BigInt(0) && m.quote_filled) {
        const quoteB = BigInt(m.quote_filled);
        const feeB = BigInt(m.fee ?? "0");
        const absBase = baseB < BigInt(0) ? -baseB : baseB;
        const signedNotional = quoteB + feeB;
        const absSignedNotional =
          signedNotional < BigInt(0) ? -signedNotional : signedNotional;
        priceX18Str = ((absSignedNotional * WAD_LOCAL) / absBase).toString();
      } else {
        priceX18Str = m.order?.priceX18 ?? "0";
      }
    } catch {
      priceX18Str = m.order?.priceX18 ?? "0";
    }

    return {
      digest: m.digest,
      subaccount: m.order?.sender,
      is_taker: m.is_taker,
      isolated: m.isolated,
      timestamp: timestampStr,
      submission_idx: m.submission_idx,
      product_id: productId,
      pair: productName(productId),
      amount: m.base_filled ?? "0",
      price: priceX18Str,
      quote_filled: m.quote_filled ?? "0",
      realized_pnl: m.realized_pnl ?? "0",
      closed_amount: m.closed_amount ?? "0",
      fee: m.fee ?? "0",
      sequencer_fee: m.sequencer_fee ?? "0",
      side,
      is_perp: isPerpTrade,
      pre_balance_amount: m.pre_balance?.base?.perp?.balance?.amount ?? undefined,
    };
  });
}

// ─── Trade/Funding helpers ─────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function sortTradesNewestFirst(trades: TradeMatch[]): TradeMatch[] {
  return [...trades].sort((a, b) => {
    try {
      const ai = BigInt(a.submission_idx);
      const bi = BigInt(b.submission_idx);
      if (ai > bi) return -1;
      if (ai < bi) return 1;
      return (a.digest ?? "").localeCompare(b.digest ?? "");
    } catch {
      return b.timestamp.localeCompare(a.timestamp);
    }
  });
}

function buildPnlStats(
  trades: TradeMatch[],
  funding_pnl_usd: number,
) {
  const tradeMetrics = computeTradeMetrics(trades);
  return mergePnl(tradeMetrics, funding_pnl_usd);
}

function tradeIdentity(trade: TradeMatch): string {
  return [
    trade.submission_idx,
    trade.digest ?? "",
    trade.product_id,
    trade.amount,
    trade.quote_filled ?? "0",
    trade.realized_pnl,
    trade.closed_amount,
    trade.fee,
  ].join(":");
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SubaccountEntry = {
  subaccount: string;
  isolated: boolean;
  subaccount_name?: string;
};

export type WalletData = {
  stats: WalletStats | null;
  trades: TradeMatch[];
  fundingPayments: FundingPaymentEntry[];
  loading: boolean;
  /** True once Gateway positions are loaded (before any Archive fetch). */
  phase1Ready: boolean;
  /** Trades scoped to currently open positions (Phase 2). */
  positionTrades: TradeMatch[];
  /** True once all position-scoped matches have been fetched (Phase 2). */
  positionMatchesComplete: boolean;
  /** Funding payments scoped to currently open positions (Phase 2). */
  positionFunding: FundingPaymentEntry[];
  /** True once all position-scoped funding has been fetched (Phase 2). */
  positionFundingComplete: boolean;
  /** True once full global match history background pagination is done (Phase 3a). */
  globalMatchesComplete: boolean;
  /** @deprecated Use globalMatchesComplete — kept for backward compat during migration. */
  tradesComplete: boolean;
  /** True while loadGlobalFunding is in progress. */
  globalFundingLoading: boolean;
  /** True once loadGlobalFunding has completed successfully. */
  globalFundingComplete: boolean;
  /** @deprecated Use globalFundingComplete — kept for backward compat during migration. */
  fundingComplete: boolean;
  error: string | null;
  /** True while re-fetching subaccounts + matches + funding (manual refresh). */
  refreshing: boolean;
  /** True while re-fetching Gateway subaccount_info for live marks / unrealized only. */
  unrealizedRefreshing: boolean;
  /** True while re-fetching cross spot balances only (Gateway, no Archive matches). */
  spotBalancesRefreshing: boolean;
  /** Reloads account snapshot, trade history, and funding — not polled automatically. */
  refresh: () => Promise<void>;
  /** Re-query Gateway for positions + unrealized only (same as 30s poll, immediate). */
  refreshUnrealizedPnl: () => Promise<void>;
  /** Cross subaccount spot via Gateway only — does not call /api/matches. */
  refreshSpotBalances: () => Promise<void>;
  /** CTA: fetch full funding history for all subaccounts. */
  loadGlobalFunding: () => Promise<void>;
  /** Fetch funding for specific product IDs only (incremental, deduped). */
  loadFundingForProducts: (productIds: number[]) => Promise<void>;
  /** Product IDs whose funding has been loaded (grows as products are fetched). */
  loadedFundingProductIds: number[];
  /** Oldest funding timestamp loaded (unix ms). Infinity = nothing, 0 = all time loaded. */
  fundingLoadedSince: number;
  /** True while a period-scoped funding load is in progress. */
  fundingPeriodLoading: boolean;
  /** Load funding history up to the given period, resuming from stored cursor. */
  loadFundingForPeriod: (period: EquityPeriod) => Promise<void>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWalletData(rawAddress: string): WalletData {
  const [data, setData] = useState<
    Omit<WalletData, "refresh" | "refreshUnrealizedPnl" | "refreshSpotBalances" | "loadGlobalFunding" | "loadFundingForProducts" | "loadFundingForPeriod">
  >({
    stats: null,
    trades: [],
    fundingPayments: [],
    loading: true,
    phase1Ready: false,
    positionTrades: [],
    positionMatchesComplete: false,
    positionFunding: [],
    positionFundingComplete: false,
    globalMatchesComplete: false,
    tradesComplete: false,
    globalFundingLoading: false,
    globalFundingComplete: false,
    fundingComplete: false,
    loadedFundingProductIds: [],
    fundingLoadedSince: Infinity,
    fundingPeriodLoading: false,
    error: null,
    refreshing: false,
    unrealizedRefreshing: false,
    spotBalancesRefreshing: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
  /** Funding total from full pagination — expensive; only updated on full load / refresh. */
  const fundingPaidUsdRef = useRef(0);
  const fundingPaymentsRef = useRef<FundingPaymentEntry[]>([]);
  /** Whether the full match history has been loaded — passed to buildPositionStatsMap. */
  const tradesCompleteRef = useRef(false);
  const refreshImplRef = useRef<() => Promise<void>>(async () => {});
  const refreshUnrealizedImplRef = useRef<() => Promise<void>>(async () => {});
  const refreshSpotBalancesImplRef = useRef<() => Promise<void>>(async () => {});
  const loadGlobalFundingImplRef = useRef<() => Promise<void>>(async () => {});
  const loadFundingForProductsImplRef = useRef<(productIds: number[]) => Promise<void>>(async () => {});
  const loadedFundingProductIdsRef = useRef<Set<number>>(new Set());
  const loadingFundingProductIdsRef = useRef<Set<number>>(new Set());
  /** Guards against concurrent calls to loadGlobalFundingImpl (e.g. double-click on CTA). */
  const globalFundingActiveRef = useRef(false);
  /** Guards against concurrent calls to loadFundingForPeriodImpl. */
  const fundingPeriodActiveRef = useRef(false);
  /** Per-subaccount pagination cursor. undefined = not started, null = exhausted. */
  const fundingSubaccountCursorsRef = useRef<Map<string, string | null>>(new Map());
  /** Oldest funding timestamp loaded (unix ms). Infinity = nothing, 0 = all time. */
  const fundingLoadedSinceRef = useRef<number>(Infinity);
  const loadFundingForPeriodImplRef = useRef<(period: EquityPeriod) => Promise<void>>(async () => {});
  /** Fill handler wired up inside the useEffect — called by useAccountStream. */
  const wsFillHandlerRef = useRef<((event: FillEvent) => void) | null>(null);
  /** Debounce timer for rapid multi-leg fills arriving via WS. */
  const wsFillDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to fill events via SSE (WS proxy co-located on nado-matches).
  // Fires wsFillHandlerRef.current which is set inside the useEffect below.
  // The existing 6s poll fillDetected branch remains as fallback.
  const defaultSubaccount = rawAddress ? toSubaccount(rawAddress) : null;
  const onWsFill = useCallback((event: FillEvent) => {
    if (wsFillDebounceRef.current) clearTimeout(wsFillDebounceRef.current);
    wsFillDebounceRef.current = setTimeout(() => {
      wsFillHandlerRef.current?.(event);
    }, 100);
  }, []);
  useAccountStream(defaultSubaccount, { onFill: onWsFill });

  /** Position-scoped trades — separate from tradesRef (global). */
  const positionTradesRef = useRef<TradeMatch[]>([]);
  /** Earliest open time per position key — boundary for position-scoped funding. */
  const positionOpenTimeMapRef = useRef<Record<string, number>>({});
  /** Dedup set for position-scoped trade IDs. */
  const positionSeenTradeIdsRef = useRef<Set<string>>(new Set());
  /** Position-scoped funding payments — persisted so the poller can use them as fallback. */
  const positionFundingPaymentsRef = useRef<FundingPaymentEntry[]>([]);

  useEffect(() => {
    if (!rawAddress) return;

    let cancelled = false;
    fundingPaidUsdRef.current = 0;
    fundingPaymentsRef.current = [];
    positionFundingPaymentsRef.current = [];
    prevAmountsRef.current = new Map();
    positionTradesRef.current = [];
    positionOpenTimeMapRef.current = {};
    positionSeenTradeIdsRef.current = new Set();

    // 1. Resolve all subaccounts (default + isolated) via Archive
    const fetchSubaccounts = async (): Promise<SubaccountEntry[]> => {
      const fallback: SubaccountEntry[] = [
        { subaccount: toSubaccount(rawAddress), isolated: false, subaccount_name: "default" },
      ];
      try {
        const res = await fetch(`/api/subaccounts/${rawAddress}`, {
          cache: "no-store",
        });
        if (!res.ok) return fallback;
        const raw: unknown = await res.json();
        const result = ArchiveSubaccountsResponseSchema.safeParse(raw);
        if (!result.success || result.data.subaccounts.length === 0)
          return fallback;
        return result.data.subaccounts.map((s) => ({
          subaccount: s.subaccount,
          isolated: s.isolated ?? false,
          subaccount_name: s.subaccount_name,
        }));
      } catch {
        return fallback;
      }
    };

    const fetchIsolatedParentMaps = async (
      subs: SubaccountEntry[],
    ): Promise<{
      parentNameByIsolatedSubaccount: Map<string, string>;
      parentSubaccountByIsolatedSubaccount: Map<string, string>;
    }> => {
      const parentNameByIsolatedSubaccount = new Map<string, string>();
      const parentSubaccountByIsolatedSubaccount = new Map<string, string>();
      const crossSubs = subs.filter((s) => !s.isolated);
      for (const c of crossSubs) {
        try {
          const res = await fetch(
            `/api/wallet/${c.subaccount}?query=isolated_positions`,
            { cache: "no-store" },
          );
          if (!res.ok) continue;
          const raw: unknown = await res.json();
          const parsed = IsolatedPositionsDataSchema.safeParse(raw);
          if (!parsed.success) continue;
          for (const iso of parsed.data.isolated_positions) {
            parentNameByIsolatedSubaccount.set(
              iso.subaccount.toLowerCase(),
              c.subaccount_name ?? "default",
            );
            parentSubaccountByIsolatedSubaccount.set(
              iso.subaccount.toLowerCase(),
              c.subaccount,
            );
          }
        } catch {
          // best effort only
        }
      }
      return {
        parentNameByIsolatedSubaccount,
        parentSubaccountByIsolatedSubaccount,
      };
    };

    /**
     * Fetch account_snapshots for the cross parent subaccounts.
     * Both cross (isolated:false) and isolated (isolated:true) snapshots are fetched
     * in a single call (no filter) so one request covers all positions.
     * Returns an EntryPriceMap keyed by `${subaccount}:${product_id}:${isolated}`.
     */
    const fetchSnapshotEntryPrices = async (
      crossSubaccounts: string[],
    ): Promise<EntryPriceMap> => {
      if (crossSubaccounts.length === 0) return new Map();
      try {
        const res = await fetch("/api/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subaccounts: crossSubaccounts }),
          cache: "no-store",
        });
        if (!res.ok) return new Map();
        const raw: unknown = await res.json();
        const parsed = AccountSnapshotsResponseSchema.safeParse(raw);
        if (!parsed.success) return new Map();
        return buildEntryPriceMap(parsed.data.snapshots);
      } catch {
        return new Map();
      }
    };

    // 2. Fetch positions for a single subaccount
    const fetchPositions = async (
      sub: string,
      isolated: boolean,
    ): Promise<{
      positions: Position[];
      spotBalances: SpotBalance[];
      equityUsd: number;
      availableMargin: number;
      maintenanceMargin: number;
      healthScore: number;
      unrealizedTotal: number;
    }> => {
      try {
        const res = await fetch(`/api/wallet/${sub}?query=subaccount_info`, {
          cache: "no-store",
        });
        if (!res.ok) return PARSE_FALLBACK;
        const raw: unknown = await res.json();
        return parsePositions(raw, isolated);
      } catch {
        return PARSE_FALLBACK;
      }
    };

    // 3. Fetch positions for all subaccounts and merge
    const fetchAllPositions = async (
      subs: SubaccountEntry[],
      isolatedParentNameBySubaccount: Map<string, string>,
      isolatedParentSubaccountBySubaccount: Map<string, string>,
    ): Promise<{
      positions: Position[];
      spotBalances: SpotBalance[];
      spotBalancesBySubaccount: SpotBalancesGroup[];
      crossSubaccounts: CrossSubaccountEntry[];
      equityUsd: number;
      availableMargin: number;
      maintenanceMargin: number;
      healthScore: number;
      unrealizedTotal: number;
      subaccountHealths: SubaccountHealthEntry[];
    }> => {
      const results = await Promise.all(
        subs.map(({ subaccount, isolated }) =>
          fetchPositions(subaccount, isolated),
        ),
      );
      const subNameBySubaccount = new Map(
        subs.map((s) => [s.subaccount.toLowerCase(), s.subaccount_name ?? "default"]),
      );
      const allPositions = results
        .flatMap((r) => r.positions)
        .map((p) => ({
          ...p,
          subaccount_name:
            subNameBySubaccount.get(p.subaccount.toLowerCase()) ??
            p.subaccount_name ??
            "default",
          parent_subaccount_name: p.isolated
            ? isolatedParentNameBySubaccount.get(p.subaccount.toLowerCase())
            : undefined,
          parent_subaccount: p.isolated
            ? isolatedParentSubaccountBySubaccount.get(p.subaccount.toLowerCase())
            : undefined,
        }));
      // Spot: cross (parent) subaccounts only; merge sums only subs with non-zero on tracked product IDs
      const spotMap = new Map<number, SpotBalance>();
      for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        if (!sub || sub.isolated) continue;
        const balances = results[i]?.spotBalances ?? [];
        if (isEmptyTrackedSpotBalances(balances)) continue;
        for (const b of balances) {
          const existing = spotMap.get(b.product_id);
          if (existing) {
            spotMap.set(b.product_id, {
              ...existing,
              amount: existing.amount + b.amount,
              value_usd: existing.value_usd + b.value_usd,
            });
          } else {
            spotMap.set(b.product_id, { ...b });
          }
        }
      }
      const spotBalances = Array.from(spotMap.values());
      const spotBalancesBySubaccount: SpotBalancesGroup[] = subs
        .map((s, i) => ({
          s,
          balances: results[i]?.spotBalances ?? [],
        }))
        .filter(
          ({ s, balances }) =>
            !s.isolated && !isEmptyTrackedSpotBalances(balances),
        )
        .map(({ s, balances }) => ({
          label: normalizeSubaccountDisplayName(s.subaccount_name),
          subaccount: s.subaccount,
          balances,
        }))
        .sort(
          (a, b) =>
            subaccountDisplayLabelSortKey(a.label) -
            subaccountDisplayLabelSortKey(b.label),
        );
      const crossSubaccounts: CrossSubaccountEntry[] = subs
        .filter((s) => !s.isolated)
        .map((s) => ({
          subaccount: s.subaccount,
          label: normalizeSubaccountDisplayName(s.subaccount_name),
        }))
        .sort(
          (a, b) =>
            subaccountDisplayLabelSortKey(a.label) -
            subaccountDisplayLabelSortKey(b.label),
        );
      const equityUsd = results.reduce((s, r) => s + r.equityUsd, 0);
      const availableMargin = results.reduce((s, r) => s + r.availableMargin, 0);
      const maintenanceMargin = results.reduce((s, r) => s + r.maintenanceMargin, 0);
      // Health from the primary (non-isolated) subaccount
      const primaryIdx = subs.findIndex((s) => !s.isolated);
      const healthScore =
        results[primaryIdx >= 0 ? primaryIdx : 0]?.healthScore ?? 1;
      const unrealizedTotal = results.reduce((s, r) => s + r.unrealizedTotal, 0);

      const subaccountHealths: SubaccountHealthEntry[] = subs
        .flatMap((sub, i): SubaccountHealthEntry[] => {
          const r = results[i]
          if (!r) return []
          if (r.equityUsd === 0 && r.positions.length === 0) return []
          const entry: SubaccountHealthEntry = {
            subaccount: sub.subaccount,
            subaccount_name: normalizeSubaccountDisplayName(sub.subaccount_name),
            health_score: r.healthScore,
            isolated: sub.isolated,
          }
          if (sub.isolated && r.positions[0]?.pair) {
            entry.pair = r.positions[0].pair
          }
          return [entry]
        })

      return {
        positions: allPositions,
        spotBalances,
        spotBalancesBySubaccount,
        crossSubaccounts,
        equityUsd,
        availableMargin,
        maintenanceMargin,
        healthScore,
        unrealizedTotal,
        subaccountHealths,
      };
    };

    // 4. Fetch a single page of matches (retry 429 — Archive IP limits)
    const fetchOnePage = async (
      subs: string[],
      lastIdx?: string,
      productIds?: number[],
    ): Promise<MatchesPageResult> => {
      const body: Record<string, unknown> = {
        subaccounts: subs,
        isolated: null,
        limit: MATCHES_LIMIT,
        ...(lastIdx ? { idx: lastIdx } : {}),
        ...(productIds && productIds.length > 0
          ? { product_ids: productIds }
          : {}),
      };

      try {
        const res = await fetch("/api/matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        if (res.status === 429) {
          return { trades: [], nextIdx: lastIdx ?? null, done: false, rateLimited: true };
        }

        if (!res.ok) {
          return { trades: [], nextIdx: null, done: true };
        }

        const raw: unknown = await res.json();
        const result = ArchiveMatchesResponseSchema.safeParse(raw);
        if (!result.success || result.data.matches.length === 0) {
          return { trades: [], nextIdx: null, done: true };
        }

        const pageMatches = result.data.matches;
        const txMap = new Map<string, number>();
        for (const tx of result.data.txs) {
          txMap.set(tx.submission_idx, parseInt(tx.timestamp, 10));
        }
        const trades = parseMatchesBatch(pageMatches, txMap);
        const done = pageMatches.length < MATCHES_LIMIT;
        const nextIdx = done
          ? null
          : pageMatches[pageMatches.length - 1].submission_idx;
        return { trades, nextIdx, done };
      } catch {
        return { trades: [], nextIdx: null, done: true };
      }
    };

    const fetchFundingPaidBySubaccount = async (
      subaccount: string,
      productIds: number[],
      options?: { stopBeforeMs?: number; resumeFromIdx?: string | null },
    ): Promise<FundingFetchResult> => {
      if (productIds.length === 0) {
        return { totalFundingUsd: 0, payments: [], complete: true, nextMaxIdx: null };
      }
      // Already exhausted for this subaccount
      if (options?.resumeFromIdx === null) {
        return { totalFundingUsd: 0, payments: [], complete: true, nextMaxIdx: null };
      }
      const LIMIT = 100;
      const FUNDING_MAX_PAGES = 100;
      let page = 0;
      let maxIdx: string | undefined = options?.resumeFromIdx ?? undefined;
      let totalFundingUsd = 0;
      const seen = new Set<string>();
      const payments: FundingPaymentEntry[] = [];
      let complete = true;
      let nextMaxIdx: string | null = null;

      while (page < FUNDING_MAX_PAGES) {
        page += 1;
        const body: Record<string, unknown> = {
          subaccount,
          product_ids: productIds,
          limit: LIMIT,
          ...(maxIdx ? { max_idx: maxIdx } : {}),
        };

        const res = await fetch("/api/funding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        if (res.status === 429) {
          return { totalFundingUsd, payments, complete: false, rateLimited: true, nextMaxIdx: maxIdx ?? null };
        }
        if (!res.ok) {
          complete = false;
          break;
        }

        const raw: unknown = await res.json();
        const result = InterestAndFundingPaymentsResponseSchema.safeParse(raw);
        if (!result.success) {
          complete = false;
          break;
        }

        for (const payment of result.data.funding_payments) {
          const key = `funding:${subaccount}:${payment.idx}:${payment.product_id}:${payment.amount}:${payment.timestamp}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const amount = fromX18BigInt(payment.amount);
          totalFundingUsd += amount;
          payments.push({
            subaccount,
            product_id: payment.product_id,
            idx: payment.idx,
            timestamp: payment.timestamp,
            amount: payment.amount,
            source: "funding",
          });
        }

        const pageNextIdx = result.data.next_idx;
        if (pageNextIdx === null || pageNextIdx === undefined) {
          nextMaxIdx = null; // exhausted
          break;
        }
        maxIdx = String(pageNextIdx);

        // Early stop: last item on this page is older than the requested cutoff
        if (options?.stopBeforeMs !== undefined) {
          const lastTs = result.data.funding_payments.at(-1)?.timestamp;
          if (lastTs) {
            const lastSec = nanoStringToUnixSec(lastTs);
            if (lastSec !== null && lastSec * 1000 <= options.stopBeforeMs) {
              nextMaxIdx = maxIdx; // save cursor for future expansion
              break;
            }
          }
        }

        await sleep(FUNDING_BURST_MS);
      }

      if (page >= FUNDING_MAX_PAGES) {
        complete = false;
        nextMaxIdx = maxIdx ?? null;
      }
      return { totalFundingUsd, payments, complete, nextMaxIdx };
    };

    /** One paginated stream per subaccount — serialized to avoid bursting Archive. */
    const fetchFundingPaidAllSubaccounts = async (
      subs: string[],
      productIds: number[],
    ): Promise<FundingFetchResult> => {
      if (subs.length === 0 || productIds.length === 0) {
        return {
          totalFundingUsd: 0,
          payments: [],
          complete: true,
        };
      }
      let totalFundingUsd = 0;
      const payments: FundingPaymentEntry[] = [];
      let complete = true;
      for (let i = 0; i < subs.length; i++) {
        const subaccount = subs[i]!;
        const result = await fetchFundingPaidBySubaccount(subaccount, productIds);
        totalFundingUsd += result.totalFundingUsd;
        payments.push(...result.payments);
        if (!result.complete) complete = false;
        if (result.rateLimited) {
          return {
            totalFundingUsd,
            payments,
            complete: false,
            rateLimited: true,
          };
        }
        if (i < subs.length - 1) await sleep(FUNDING_BURST_MS);
      }
      return { totalFundingUsd, payments, complete };
    };

    const getAllPerpProductIds = (): number[] => {
      const { perp } = usePairsStore.getState();
      return Array.from(new Set(perp.map((asset) => asset.product_id)));
    };

    const fetchFundingPaid = async (
      subaccounts: string[],
      fallbackProductIds: number[],
    ): Promise<FundingFetchResult> => {
      const allPerpIds = getAllPerpProductIds();
      const productIds = allPerpIds.length > 0
        ? allPerpIds
        : Array.from(new Set(fallbackProductIds));
      if (productIds.length === 0) {
        return {
          totalFundingUsd: 0,
          payments: [],
          complete: true,
        };
      }

      try {
        return await fetchFundingPaidAllSubaccounts(subaccounts, productIds);
      } catch {
        return {
          totalFundingUsd: 0,
          payments: [],
          complete: false,
        };
      }
    };

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
          const page = await fetchOnePage(chunkSubs, pageIdx);
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
    async function fetchPositionScopedMatches(openPositions: Position[]): Promise<void> {
      type PairKey = { subaccount: string; productId: number };
      const pairs: PairKey[] = openPositions
        .filter(p => fromX18BigInt(p.amount_x18) !== 0)
        .map(p => ({ subaccount: p.subaccount, productId: p.product_id }));

      if (pairs.length === 0) {
        setData(prev => ({ ...prev, positionMatchesComplete: true }));
        return;
      }

      const completedProducts = new Set<string>();
      const cursorByPair: Record<string, string | undefined> = {};

      let iteration = 0;
      while (completedProducts.size < pairs.length && iteration < MAX_PAGES) {
        for (const pair of pairs) {
          const pairKey = `${pair.subaccount}:${pair.productId}`;
          if (completedProducts.has(pairKey)) continue;


          const result = await fetchOnePage(
            [pair.subaccount],
            cursorByPair[pairKey],
            [pair.productId],
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

            const preBalance = fromX18BigInt(trade.pre_balance_amount ?? "0");
            if (Math.abs(preBalance) < 1e-10) {
              // Found the boundary: position was flat before this trade
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

      setData(prev => ({
        ...prev,
        positionTrades: [...positionTradesRef.current],
        positionMatchesComplete: true,
      }));
    }

    // ── Phase 2b: Position-scoped funding ─────────────────────────────────────
    async function fetchPositionScopedFunding(openPositions: Position[]): Promise<void> {
      const openPerpProductIds = Array.from(new Set(
        openPositions
          .filter(p => fromX18BigInt(p.amount_x18) !== 0)
          .map(p => p.product_id),
      ));

      if (openPerpProductIds.length === 0) {
        setData(prev => ({ ...prev, positionFundingComplete: true }));
        return;
      }

      const subaccountsWithPerps = Array.from(new Set(
        openPositions
          .filter(p => fromX18BigInt(p.amount_x18) !== 0)
          .map(p => p.subaccount),
      ));

      const accumulated: FundingPaymentEntry[] = [];

      for (const subaccount of subaccountsWithPerps) {
        const completedProducts = new Set<number>();
        let nextIdx: string | undefined = undefined;

        for (let page = 0; page < 100; page++) {
          if (completedProducts.size >= openPerpProductIds.length) break;


          const activeProductIds = openPerpProductIds.filter(id => !completedProducts.has(id));
          if (activeProductIds.length === 0) break;

          const res = await fetch("/api/funding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subaccount,
              product_ids: activeProductIds,
              limit: 100,
              ...(nextIdx !== undefined ? { max_idx: nextIdx } : {}),
            }),
            cache: "no-store",
          });

          if (!res || !res.ok) break;

          const raw: unknown = await res.json();
          const result = InterestAndFundingPaymentsResponseSchema.safeParse(raw);
          if (!result.success) break;

          for (const payment of result.data.funding_payments) {
            const pairKey = `${subaccount}:${payment.product_id}`;
            const openTime = positionOpenTimeMapRef.current[pairKey] ?? 0;

            const paymentTimeSec = nanoStringToUnixSec(payment.timestamp) ?? 0;
            if (paymentTimeSec <= openTime) {
              completedProducts.add(payment.product_id);
              continue;
            }

            accumulated.push({
              subaccount,
              product_id: payment.product_id,
              idx: payment.idx,
              timestamp: payment.timestamp,
              amount: payment.amount,
              source: "funding",
            });
          }

          const responseNextIdx = result.data.next_idx;
          if (responseNextIdx === null || responseNextIdx === undefined) break;
          nextIdx = String(responseNextIdx);

          if (completedProducts.size >= openPerpProductIds.length) break;

          await sleep(FUNDING_BURST_MS);
        }
      }

      // Phase 3a may not have arrived yet, so positionStatsMapRef may be empty.
      // Build a stats map from position-scoped trades (Phase 2a, fully loaded, tradesComplete=true).
      const positionSessionStatsMap = buildPositionStatsMap(positionTradesRef.current, true);
      // Persist so the poller can use these as fallback (fundingPaymentsRef stays [] until CTA).
      positionFundingPaymentsRef.current = accumulated;
      setData(prev => ({
        ...prev,
        positionFunding: accumulated,
        positionFundingComplete: true,
        stats: prev.stats
          ? {
              ...prev.stats,
              positions: applySessionFunding(
                prev.stats.positions,
                positionSessionStatsMap,
                accumulated,
              ),
            }
          : null,
      }));
    }

    // ── CTA: global funding (all subaccounts, all history) ────────────────────
    async function loadGlobalFundingImpl(
      subAddrs: string[],
      fallbackProductIds: number[],
    ): Promise<void> {
      if (globalFundingActiveRef.current) return;
      globalFundingActiveRef.current = true;
      setData(prev => ({ ...prev, globalFundingLoading: true }));
      try {
        const fundingData = await fetchFundingPaid(subAddrs, fallbackProductIds);
        fundingPaidUsdRef.current = fundingData.totalFundingUsd;
        fundingPaymentsRef.current = fundingData.payments;
        const updatedPnlStats = buildPnlStats(tradesRef.current, fundingData.totalFundingUsd);
        const fundingComplete = !fundingData.rateLimited && fundingData.complete;
        if (fundingData.rateLimited) {
          globalFundingActiveRef.current = false;
        }
        if (!cancelled) {
          setData(prev => ({
            ...prev,
            fundingPayments: fundingData.payments,
            globalFundingComplete: fundingComplete,
            fundingComplete: true,
            globalFundingLoading: false,
            error: fundingData.rateLimited
              ? "Archive rate limit while loading funding — retry by switching tabs."
              : !fundingData.complete
                ? "Funding history may be partial (page cap or API error)."
                : prev.error,
            stats: prev.stats
              ? {
                  ...prev.stats,
                  ...updatedPnlStats,
                  positions: applySessionFunding(
                    applyPositionStats(
                      applySnapshotEntryPrices(prev.stats.positions, entryPriceMapRef.current),
                      positionStatsMapRef.current,
                    ),
                    positionStatsMapRef.current,
                    fundingPaymentsRef.current,
                  ),
                }
              : null,
          }));
        }
      } catch (e) {
        console.error("loadGlobalFunding failed:", e);
        globalFundingActiveRef.current = false;
        if (!cancelled) {
          setData(prev => ({ ...prev, globalFundingLoading: false }));
        }
      }
    }

    async function loadFundingForPeriodImpl(
      subAddrs: string[],
      fallbackProductIds: number[],
      period: EquityPeriod,
    ): Promise<void> {
      if (globalFundingActiveRef.current || fundingPeriodActiveRef.current) return;

      const bounds = getPeriodBoundsUtc(period);
      const stopBeforeMs = bounds ? bounds.startSec * 1000 : undefined;

      // Check if already loaded
      const already =
        period === 'All time'
          ? fundingLoadedSinceRef.current === 0
          : fundingLoadedSinceRef.current !== Infinity &&
            fundingLoadedSinceRef.current <= (stopBeforeMs ?? 0);
      if (already) return;

      fundingPeriodActiveRef.current = true;
      setData(prev => ({ ...prev, fundingPeriodLoading: true }));

      const allPerpIds = getAllPerpProductIds();
      const productIds = allPerpIds.length > 0
        ? allPerpIds
        : Array.from(new Set(fallbackProductIds));

      if (productIds.length === 0) {
        fundingPeriodActiveRef.current = false;
        setData(prev => ({ ...prev, fundingPeriodLoading: false }));
        return;
      }

      const existingKeys = new Set(
        fundingPaymentsRef.current.map(p => `${p.subaccount}:${p.idx}`),
      );
      const newPayments: FundingPaymentEntry[] = [];
      let rateLimited = false;

      for (let i = 0; i < subAddrs.length; i++) {
        if (cancelled) break;
        const subaccount = subAddrs[i]!;
        const cursor = fundingSubaccountCursorsRef.current.get(subaccount);

        const result = await fetchFundingPaidBySubaccount(subaccount, productIds, {
          stopBeforeMs,
          resumeFromIdx: cursor,
        });

        // Update per-subaccount cursor
        if (result.nextMaxIdx !== undefined) {
          fundingSubaccountCursorsRef.current.set(subaccount, result.nextMaxIdx);
        }

        for (const p of result.payments) {
          const key = `${p.subaccount}:${p.idx}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            newPayments.push(p);
          }
        }

        if (result.rateLimited) {
          rateLimited = true;
          break;
        }

        if (i < subAddrs.length - 1) await sleep(FUNDING_BURST_MS);
      }

      if (cancelled) {
        fundingPeriodActiveRef.current = false;
        return;
      }

      fundingPaymentsRef.current = [...fundingPaymentsRef.current, ...newPayments];

      if (!rateLimited) {
        const allExhausted = subAddrs.every(
          s => fundingSubaccountCursorsRef.current.get(s) === null,
        );
        fundingLoadedSinceRef.current = allExhausted ? 0 : (stopBeforeMs ?? 0);
      }

      fundingPeriodActiveRef.current = false;
      const loadedSince = fundingLoadedSinceRef.current;

      setData(prev => ({
        ...prev,
        fundingPayments: fundingPaymentsRef.current,
        fundingPeriodLoading: false,
        fundingLoadedSince: loadedSince,
        globalFundingComplete: loadedSince === 0,
        fundingComplete: loadedSince !== Infinity,
        error: rateLimited
          ? "Archive rate limit while loading funding — retry by switching tabs."
          : prev.error,
      }));
    }

    async function loadFundingForProductsImpl(
      subAddrs: string[],
      productIds: number[],
    ): Promise<void> {
      const toLoad = productIds.filter(
        id => !loadedFundingProductIdsRef.current.has(id)
           && !loadingFundingProductIdsRef.current.has(id),
      )
      if (toLoad.length === 0) return

      toLoad.forEach(id => loadingFundingProductIdsRef.current.add(id))
      setData(prev => ({ ...prev, globalFundingLoading: true }))

      try {
        const result = await fetchFundingPaidAllSubaccounts(subAddrs, toLoad)

        if (cancelled) return

        toLoad.forEach(id => {
          loadingFundingProductIdsRef.current.delete(id)
          loadedFundingProductIdsRef.current.add(id)
        })

        const existingIdxs = new Set(fundingPaymentsRef.current.map(p => p.idx))
        const newPayments = result.payments.filter(p => !existingIdxs.has(p.idx))
        fundingPaymentsRef.current = [...fundingPaymentsRef.current, ...newPayments]
        fundingPaidUsdRef.current += result.totalFundingUsd

        const loadedIds = [...loadedFundingProductIdsRef.current]
        const updatedPnlStats = buildPnlStats(tradesRef.current, fundingPaidUsdRef.current)

        setData(prev => ({
          ...prev,
          fundingPayments: fundingPaymentsRef.current,
          loadedFundingProductIds: loadedIds,
          globalFundingLoading: loadingFundingProductIdsRef.current.size > 0,
          stats: prev.stats
            ? {
                ...prev.stats,
                ...updatedPnlStats,
                positions: applySessionFunding(
                  applyPositionStats(
                    applySnapshotEntryPrices(prev.stats.positions, entryPriceMapRef.current),
                    positionStatsMapRef.current,
                  ),
                  positionStatsMapRef.current,
                  fundingPaymentsRef.current,
                ),
              }
            : null,
        }))
      } catch (e) {
        console.error('loadFundingForProducts failed:', e)
        toLoad.forEach(id => loadingFundingProductIdsRef.current.delete(id))
        if (!cancelled) {
          setData(prev => ({
            ...prev,
            globalFundingLoading: loadingFundingProductIdsRef.current.size > 0,
          }))
        }
      }
    }

    const loadWallet = async (mode: "initial" | "refresh") => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
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
      const subs = await fetchSubaccounts();
      if (cancelled) return;
      subaccountsRef.current = subs;
      {
        const parentMaps = await fetchIsolatedParentMaps(subs);
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
        const parentMaps = await fetchIsolatedParentMaps(subs);
        isolatedParentNameRef.current =
          parentMaps.parentNameByIsolatedSubaccount;
        isolatedParentSubaccountRef.current =
          parentMaps.parentSubaccountByIsolatedSubaccount;
      }
      if (cancelled) return;
      const subAddrs = subs.map((s) => s.subaccount);

      const subaccountChunks = chunk(subAddrs, 5);

      const positionData = await fetchAllPositions(
        subs,
        isolatedParentNameRef.current,
        isolatedParentSubaccountRef.current,
      );
      if (cancelled) return;

      // ── Phase 1: positions loaded — render immediately ────────────────────
      const initialPnlStats = buildPnlStats([], 0);
      const initPositions = applySessionFunding(
        applyPositionStats(
          applySnapshotEntryPrices(positionData.positions, entryPriceMapRef.current),
          positionStatsMapRef.current,
        ),
        positionStatsMapRef.current,
        fundingPaymentsRef.current,
      );
      const initTotals = recomputeUnrealizedTotals(initPositions, positionData.equityUsd, positionData.unrealizedTotal);
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
          trades: [],
          trades_complete: false,
          ...initialPnlStats,
        },
        trades: [],
        fundingPayments: [],
        loading: false,
        phase1Ready: true,
        positionTrades: [],
        positionMatchesComplete: false,
        positionFunding: [],
        positionFundingComplete: false,
        globalMatchesComplete: false,
        tradesComplete: false,
        globalFundingLoading: false,
        globalFundingComplete: false,
        fundingComplete: false,
        loadedFundingProductIds: [],
        fundingLoadedSince: Infinity,
        fundingPeriodLoading: false,
        refreshing: false,
        unrealizedRefreshing: false,
        spotBalancesRefreshing: false,
        error: null,
      });

      // Wire up loadGlobalFunding CTA — closures capture subAddrs + product IDs
      loadGlobalFundingImplRef.current = () =>
        loadGlobalFundingImpl(
          subAddrs,
          positionData.positions.map(p => p.product_id),
        );
      loadFundingForProductsImplRef.current = (ids: number[]) =>
        loadFundingForProductsImpl(subAddrs, ids);
      loadFundingForPeriodImplRef.current = (period: EquityPeriod) =>
        loadFundingForPeriodImpl(subAddrs, positionData.positions.map(p => p.product_id), period);

      // ── Phase 2 + 3 (concurrent, background) ─────────────────────────────

      // Phase 2: position-scoped matches → position-scoped funding (sequential)
      const phase2 = (async () => {
        await fetchPositionScopedMatches(positionData.positions);
        if (cancelled) return;
        await fetchPositionScopedFunding(positionData.positions);
      })();

      // Snapshot entry prices (background, updates avg entry)
      const snapshotsTask = (async () => {
        const crossSubaccounts = subs.filter((s) => !s.isolated).map((s) => s.subaccount);
        entryPriceMapRef.current = await fetchSnapshotEntryPrices(crossSubaccounts);
      })();

      // Phase 3a: global background pagination loop (first page + remaining pages)
      const phase3a = (async () => {
        let firstPages: MatchesPageResult[];
        try {
          const pages: MatchesPageResult[] = [];
          for (let c = 0; c < subaccountChunks.length; c++) {
            const subChunk = subaccountChunks[c]!;
            const p = await fetchOnePage(subChunk);
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
        positionStatsMapRef.current = buildPositionStatsMap(allTrades, false);
        const firstPagePnlStats = buildPnlStats(allTrades, fundingPaidUsdRef.current);

        // Update data after first-page trades arrive
        setData((prev) => ({
          ...prev,
          trades: allTrades,
          stats: prev.stats
            ? {
                ...prev.stats,
                trades: allTrades,
                trades_complete: firstPages.every((page) => page.done),
                ...firstPagePnlStats,
                positions: applySessionFunding(
                  applyPositionStats(
                    applySnapshotEntryPrices(prev.stats.positions, entryPriceMapRef.current),
                    positionStatsMapRef.current,
                  ),
                  positionStatsMapRef.current,
                  fundingPaymentsRef.current,
                ),
              }
            : null,
          globalMatchesComplete: firstPages.every((page) => page.done),
          tradesComplete: firstPages.every((page) => page.done),
        }));

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
              const result = await fetchOnePage(
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
            positionStatsMapRef.current = buildPositionStatsMap(allTrades, tradesCompleteRef.current);
            const updatedStats = buildPnlStats(
              allTrades,
              fundingPaidUsdRef.current,
            );

            setData((prev) => ({
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
                    positions: applySessionFunding(
                      applyPositionStats(
                        applySnapshotEntryPrices(prev.stats.positions, entryPriceMapRef.current),
                        positionStatsMapRef.current,
                      ),
                      positionStatsMapRef.current,
                      fundingPaymentsRef.current,
                    ),
                  }
                : null,
            }));

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
        console.error("[useWalletData] background phase error:", e);
      });

      // Poll live position marks / unrealized only — subaccount_info only (Gateway).
      // avg_entry (account_snapshots) is cached and only re-fetched when a fill is detected:
      // if any position's amount_x18 changed since the last tick, a fill happened and the
      // avg_entry must be refreshed. Otherwise we skip the Archive call entirely.
      const pollPositionsOnly = async () => {
        if (cancelled) return;
        let pd = await fetchAllPositions(
          subaccountsRef.current,
          isolatedParentNameRef.current,
          isolatedParentSubaccountRef.current,
        );
        if (cancelled) return;

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
          const freshMaps = await fetchIsolatedParentMaps(subaccountsRef.current);
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
            pd = await fetchAllPositions(
              subaccountsRef.current,
              isolatedParentNameRef.current,
              isolatedParentSubaccountRef.current,
            );
            if (cancelled) return;
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

        if (fillDetected) {
          const crossSubs = subaccountsRef.current
            .filter((s) => !s.isolated)
            .map((s) => s.subaccount);
          const [freshMap, newTrades] = await Promise.all([
            fetchSnapshotEntryPrices(crossSubs),
            latestKnownIdxRef.current
              ? fetchIncrementalTrades(chunk(subaccountsRef.current.map((s) => s.subaccount), 5), latestKnownIdxRef.current)
              : Promise.resolve([] as TradeMatch[]),
          ]);
          if (!cancelled) {
            entryPriceMapRef.current = freshMap;
            if (newTrades.length > 0) {
              const updatedTrades = sortTradesNewestFirst([...newTrades, ...tradesRef.current]);
              tradesRef.current = updatedTrades;
              latestKnownIdxRef.current = updatedTrades[0]?.submission_idx ?? latestKnownIdxRef.current;
              positionStatsMapRef.current = buildPositionStatsMap(updatedTrades, tradesCompleteRef.current);
              const updatedPnlStats = buildPnlStats(updatedTrades, fundingPaidUsdRef.current);
              setData((prev) => prev.stats
                ? { ...prev, trades: updatedTrades, stats: { ...prev.stats, trades: updatedTrades, ...updatedPnlStats } }
                : prev,
              );
            }
          }
        }
        if (cancelled) return;
        // Use global funding if loaded (CTA clicked), otherwise fall back to position-scoped funding.
        const effectiveFunding = fundingPaymentsRef.current.length > 0
          ? fundingPaymentsRef.current
          : positionFundingPaymentsRef.current;
        const pollPositions = applySessionFunding(
          applyPositionStats(
            applySnapshotEntryPrices(pd.positions, entryPriceMapRef.current),
            positionStatsMapRef.current,
          ),
          positionStatsMapRef.current,
          effectiveFunding,
        );
        const pollTotals = recomputeUnrealizedTotals(pollPositions, pd.equityUsd, pd.unrealizedTotal);
        setData((prev) => ({
          ...prev,
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
              }
            : null,
        }));
      };

      intervalRef.current = setInterval(() => {
        void pollPositionsOnly();
      }, POSITIONS_POLL_MS);

      refreshUnrealizedImplRef.current = async () => {
        if (cancelled) return;
        setData((prev) => ({ ...prev, unrealizedRefreshing: true }));
        try {
          // Re-discover subaccounts from Archive — picks up brand-new isolated pockets
          // created after the initial page load.
          const freshSubs = await fetchSubaccounts();
          if (cancelled) return;
          subaccountsRef.current = freshSubs;

          // Re-fetch isolated parent maps with the updated subaccount list.
          const freshMaps = await fetchIsolatedParentMaps(freshSubs);
          if (!cancelled) {
            isolatedParentNameRef.current = freshMaps.parentNameByIsolatedSubaccount;
            isolatedParentSubaccountRef.current = freshMaps.parentSubaccountByIsolatedSubaccount;
          }
          if (cancelled) return;

          const pd = await fetchAllPositions(
            subaccountsRef.current,
            isolatedParentNameRef.current,
            isolatedParentSubaccountRef.current,
          );
          if (cancelled) return;

          // Re-fetch snapshot entry prices for all (possibly new) cross subaccounts.
          const refreshedCrossSubs = subaccountsRef.current
            .filter((s) => !s.isolated)
            .map((s) => s.subaccount);
          const [refreshedMap, newTrades] = await Promise.all([
            fetchSnapshotEntryPrices(refreshedCrossSubs),
            latestKnownIdxRef.current
              ? fetchIncrementalTrades(chunk(subaccountsRef.current.map((s) => s.subaccount), 5), latestKnownIdxRef.current)
              : Promise.resolve([] as TradeMatch[]),
          ]);
          if (!cancelled) {
            entryPriceMapRef.current = refreshedMap;
            if (newTrades.length > 0) {
              const updatedTrades = sortTradesNewestFirst([...newTrades, ...tradesRef.current]);
              tradesRef.current = updatedTrades;
              latestKnownIdxRef.current = updatedTrades[0]?.submission_idx ?? latestKnownIdxRef.current;
              positionStatsMapRef.current = buildPositionStatsMap(updatedTrades, tradesCompleteRef.current);
              const updatedPnlStats = buildPnlStats(updatedTrades, fundingPaidUsdRef.current);
              setData((prev) => prev.stats
                ? { ...prev, trades: updatedTrades, stats: { ...prev.stats, trades: updatedTrades, ...updatedPnlStats } }
                : prev,
              );
            }
          }
          if (cancelled) return;

          const refreshPositions = applySessionFunding(
            applyPositionStats(
              applySnapshotEntryPrices(pd.positions, entryPriceMapRef.current),
              positionStatsMapRef.current,
            ),
            positionStatsMapRef.current,
            fundingPaymentsRef.current,
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
          const freshSubs = await fetchSubaccounts();
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

          const pd = await fetchAllPositions(
            crossSubs,
            isolatedParentNameRef.current,
            isolatedParentSubaccountRef.current,
          );
          if (cancelled) {
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
          positionStatsMapRef.current = buildPositionStatsMap(updatedTrades);
          const updatedPnlStats = buildPnlStats(updatedTrades, fundingPaidUsdRef.current);
          setData((prev) => prev.stats
            ? { ...prev, trades: updatedTrades, stats: { ...prev.stats, trades: updatedTrades, ...updatedPnlStats } }
            : prev,
          );
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

    // Wire up the WS fill handler. Closes over all helper functions defined above
    // so it can trigger the same fetch path as the poll-based fillDetected branch.
    wsFillHandlerRef.current = async (fillEvent: FillEvent) => {
      if (cancelled) return;

      // Show toast immediately — before Archive fetch completes
      const pairLabel = productName(fillEvent.product_id) || `#${fillEvent.product_id}`;
      const direction = fillEvent.is_bid ? "Long" : "Short";
      const qty = Math.abs(fromX18BigInt(fillEvent.filled_qty));
      const price = fromX18BigInt(fillEvent.price);
      const role = fillEvent.is_taker ? "taker" : "maker";
      toast.success(`${pairLabel} — ${direction}`, {
        description: `${qty.toFixed(4)} @ $${price.toLocaleString("en-US", { maximumFractionDigits: 2 })} · ${role}`,
      });

      // Immediately trigger the same fetch path as the poll-based fillDetected branch
      const crossSubs = subaccountsRef.current
        .filter((s) => !s.isolated)
        .map((s) => s.subaccount);
      const [freshMap, newTrades] = await Promise.all([
        fetchSnapshotEntryPrices(crossSubs),
        latestKnownIdxRef.current
          ? fetchIncrementalTrades(
              chunk(subaccountsRef.current.map((s) => s.subaccount), 5),
              latestKnownIdxRef.current,
            )
          : Promise.resolve([] as TradeMatch[]),
      ]);
      if (cancelled) return;
      entryPriceMapRef.current = freshMap;
      if (newTrades.length > 0) {
        const updatedTrades = sortTradesNewestFirst([...newTrades, ...tradesRef.current]);
        tradesRef.current = updatedTrades;
        latestKnownIdxRef.current = updatedTrades[0]?.submission_idx ?? latestKnownIdxRef.current;
        positionStatsMapRef.current = buildPositionStatsMap(updatedTrades, tradesCompleteRef.current);
        const updatedPnlStats = buildPnlStats(updatedTrades, fundingPaidUsdRef.current);
        setData((prev) =>
          prev.stats
            ? { ...prev, trades: updatedTrades, stats: { ...prev.stats, trades: updatedTrades, ...updatedPnlStats } }
            : prev,
        );
      }
    };

    void loadWallet("initial").catch((e: unknown) => {
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
      tradesRef.current = [];
      entryPriceMapRef.current = new Map();
      positionStatsMapRef.current = new Map();
      latestKnownIdxRef.current = null;
      seenTradeIdsRef.current = new Set();
      isolatedParentNameRef.current = new Map();
      isolatedParentSubaccountRef.current = new Map();
      fundingPaymentsRef.current = [];
      positionTradesRef.current = [];
      positionOpenTimeMapRef.current = {};
      positionSeenTradeIdsRef.current = new Set();
      loadedFundingProductIdsRef.current = new Set();
      loadingFundingProductIdsRef.current = new Set();
      fundingSubaccountCursorsRef.current = new Map();
      fundingLoadedSinceRef.current = Infinity;
      fundingPeriodActiveRef.current = false;
      wsFillHandlerRef.current = null;
      if (wsFillDebounceRef.current) clearTimeout(wsFillDebounceRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [rawAddress]);

  return {
    ...data,
    refresh: () => refreshImplRef.current(),
    refreshUnrealizedPnl: () => refreshUnrealizedImplRef.current(),
    refreshSpotBalances: () => refreshSpotBalancesImplRef.current(),
    loadGlobalFunding: () => loadGlobalFundingImplRef.current(),
    loadFundingForProducts: (ids: number[]) => loadFundingForProductsImplRef.current(ids),
    loadFundingForPeriod: (period: EquityPeriod) => loadFundingForPeriodImplRef.current(period),
  };
}
