import type { AccountSnapshotEvent } from "@/lib/schemas/nado";
import type { Position } from "@/types/nado";

/**
 * key = `${subaccount_lower}:${product_id}:${isolated}`
 * value = avg entry price in USD
 *
 * Formula (Nado Definitions & Formulas docs):
 *   Avg Entry Price = |net_entry_unrealized / amount|
 * where both fields come from the same account_snapshot event.
 */
export type EntryPriceMap = Map<string, number>;

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

        const key = `${sub}:${event.product_id}:${event.isolated}`;
        map.set(key, entryPrice);
      }
    }
  }

  return map;
}

/**
 * Override position entry prices using snapshot-derived values.
 * Falls back to the existing entry_price when no snapshot data exists.
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
    const snapshotPrice = map.get(key);
    if (snapshotPrice != null && snapshotPrice > 0) {
      return { ...p, entry_price: snapshotPrice };
    }
    return p;
  });
}
