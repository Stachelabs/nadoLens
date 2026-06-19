import type { AccountSnapshotEvent } from "@/lib/schemas/nado";
import type { Position } from "@/types/nado";
import { fromX18BigInt } from "@/types/nado";

/**
 * key = `${subaccount_lower}:${product_id}:${isolated}`
 *
 * entryPrice  = |net_entry_unrealized / amount| in USD
 * fundingCumulative = net_funding_cumulative in USD (signed: positive = received)
 */
export type EntryPriceMap = Map<string, { entryPrice: number; fundingCumulative: number | null }>;

/**
 * Build an EntryPriceMap from raw snapshot events.
 * Only perp events with non-zero amount produce a key.
 */
export function buildEntryPriceMap(
  snapshotsBySubaccount: Record<string, Record<string, (Partial<AccountSnapshotEvent> & { product_id: number; isolated: boolean; net_entry_unrealized: string })[]>>,
): EntryPriceMap {
  const map: EntryPriceMap = new Map();

  for (const [subaccount, byTimestamp] of Object.entries(snapshotsBySubaccount)) {
    const sub = subaccount.toLowerCase();

    for (const events of Object.values(byTimestamp)) {
      for (const event of events) {
        const perpAmount = event.post_balance?.perp?.balance?.amount;
        if (!perpAmount) continue; // not a perp event

        const netEntryStr = event.net_entry_unrealized;
        if (!netEntryStr) continue;

        const amount = fromX18BigInt(perpAmount);
        if (!isFinite(amount) || amount === 0) continue;

        const netEntry = fromX18BigInt(netEntryStr);
        if (!isFinite(netEntry)) continue;

        const entryPrice = Math.abs(netEntry / amount);
        if (!isFinite(entryPrice) || entryPrice <= 0) continue;

        const fundingCumulative = event.net_funding_cumulative != null
          ? fromX18BigInt(event.net_funding_cumulative)
          : null;

        const key = `${sub}:${event.product_id}:${event.isolated}`;
        map.set(key, { entryPrice, fundingCumulative });
      }
    }
  }

  return map;
}

/**
 * Override position entry prices and unrealized PnL using snapshot-derived values.
 *
 * WHY: Nado's Gateway field (v_quote + amount × oracle) resets only on settlement,
 * so after a partial close it still carries the realized portion until the next
 * settlement. account_snapshots.net_entry_unrealized tracks only the open cost
 * basis and resets proportionally on every partial close — giving pure unrealized PnL.
 */
export function applySnapshotEntryPrices(
  positions: Position[],
  map: EntryPriceMap,
): Position[] {
  if (map.size === 0) return positions;
  return positions.map((p) => {
    // For isolated positions the fills are on the parent subaccount
    const querySub = p.isolated
      ? (p.parent_subaccount ?? p.subaccount).toLowerCase()
      : p.subaccount.toLowerCase();
    const key = `${querySub}:${p.product_id}:${p.isolated}`;
    const snapshot = map.get(key);
    if (snapshot != null && snapshot.entryPrice > 0) {
      // Pure unrealized PnL from original entry:
      //   (oracle_price × amount) − net_entry_unrealized
      // Equivalent form used here: (mark_price − avg_entry) × amount
      // where avg_entry = |net_entry_unrealized / amount| from account_snapshots.
      // net_entry_unrealized resets proportionally on partial close, so this
      // value never includes already-realized gains/losses.
      // We intentionally ignore p.unrealized_pnl (Gateway's v_quote-based field),
      // which blends realized PnL from partial closes until Nado settles them.
      const unrealized_pnl = (p.mark_price - snapshot.entryPrice) * p.amount;
      return {
        ...p,
        entry_price: snapshot.entryPrice,
        unrealized_pnl,
        // funding_cumulative is computed live in parseSubaccountInfo from
        // last_cumulative_funding_x18 — do not override with snapshot's lifetime counter.
      };
    }
    return p;
  });
}

/**
 * Recompute unrealizedTotal after snapshot entry prices correct position PnL.
 * Equity from Gateway healths is authoritative — passed through unchanged.
 */
export function recomputeUnrealizedTotals(
  positions: Position[],
  oldEquity: number | null,
  _oldUnrealizedTotal: number,
): { unrealizedTotal: number; equityUsd: number | null } {
  const unrealizedTotal = positions.reduce((s, p) => s + p.unrealized_pnl, 0);
  return { unrealizedTotal, equityUsd: oldEquity };
}
