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
import { mergePositionsWithVwapEntry } from "@/lib/wallet/perpVwapEntry";
import {
  computeTradeMetrics,
  mergePnl,
} from "@/lib/wallet/performance";
import { usePairsStore } from "@/store/pairsStore";
import type { Position, SpotBalance, TradeMatch, WalletStats } from "@/types/nado";
import { fromX18BigInt } from "@/types/nado";
import { useEffect, useRef, useState } from "react";

const POSITIONS_POLL_MS = 30_000;
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

export function productName(id: number): string {
  const { byId } = usePairsStore.getState();
  return byId.get(id) ?? `#${id}`;
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
    const baseFilled = parseFloat(m.base_filled ?? "0");
    const side: "long" | "short" = baseFilled >= 0 ? "long" : "short";
    // Real timestamp from txs[] — Unix seconds per Nado docs; fall back to 0 if missing
    const timeSec = txMap.get(m.submission_idx) ?? 0;

    // Encode as synthetic "large int" string — must use BigInt (timeSec * 1e9 exceeds Number precision)
    const timestampStr =
      timeSec > 0
        ? (BigInt(timeSec) * BigInt(1_000_000_000)).toString()
        : "0";

    // Fill price for avg-entry replay = |(quote_filled - fee) / base_filled| in x18.
    // Nado UI entry appears fee-adjusted on open fills (matches latest screenshot parity).
    // We do not subtract sequencer_fee separately because `fee` already includes it per docs.
    const WAD_LOCAL = BigInt(10) ** BigInt(18);
    let priceX18Str: string;
    try {
      const baseB = BigInt(m.base_filled ?? "0");
      if (baseB !== BigInt(0) && m.quote_filled) {
        const quoteB = BigInt(m.quote_filled);
        const feeB = BigInt(m.fee ?? "0");
        const absBase = baseB < BigInt(0) ? -baseB : baseB;
        const absQuote = quoteB < BigInt(0) ? -quoteB : quoteB;
        const absFee = feeB < BigInt(0) ? -feeB : feeB;
        const netQuote = absQuote > absFee ? absQuote - absFee : absQuote;
        priceX18Str = ((netQuote * WAD_LOCAL) / absBase).toString();
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
  const tradesRef = useRef<TradeMatch[]>([]);
  /**
   * Perp fills for open positions' product_ids only (Archive `matches` + product_ids).
   * Used for avg-entry VWAP; avoids mixing other markets into replay on the first page.
   */
  const vwapTradesRef = useRef<TradeMatch[]>([]);
  /** Funding total from full pagination — expensive; only updated on full load / refresh. */
  const fundingPaidUsdRef = useRef(0);
  const fundingPaymentsRef = useRef<FundingPaymentEntry[]>([]);
  const refreshImplRef = useRef<() => Promise<void>>(async () => {});
  const refreshUnrealizedImplRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!rawAddress) return;

    let cancelled = false;
    fundingPaidUsdRef.current = 0;
    fundingPaymentsRef.current = [];

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

    const fetchIsolatedParentNameMap = async (
      subs: SubaccountEntry[],
    ): Promise<Map<string, string>> => {
      const out = new Map<string, string>();
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
            out.set(
              iso.subaccount.toLowerCase(),
              c.subaccount_name ?? "default",
            );
          }
        } catch {
          // best effort only
        }
      }
      return out;
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
    ): Promise<{
      positions: Position[];
      spotBalances: SpotBalance[];
      equityUsd: number;
      availableMargin: number;
      maintenanceMargin: number;
      healthScore: number;
      unrealizedTotal: number;
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
      return {
        positions: allPositions,
        spotBalances,
        equityUsd,
        availableMargin,
        maintenanceMargin,
        healthScore,
        unrealizedTotal,
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

    /** Paginate Archive `matches` with product filter — correct VWAP replay without cross-market noise. */
    const fetchAllMatchesForVwap = async (
      chunks: string[][],
      productIds: number[],
    ): Promise<TradeMatch[]> => {
      const out: TradeMatch[] = [];
      const seen = new Set<string>();
      for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c]!;
        let nextIdx: string | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const result = await fetchOnePage(chunk, nextIdx, productIds);
          if (result.rateLimited) break;
          for (const t of result.trades) {
            const id = tradeIdentity(t);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(t);
          }
          if (result.done) break;
          nextIdx = result.nextIdx ?? undefined;
          if (!nextIdx) break;
          await sleep(MATCHES_BURST_MS);
        }
        if (c < chunks.length - 1) await sleep(MATCHES_BURST_MS);
      }
      return sortTradesNewestFirst(out);
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
      isolatedParentNameRef.current = await fetchIsolatedParentNameMap(subs);
      if (
        isolatedParentNameRef.current.size === 0 &&
        subs.some((s) => s.isolated)
      ) {
        await sleep(200);
        isolatedParentNameRef.current = await fetchIsolatedParentNameMap(subs);
      }
      if (cancelled) return;
      const subAddrs = subs.map((s) => s.subaccount);

      const subaccountChunks = chunk(subAddrs, 5);

      const positionData = await fetchAllPositions(
        subs,
        isolatedParentNameRef.current,
      );
      if (cancelled) return;

      const openProductIds = [
        ...new Set(positionData.positions.map((p) => p.product_id)),
      ];
      vwapTradesRef.current = [];

      let firstPages: MatchesPageResult[];
      let vwapTrades: TradeMatch[] = [];
      try {
        [firstPages, vwapTrades] = await Promise.all([
          (async (): Promise<MatchesPageResult[]> => {
            const pages: MatchesPageResult[] = [];
            for (let c = 0; c < subaccountChunks.length; c++) {
              const subChunk = subaccountChunks[c]!;
              const p = await fetchOnePage(subChunk);
              if (p.rateLimited) throw new Error("RATE_LIMIT");
              pages.push(p);
              if (c < subaccountChunks.length - 1) await sleep(MATCHES_BURST_MS);
            }
            return pages;
          })(),
          openProductIds.length > 0
            ? fetchAllMatchesForVwap(subaccountChunks, openProductIds)
            : Promise.resolve([]),
        ]);
        vwapTradesRef.current = vwapTrades;
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
      const seenTradeIds = new Set(allTrades.map(tradeIdentity));
      tradesRef.current = allTrades;
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
      setData({
        stats: {
          address: rawAddress,
          health_score: positionData.healthScore,
          total_equity_usd: positionData.equityUsd,
          available_margin: positionData.availableMargin,
          maintenance_margin: positionData.maintenanceMargin,
          unrealized_pnl_usd: positionData.unrealizedTotal,
          positions: mergePositionsWithVwapEntry(
            positionData.positions,
            vwapTradesRef.current.length > 0
              ? vwapTradesRef.current
              : allTrades,
          ),
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
              if (seenTradeIds.has(id)) return false;
              seenTradeIds.add(id);
              return true;
            });
            allTrades = sortTradesNewestFirst([...allTrades, ...uniqueTrades]);
            if (a < active.length - 1) await sleep(MATCHES_BURST_MS);
          }

          tradesRef.current = allTrades;
          const updatedStats = buildPnlStats(
            allTrades,
            fundingData.totalFundingUsd,
          );
          const allDone = chunkStates.every((state) => state.done);

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
                  positions: mergePositionsWithVwapEntry(
                    prev.stats.positions,
                    vwapTradesRef.current.length > 0
                      ? vwapTradesRef.current
                      : allTrades,
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

      // Poll live position marks / unrealized only — same Gateway route as load, but we do not
      // overwrite equity, overview metrics, or PnL-from-history until refresh.
      const pollPositionsOnly = async () => {
        if (cancelled) return;
        const pd = await fetchAllPositions(
          subaccountsRef.current,
          isolatedParentNameRef.current,
        );
        setData((prev) => ({
          ...prev,
          stats: prev.stats
            ? {
                ...prev.stats,
                positions: mergePositionsWithVwapEntry(
                  pd.positions,
                  vwapTradesRef.current.length > 0
                    ? vwapTradesRef.current
                    : tradesRef.current,
                ),
                health_score: pd.healthScore,
                total_equity_usd: pd.equityUsd,
                available_margin: pd.availableMargin,
                maintenance_margin: pd.maintenanceMargin,
                spot_balances: pd.spotBalances,
                unrealized_pnl_usd: pd.unrealizedTotal,
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
          const pd = await fetchAllPositions(
            subaccountsRef.current,
            isolatedParentNameRef.current,
          );
          if (cancelled) return;
          setData((prev) => ({
            ...prev,
            unrealizedRefreshing: false,
            stats: prev.stats
              ? {
                  ...prev.stats,
                  positions: mergePositionsWithVwapEntry(
                    pd.positions,
                    vwapTradesRef.current.length > 0
                      ? vwapTradesRef.current
                      : tradesRef.current,
                  ),
                  health_score: pd.healthScore,
                  total_equity_usd: pd.equityUsd,
                  available_margin: pd.availableMargin,
                  maintenance_margin: pd.maintenanceMargin,
                  spot_balances: pd.spotBalances,
                  unrealized_pnl_usd: pd.unrealizedTotal,
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
      try {
        await loadWallet("refresh");
      } catch {
        setData((prev) => ({
          ...prev,
          refreshing: false,
          error: prev.error ?? "Refresh failed",
        }));
      }
    };

    void loadWallet("initial").catch(() => {
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
      vwapTradesRef.current = [];
      isolatedParentNameRef.current = new Map();
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
