"use client";

import { NADO_ARCHIVE_V1 } from "@/lib/nado";
import {
  type ArchiveMatch,
  ArchiveMatchesResponseSchema,
  ArchiveSubaccountsResponseSchema,
} from "@/lib/schemas/nado";
import { parseSubaccountInfo } from "@/lib/parseSubaccountInfo";
import { usePairsStore } from "@/store/pairsStore";
import type { Position, SpotBalance, TradeMatch, WalletStats } from "@/types/nado";
import { fromX18, fromX18BigInt } from "@/types/nado";
import { useEffect, useRef, useState } from "react";

const POSITIONS_POLL_MS = 30_000;
const MATCHES_LIMIT = 500;
const MAX_PAGES = 50;

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
    // Real timestamp from txs[] — fall back to 0 if missing
    const timeSec = txMap.get(m.submission_idx) ?? 0;

    // Actual fill price = |quote_filled / base_filled|, fallback to order priceX18
    const quoteFilled = parseFloat(m.quote_filled ?? "0");
    const baseFilledAbs = Math.abs(baseFilled);
    const fillPrice =
      baseFilledAbs > 0 && m.quote_filled
        ? Math.abs(quoteFilled) / baseFilledAbs
        : parseFloat(m.order?.priceX18 ?? "0") / 1e18;

    return {
      timestamp: (timeSec * 1_000_000_000).toFixed(0),
      product_id: productId,
      pair: productName(productId),
      amount: m.base_filled ?? "0",
      price: (fillPrice * 1e18).toFixed(0),
      realized_pnl: m.realized_pnl ?? "0",
      closed_amount: m.closed_amount ?? "0",
      fee: m.fee ?? "0",
      sequencer_fee: m.sequencer_fee ?? "0",
      side,
      is_perp: isPerpTrade,
    };
  });
}

// ─── Trade stats helper ────────────────────────────────────────────────────────

