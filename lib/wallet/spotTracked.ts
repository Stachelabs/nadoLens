import type { SpotBalance } from "@/types/nado";
import { TRACKED_SPOT_PRODUCT_IDS } from "@/lib/spotMeta";

export { TRACKED_SPOT_PRODUCT_IDS };

/**
 * True when every tracked product has strictly zero balance (missing = zero).
 * Any negative or positive non-zero on a tracked id → false (subaccount stays visible).
 */
export function isEmptyTrackedSpotBalances(balances: SpotBalance[]): boolean {
  const byId = new Map(balances.map((b) => [b.product_id, b.amount]));
  return !TRACKED_SPOT_PRODUCT_IDS.some((id) => {
    const v = byId.get(id) ?? 0;
    return Math.abs(v) > 1e-12;
  });
}
