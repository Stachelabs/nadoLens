import type { Position, TradeMatch } from "@/types/nado";
import { fromX18BigInt } from "@/types/nado";

const WAD = BigInt(10) ** BigInt(18);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const N_ONE = BigInt(-1);
/** ~1e-6 BTC tolerance in x18 base units for replay vs Gateway amount. */
const AMOUNT_TOL = BigInt(1_000_000_000_000);

function absB(n: bigint): bigint {
  return n < ZERO ? -n : n;
}

function signB(n: bigint): bigint {
  if (n > ZERO) return ONE;
  if (n < ZERO) return N_ONE;
  return ZERO;
}

/**
 * Replay perp fills (oldest first) with average-cost accounting to get VWAP entry price.
 * Matches how exchange UIs label "avg entry" (fill-weighted), unlike `-v_quote/amount` from
 * Gateway which mixes fees / funding / settlements into `v_quote_balance`.
 */
export function replayPerpAvgEntryX18(
  trades: TradeMatch[],
  productId: number,
): { amountX18: bigint; avgEntryX18: bigint } | null {
  const relevant = trades
    .filter((t) => t.is_perp && t.product_id === productId)
    .sort((a, b) => {
      try {
        const ai = BigInt(a.submission_idx);
        const bi = BigInt(b.submission_idx);
        if (ai < bi) return -1;
        if (ai > bi) return 1;
        return (a.digest ?? "").localeCompare(b.digest ?? "");
      } catch {
        return 0;
      }
    });

  if (relevant.length === 0) return null;

  let q = ZERO;
  let avgX18 = ZERO;

  for (const t of relevant) {
    let dq: bigint;
    let px: bigint;
    try {
      dq = BigInt(t.amount);
      px = BigInt(t.price);
    } catch {
      continue;
    }
    if (dq === ZERO) continue;

    if (q === ZERO) {
      q = dq;
      avgX18 = px;
      continue;
    }

    const sq = signB(q);
    const sdq = signB(dq);

    if (sq === sdq) {
      const newQ = q + dq;
      if (newQ === ZERO) {
        q = ZERO;
        avgX18 = ZERO;
        continue;
      }
      const absNewQ = absB(newQ);
      const numerator = absB(q) * avgX18 + absB(dq) * px;
      avgX18 = numerator / absNewQ;
      q = newQ;
      continue;
    }

    const absq = absB(q);
    const absdq = absB(dq);

    if (absdq < absq) {
      q = q + dq;
      continue;
    }

    if (absdq === absq) {
      q = ZERO;
      avgX18 = ZERO;
      continue;
    }

    q = q + dq;
    avgX18 = px;
  }

  if (q === ZERO) return null;
  return { amountX18: q, avgEntryX18: avgX18 };
}

/**
 * VWAP avg entry (USD) from matches when replayed position size matches Gateway `amount_x18`.
 */
export function perpAvgEntryUsdFromMatches(
  trades: TradeMatch[],
  productId: number,
  targetAmountX18: string,
): number | null {
  let target: bigint;
  try {
    target = BigInt(targetAmountX18);
  } catch {
    return null;
  }
  const replay = replayPerpAvgEntryX18(trades, productId);
  if (!replay) return null;
  const { amountX18, avgEntryX18 } = replay;
  const diff = amountX18 - target;
  if (absB(diff) > AMOUNT_TOL) return null;
  const usd = fromX18BigInt(avgEntryX18.toString());
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return usd;
}

/** Prefer fill VWAP (Nado UI); fall back to balance-implied entry already on `Position`. */
export function mergePositionsWithVwapEntry(
  positions: Position[],
  trades: TradeMatch[],
): Position[] {
  if (trades.length === 0) return positions;
  return positions.map((p) => {
    const vwap = perpAvgEntryUsdFromMatches(
      trades,
      p.product_id,
      p.amount_x18,
    );
    if (vwap !== null) {
      return { ...p, entry_price: vwap };
    }
    return p;
  });
}
