import type { SpotBalancesGroup, SubaccountHealthEntry, TradeMatch } from "@/types/nado";

export const SUBACCOUNT_FILTER_ALL = "All";

export function resolveSubaccountFilterDisplay(
  selected: string,
  crossLabels: string[],
): string {
  const labels = new Set([SUBACCOUNT_FILTER_ALL, ...crossLabels]);
  if (labels.has(selected)) return selected;
  return SUBACCOUNT_FILTER_ALL;
}

/** Hex (lowercase) → display label — cross subs from spot groups + all health rows (isolated pockets). */
export function buildSubaccountLabelByHex(stats: {
  spot_balances_by_subaccount: SpotBalancesGroup[];
  subaccount_healths: SubaccountHealthEntry[];
}): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of stats.spot_balances_by_subaccount) {
    m.set(g.subaccount.toLowerCase(), g.label);
  }
  for (const h of stats.subaccount_healths) {
    m.set(h.subaccount.toLowerCase(), h.subaccount_name);
  }
  return m;
}

export function tradeMatchesSubaccountFilter(
  t: TradeMatch,
  labelByHex: Map<string, string>,
  displayFilter: string,
): boolean {
  if (displayFilter === SUBACCOUNT_FILTER_ALL) return true;
  const hex = t.subaccount?.toLowerCase();
  if (!hex) return false;
  return labelByHex.get(hex) === displayFilter;
}
