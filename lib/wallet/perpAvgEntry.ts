import { fromX18BigInt } from "@/types/nado";

const WAD = BigInt(10) ** BigInt(18);
const ZERO = BigInt(0);

function absBig(n: bigint): bigint {
  return n < ZERO ? -n : n;
}

/**
 * Balance-implied average entry from raw x18 `amount` and `v_quote_balance`.
 * Nado: `v_quote_balance` is "negative of entry cost" (both scaled x18) but also
 * accumulates fees / funding / settlements — ratio can diverge from the UI "Avg entry"
 * (fill VWAP). Prefer `mergePositionsWithVwapEntry` + Archive matches when available.
 * Implied price = `-v_quote / amount` = `|v_quote| * 1e18 / |amount|` when signs oppose (open perp).
 * We use the magnitude form to match on-chain signed division without edge-case sign bugs.
 * Float `-v/a` loses precision on large x18 integers (collapses toward mark).
 */
export function perpAvgEntryUsdFromBalance(
  amountX18: string,
  vQuoteX18: string,
  fallbackUsd: number,
): number {
  try {
    const a = BigInt(amountX18);
    const v = BigInt(vQuoteX18);
    if (a === ZERO || v === ZERO) return fallbackUsd;
    // Normal open perp: amount and v_quote have opposite signs (product < 0).
    if (a * v >= ZERO) return fallbackUsd;

    const entryX18 = (absBig(v) * WAD) / absBig(a);
    const usd = fromX18BigInt(entryX18.toString());
    if (!Number.isFinite(usd) || usd <= 0) return fallbackUsd;
    return usd;
  } catch {
    return fallbackUsd;
  }
}
