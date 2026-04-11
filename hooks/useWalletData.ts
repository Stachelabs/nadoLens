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
import type { Position, SpotBalance, SubaccountHealthEntry, TradeMatch, WalletStats } from "@/types/nado";
import { fromX18BigInt } from "@/types/nado";
import { useEffect, useRef, useState } from "react";

// Poll interval for live positions + marks.
// subaccount_info = weight 2, account_snapshots = weight ~2 → 4 weight/poll/subaccount.
// At 5s: 48 weight/min/user → safe for ~50 concurrent users within 2400/min IP limit.
// Lower to 1_000 for personal/single-user deployments (10% of budget).
const POSITIONS_POLL_MS = 6_000;
const MATCHES_LIMIT = 500;
const MAX_PAGES = 50;
/** Space out Archive `matches` calls — parallel bursts hit IP rate limits (HTTP 429). */
const MATCHES_BURST_MS = 220;
const MATCHES_429_MAX_ATTEMPTS = 8;
const FUNDING_BURST_MS = 120;
const FUNDING_429_MAX_ATTEMPTS = 8;

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
  tradesComplete: boolean;
  fundingComplete: boolean;
  error: string | null;
  /** True while re-fetching subaccounts + matches + funding (manual refresh). */
  refreshing: boolean;
  /** True while re-fetching Gateway subaccount_info for live marks / unrealized only. */
  unrealizedRefreshing: boolean;
  /** Reloads account snapshot, trade history, and funding — not polled automatically. */
  refresh: () => Promise<void>;
  /** Re-query Gateway for positions + unrealized only (same as 30s poll, immediate). */
  refreshUnrealizedPnl: () => Promise<void>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWalletData(rawAddress: string): WalletData {
  const [data, setData] = useState<
    Omit<WalletData, "refresh" | "refreshUnrealizedPnl">
  >({
    stats: null,
    trades: [],
    fundingPayments: [],
    loading: true,
    tradesComplete: false,
    fundingComplete: false,
    error: null,
    refreshing: false,
    unrealizedRefreshing: false,
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

  useEffect(() => {
    if (!rawAddress) return;

    let cancelled = false;
    fundingPaidUsdRef.current = 0;
    fundingPaymentsRef.current = [];
    prevAmountsRef.current = new Map();

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
      // Merge spot balances: sum amounts for same product_id across subaccounts
      const spotMap = new Map<number, SpotBalance>()
      for (const r of results) {
        for (const b of r.spotBalances) {
          const existing = spotMap.get(b.product_id)
          if (existing) {
            spotMap.set(b.product_id, { ...existing, amount: existing.amount + b.amount, value_usd: existing.value_usd + b.value_usd })
          } else {
            spotMap.set(b.product_id, { ...b })
          }
        }
      }
      const spotBalances = Array.from(spotMap.values())
      const equityUsd = results.reduce((s, r) => s + r.equityUsd, 0);
      const availableMargin = results.reduce((s, r) => s + r.availableMargin, 0);
      const maintenanceMargin = results.reduce((s, r) => s + r.maintenanceMargin, 0);
      // Health from the primary (non-isolated) subaccount
      const primaryIdx = subs.findIndex((s) => !s.isolated);
      const healthScore =
        results[primaryIdx >= 0 ? primaryIdx : 0]?.healthScore ?? 1;
      const unrealizedTotal = results.reduce((s, r) => s + r.unrealizedTotal, 0);

      const normalizeSubName = (name: string): string => {
        if (name === 'default') return 'main'
        const m = /^default_(\d+)$/.exec(name)
        if (m) return m[1] ?? 'main'
        return name
      }
      const subaccountHealths: SubaccountHealthEntry[] = subs
        .flatMap((sub, i): SubaccountHealthEntry[] => {
          const r = results[i]
          if (!r) return []
          if (r.equityUsd === 0 && r.positions.length === 0) return []
          const entry: SubaccountHealthEntry = {
            subaccount: sub.subaccount,
            subaccount_name: normalizeSubName(sub.subaccount_name ?? 'default'),
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

      for (let attempt = 0; attempt < MATCHES_429_MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch("/api/matches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
          });

          if (res.status === 429) {
            if (attempt < MATCHES_429_MAX_ATTEMPTS - 1) {
              const ra = res.headers.get("Retry-After");
              const fromHeader = ra ? Math.min(parseInt(ra, 10) * 1000, 60_000) : 0;
              const backoff = Math.min(
                400 * 2 ** attempt + fromHeader,
                60_000,
              );
              await sleep(backoff);
              continue;
            }
            return {
              trades: [],
              nextIdx: lastIdx ?? null,
              done: false,
              rateLimited: true,
            };
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
      }

      return {
        trades: [],
        nextIdx: lastIdx ?? null,
        done: false,
        rateLimited: true,
      };
    };

    const fetchFundingPaidBySubaccount = async (
      subaccount: string,
      productIds: number[],
    ): Promise<FundingFetchResult> => {
      if (productIds.length === 0) {
        return {
          totalFundingUsd: 0,
          payments: [],
          complete: true,
        };
      }
      const LIMIT = 100;
      const FUNDING_MAX_PAGES = 100;
      let page = 0;
      let maxIdx: string | undefined;
      let totalFundingUsd = 0;
      const seen = new Set<string>();
      const payments: FundingPaymentEntry[] = [];
      let complete = true;

      while (page < FUNDING_MAX_PAGES) {
        page += 1;
        const body: Record<string, unknown> = {
          subaccount,
          product_ids: productIds,
          limit: LIMIT,
          ...(maxIdx ? { max_idx: maxIdx } : {}),
        };

        let res: Response | null = null;
        for (let attempt = 1; attempt <= FUNDING_429_MAX_ATTEMPTS; attempt++) {
          res = await fetch("/api/funding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
          });
          if (res.status !== 429) break;
          if (attempt < FUNDING_429_MAX_ATTEMPTS) {
            await sleep(Math.min(FUNDING_BURST_MS * 2 ** (attempt - 1), 2500));
          }
        }
        if (!res || res.status === 429) {
          return {
            totalFundingUsd,
            payments,
            complete: false,
            rateLimited: true,
          };
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

        const collectPayments = (
          items: typeof result.data.funding_payments,
        ) => {
          for (const payment of items) {
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
        };

        collectPayments(result.data.funding_payments);

        const nextIdx = result.data.next_idx;
        if (nextIdx === null || nextIdx === undefined) break;
        maxIdx = String(nextIdx);
        await sleep(FUNDING_BURST_MS);
      }

      if (page >= FUNDING_MAX_PAGES) complete = false;
      return { totalFundingUsd, payments, complete };
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

      // Fetch snapshot entry prices — uses net_entry_unrealized/amount (Nado official formula).
      // Only cross (non-isolated) subaccounts are needed: they hold both cross + isolated events.
      const crossSubaccounts = subs.filter((s) => !s.isolated).map((s) => s.subaccount);
      entryPriceMapRef.current = await fetchSnapshotEntryPrices(crossSubaccounts);
      if (cancelled) return;

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
          setData({
            stats: null,
            trades: [],
            fundingPayments: [],
            loading: false,
            tradesComplete: false,
            fundingComplete: false,
            refreshing: false,
            unrealizedRefreshing: false,
            error:
              "Archive rate limit — wait a minute and refresh, or open fewer tabs.",
          });
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
      const fundingData = await fetchFundingPaid(
        subAddrs,
        positionData.positions.map((position) => position.product_id),
      );
      fundingPaidUsdRef.current = fundingData.totalFundingUsd;
      fundingPaymentsRef.current = fundingData.payments;
      const initialPnlStats = buildPnlStats(
        allTrades,
        fundingData.totalFundingUsd,
      );

      // Render dashboard immediately after first page
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
          trades: allTrades,
          trades_complete: firstPages.every((page) => page.done),
          ...initialPnlStats,
        },
        trades: allTrades,
        fundingPayments: fundingData.payments,
        loading: false,
        refreshing: false,
        unrealizedRefreshing: false,
        tradesComplete: firstPages.every((page) => page.done),
        fundingComplete: fundingData.complete,
        error:
          fundingData.rateLimited
            ? "Archive rate limit while loading funding — partial funding data shown."
            : !fundingData.complete
              ? "Funding history may be partial (page cap or API error)."
              : null,
      });

      // Background: fetch remaining pages (per chunk, because matches max=5 subaccounts/request)
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
            fundingData.totalFundingUsd,
          );

          setData((prev) => ({
            ...prev,
            trades: allTrades,
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
            tradesComplete: !truncatedByPageLimit,
            stats: prev.stats
              ? { ...prev.stats, trades_complete: !truncatedByPageLimit }
              : null,
          }));
        }
      }

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
        const pollPositions = applySessionFunding(
          applyPositionStats(
            applySnapshotEntryPrices(pd.positions, entryPriceMapRef.current),
            positionStatsMapRef.current,
          ),
          positionStatsMapRef.current,
          fundingPaymentsRef.current,
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
                  unrealized_pnl_usd: refreshTotals.unrealizedTotal,
                }
              : null,
          }));
        } catch {
          setData((prev) => ({ ...prev, unrealizedRefreshing: false }));
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

    void loadWallet("initial").catch((e: unknown) => {
      console.error("[useWalletData] loadWallet failed:", e);
      if (!cancelled)
        setData((p) => ({
          ...p,
          loading: false,
          refreshing: false,
          unrealizedRefreshing: false,
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
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [rawAddress]);

  return {
    ...data,
    refresh: () => refreshImplRef.current(),
    refreshUnrealizedPnl: () => refreshUnrealizedImplRef.current(),
  };
}
