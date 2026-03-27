"use client";

import { NADO_ARCHIVE_V1 } from "@/lib/nado";
import {
  ArchiveMatchesResponseSchema,
  ArchiveSubaccountsResponseSchema,
} from "@/lib/schemas/nado";
import { parseSubaccountInfo } from "@/lib/parseSubaccountInfo";
import { usePairsStore } from "@/store/pairsStore";
import type { Position, TradeMatch, WalletStats } from "@/types/nado";
import { fromX18 } from "@/types/nado";
import { useEffect, useRef, useState } from "react";
const POSITIONS_POLL_MS = 30_000;

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

const PARSE_FALLBACK = { positions: [] as Position[], equityUsd: 0, availableMargin: 0, healthScore: 1 }

function parsePositions(
  raw: unknown,
  isolated = false,
): { positions: Position[]; equityUsd: number; availableMargin: number; healthScore: number } {
  const parsed = parseSubaccountInfo(raw, isolated)
  if (!parsed) return PARSE_FALLBACK
  return {
    positions: parsed.positions,
    equityUsd: parsed.equityUsd,
    availableMargin: parsed.availableMargin,
    healthScore: parsed.healthScore,
  }
}

function estimateTimeSec(submissionIdx: string, newestIdx: number): number {
  const diff = newestIdx - parseInt(submissionIdx);
  return Math.floor(Date.now() / 1000) - diff * 2; // Ink L2 ≈ 2s/block
}

function parseMatches(raw: unknown): TradeMatch[] {
  const result = ArchiveMatchesResponseSchema.safeParse(raw);
  if (!result.success) return [];

  const matches = result.data.matches;
  if (matches.length === 0) return [];

  const newestIdx = Math.max(...matches.map((m) => parseInt(m.submission_idx)));

  return matches.map((m): TradeMatch => {
    const productId =
      m.pre_balance?.base?.perp?.product_id ??
      m.post_balance?.base?.perp?.product_id ??
      0;
    const baseFilled = parseFloat(m.base_filled ?? "0");
    const side: "long" | "short" = baseFilled >= 0 ? "long" : "short";
    const timeSec = estimateTimeSec(m.submission_idx, newestIdx);

    return {
      timestamp: (timeSec * 1_000_000_000).toFixed(0),
      product_id: productId,
      pair: productName(productId),
      amount: m.base_filled ?? "0",
      price: m.order?.priceX18 ?? "0",
      realized_pnl: m.realized_pnl ?? "0",
      closed_amount: m.closed_amount ?? "0",
      fee: m.fee ?? "0",
      side,
    };
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SubaccountEntry = { subaccount: string; isolated: boolean };

export type WalletData = {
  stats: WalletStats | null;
  trades: TradeMatch[];
  loading: boolean;
  error: string | null;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWalletData(rawAddress: string): WalletData {
  const [data, setData] = useState<WalletData>({
    stats: null,
    trades: [],
    loading: true,
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
      equityUsd: number;
      availableMargin: number;
      healthScore: number;
    }> => {
      try {
        const res = await fetch(`/api/wallet/${sub}?query=subaccount_info`, {
          cache: "no-store",
        });
        if (!res.ok)
          return {
            positions: [],
            equityUsd: 0,
            availableMargin: 0,
            healthScore: 1,
          };
        const raw: unknown = await res.json();
        return parsePositions(raw, isolated);
      } catch {
        return {
          positions: [],
          equityUsd: 0,
          availableMargin: 0,
          healthScore: 1,
        };
      }
    };

    // 3. Fetch positions for all subaccounts and merge
    const fetchAllPositions = async (
      subs: SubaccountEntry[],
    ): Promise<{
      positions: Position[];
      equityUsd: number;
      availableMargin: number;
      healthScore: number;
    }> => {
      const results = await Promise.all(
        subs.map(({ subaccount, isolated }) =>
          fetchPositions(subaccount, isolated),
        ),
      );
      const allPositions = results.flatMap((r) => r.positions);
      const equityUsd = results.reduce((s, r) => s + r.equityUsd, 0);
      const availableMargin = results.reduce(
        (s, r) => s + r.availableMargin,
        0,
      );
      // Health from the primary (non-isolated) subaccount
      const primaryIdx = subs.findIndex((s) => !s.isolated);
      const healthScore =
        results[primaryIdx >= 0 ? primaryIdx : 0]?.healthScore ?? 1;
      return {
        positions: allPositions,
        equityUsd,
        availableMargin,
        healthScore,
      };
    };

    // 4. Fetch matches for all subaccounts in one call
    const fetchMatches = async (subs: string[]): Promise<TradeMatch[]> => {
      try {
        const res = await fetch(NADO_ARCHIVE_V1, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matches: { subaccounts: subs, limit: 200 } }),
        });
        if (!res.ok) return [];
        const raw: unknown = await res.json();
        return parseMatches(raw);
      } catch {
        return [];
      }
    };

    const init = async () => {
      const subs = await fetchSubaccounts();
      if (cancelled) return;
      subaccountsRef.current = subs;

      const [positionData, trades] = await Promise.all([
        fetchAllPositions(subs),
        fetchMatches(subs.map((s) => s.subaccount)),
      ]);
      if (cancelled) return;

      const winningTrades = trades.filter(
        (t) => parseFloat(t.realized_pnl) > 0,
      );
      const winRate =
        trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
      const totalPnlUsd = trades.reduce(
        (s, t) => s + fromX18(t.realized_pnl),
        0,
      );
      const totalVolumeUsd = trades.reduce(
        (s, t) => s + Math.abs(fromX18(t.amount)) * fromX18(t.price),
        0,
      );
      const avgTradeSizeUsd =
        trades.length > 0 ? totalVolumeUsd / trades.length : 0;

      setData({
        stats: {
          address: rawAddress,
          health_score: positionData.healthScore,
          total_equity_usd: positionData.equityUsd,
          available_margin: positionData.availableMargin,
          positions: positionData.positions,
          trades,
          win_rate: winRate,
          total_pnl_usd: totalPnlUsd,
          total_volume_usd: totalVolumeUsd,
          avg_trade_size_usd: avgTradeSizeUsd,
        },
        trades,
        loading: false,
        error: null,
      });

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
                total_equity_usd: pd.equityUsd,
                available_margin: pd.availableMargin,
                health_score: pd.healthScore,
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
