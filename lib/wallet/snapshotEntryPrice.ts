import type { AccountSnapshotEvent } from "@/lib/schemas/nado";
import type { Position } from "@/types/nado";

/**
 * key = `${subaccount_lower}:${product_id}:${isolated}`
 *
 * entryPrice  = |net_entry_unrealized / amount| in USD
 * fundingCumulative = net_funding_cumulative in USD (signed: positive = received)
 */
export type EntryPriceMap = Map<string, { entryPrice: number; fundingCumulative: number | null }>;

function parseX18(s: string): number {
  try {
    const n = BigInt(s);
    const PREC = BigInt(10) ** BigInt(18);
    const sign = n < BigInt(0) ? -1 : 1;
    const abs = n < BigInt(0) ? -n : n;
    const whole = abs / PREC;
    const frac = abs % PREC;
    return sign * (Number(whole) + Number(frac) / 1e18);
  } catch {
    return parseFloat(s) / 1e18;
  }
}

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

        const amount = parseX18(perpAmount);
        if (!isFinite(amount) || amount === 0) continue;

        const netEntry = parseX18(netEntryStr);
        if (!isFinite(netEntry)) continue;

        const entryPrice = Math.abs(netEntry / amount);
        if (!isFinite(entryPrice) || entryPrice <= 0) continue;

        const fundingCumulative = event.net_funding_cumulative != null
          ? parseX18(event.net_funding_cumulative)
          : null;

        const key = `${sub}:${event.product_id}:${event.isolated}`;
        map.set(key, { entryPrice, fundingCumulative });
      }
    }
  }

  return map;
}

/**
 * Override position entry prices using snapshot-derived values, and correct
 * unrealized PnL accordingly.
 *
 * WHY: Nado periodically settles v_quote_balance into the spot USDT0 balance.
 * After settlement, v_quote_balance no longer equals -(entry × amount), so
 * the formula "v_quote + amount × oracle" only shows PnL since last settlement.
 * The true unrealized PnL from entry = (mark_price - avg_entry) × amount,
 * where avg_entry = |net_entry_unrealized / amount| from account_snapshots.
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
      const correctedPnl = (p.mark_price - snapshot.entryPrice) * p.amount;
      return {
        ...p,
        entry_price: snapshot.entryPrice,
        unrealized_pnl: correctedPnl,
        // funding_cumulative is computed live in parseSubaccountInfo from
        // last_cumulative_funding_x18 — do not override with snapshot's lifetime counter.
      };
    }
    return p;
  });
}

/**
 * Recompute unrealizedTotal and equityUsd after snapshot entry prices have
 * been applied (which corrects unrealized_pnl on each position).
 */
export function recomputeUnrealizedTotals(
  positions: Position[],
  oldEquity: number,
  oldUnrealizedTotal: number,
): { unrealizedTotal: number; equityUsd: number } {
  const unrealizedTotal = positions.reduce((s, p) => s + p.unrealized_pnl, 0);
  const totalCollateral = oldEquity - oldUnrealizedTotal;
  return { unrealizedTotal, equityUsd: totalCollateral + unrealizedTotal };
}