function computeTradeStats(trades: TradeMatch[]) {
  const closingTrades = trades.filter((t) => {
    try { return BigInt(t.closed_amount) !== BigInt(0) } catch { return false }
  })

  const winningTrades = closingTrades.filter((t) => fromX18BigInt(t.realized_pnl) > 0)
  const winRate = closingTrades.length > 0
    ? (winningTrades.length / closingTrades.length) * 100
    : 0

  const trading_pnl_usd = closingTrades.reduce(
    (s, t) => s + fromX18BigInt(t.realized_pnl),
    0,
  )

  const total_fees_usd = trades.reduce(
    (s, t) => s + Math.abs(fromX18BigInt(t.fee)) + Math.abs(fromX18BigInt(t.sequencer_fee)),
    0,
  )

  const funding_pnl_usd = 0

  const net_pnl_usd = trading_pnl_usd - total_fees_usd + funding_pnl_usd

  const total_volume_usd = trades.reduce(
    (s, t) => s + Math.abs(fromX18BigInt(t.amount)) * fromX18BigInt(t.price),
    0,
  )
  const avg_trade_size_usd = trades.length > 0 ? total_volume_usd / trades.length : 0

  const perpTrades = trades.filter((t) => t.is_perp)
  const spotTrades = trades.filter((t) => !t.is_perp)

  const last_trade_at = trades.length > 0 ? trades[0].timestamp : null
  const first_trade_at =
    trades.length > 0 ? trades[trades.length - 1].timestamp : null

  return {
    win_rate: winRate,
    trading_pnl_usd,
    total_fees_usd,
    funding_pnl_usd,
    net_pnl_usd,
    total_volume_usd,
    avg_trade_size_usd,
    perp_trades_count: perpTrades.length,
    spot_trades_count: spotTrades.length,
    first_trade_at,
    last_trade_at,
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SubaccountEntry = { subaccount: string; isolated: boolean };

export type WalletData = {
  stats: WalletStats | null;
  trades: TradeMatch[];
  loading: boolean;
  tradesComplete: boolean;
  error: string | null;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWalletData(rawAddress: string): WalletData {
  const [data, setData] = useState<WalletData>({
    stats: null,
    trades: [],
    loading: true,
    tradesComplete: false,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subaccountsRef = useRef<SubaccountEntry[]>([]);

  useEffect(() => {
    if (!rawAddress) return;

    let cancelled = false;

    // 1. Resolve all subaccounts (default + isolated) via Archive
    const fetchSubaccounts = async (): Promise<SubaccountEntry[]> => {
      const fallback: SubaccountEntry[] = [
        { subaccount: toSubaccount(rawAddress), isolated: false },
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
        }));
      } catch {
        return fallback;
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
      const allPositions = results.flatMap((r) => r.positions);
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

    // 4. Fetch a single page of matches
    const fetchOnePage = async (
      subs: string[],
      lastIdx?: string,
    ): Promise<{ trades: TradeMatch[]; nextIdx: string | null; done: boolean }> => {
      try {
        const body: Record<string, unknown> = {
          matches: {
            subaccounts: subs,
            isolated: null,
            limit: MATCHES_LIMIT,
            ...(lastIdx ? { idx: lastIdx } : {}),
          },
        };
        const res = await fetch(NADO_ARCHIVE_V1, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return { trades: [], nextIdx: null, done: true };
        const raw: unknown = await res.json();
        const result = ArchiveMatchesResponseSchema.safeParse(raw);
        if (!result.success || result.data.matches.length === 0)
          return { trades: [], nextIdx: null, done: true };

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

    const init = async () => {
      const subs = await fetchSubaccounts();
      if (cancelled) return;
      subaccountsRef.current = subs;
      const subAddrs = subs.map((s) => s.subaccount);

      // Fetch positions + first page of trades in parallel
      const [positionData, firstPage] = await Promise.all([
        fetchAllPositions(subs),
        fetchOnePage(subAddrs),
      ]);
      if (cancelled) return;

      let allTrades = firstPage.trades;

      // Render dashboard immediately after first page
      setData({
        stats: {
          address: rawAddress,
          health_score: positionData.healthScore,
          total_equity_usd: positionData.equityUsd,
          available_margin: positionData.availableMargin,
          maintenance_margin: positionData.maintenanceMargin,
          unrealized_pnl_usd: positionData.unrealizedTotal,
          positions: positionData.positions,
          spot_balances: positionData.spotBalances,
          trades: allTrades,
          trades_complete: firstPage.done,
          ...computeTradeStats(allTrades),
        },
        trades: allTrades,
        loading: false,
        tradesComplete: firstPage.done,
        error: null,
      });

      // Background: fetch remaining pages
      if (!firstPage.done) {
        let nextIdx = firstPage.nextIdx;
        for (let page = 1; page < MAX_PAGES && nextIdx && !cancelled; page++) {
          const result = await fetchOnePage(subAddrs, nextIdx);
          if (cancelled) break;

          allTrades = [...allTrades, ...result.trades];
          const updatedStats = computeTradeStats(allTrades);

          setData((prev) => ({
            ...prev,
            trades: allTrades,
            tradesComplete: result.done || page === MAX_PAGES - 1,
            stats: prev.stats
              ? { ...prev.stats, trades: allTrades, trades_complete: result.done || page === MAX_PAGES - 1, ...updatedStats }
              : null,
          }));

          if (result.done) break;
          nextIdx = result.nextIdx;
        }

        // Ensure tradesComplete is set when MAX_PAGES is reached
        if (!cancelled) {
          setData((prev) => ({
            ...prev,
            tradesComplete: true,
            stats: prev.stats ? { ...prev.stats, trades_complete: true } : null,
          }));
        }
      }

      // Poll positions every 30s
      intervalRef.current = setInterval(async () => {
        if (cancelled) return;
        const pd = await fetchAllPositions(subaccountsRef.current);
        setData((prev) => ({
          ...prev,
          stats: prev.stats
            ? {
                ...prev.stats,
                positions: pd.positions,
                spot_balances: pd.spotBalances,
                total_equity_usd: pd.equityUsd,
                available_margin: pd.availableMargin,
                maintenance_margin: pd.maintenanceMargin,
                health_score: pd.healthScore,
                unrealized_pnl_usd: pd.unrealizedTotal,
              }
            : null,
        }));
      }, POSITIONS_POLL_MS);
    };

    void init().catch(() => {
      if (!cancelled)
        setData((p) => ({
          ...p,
          loading: false,
          tradesComplete: true,
          stats: p.stats ? { ...p.stats, trades_complete: true } : null,
          error: "Failed to load wallet data",
        }));
    });

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [rawAddress]);

  return data;
}
