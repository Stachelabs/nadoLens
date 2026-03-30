import type { TradeMatch } from "@/types/nado";
import { fromX18BigInt } from "@/types/nado";
import { nanoStringToMs } from "@/lib/wallet/nanoTime";

export type TradeMetrics = {
  win_rate: number;
  trading_pnl_usd: number;
  total_fees_usd: number;
  perp_volume_usd: number;
  spot_volume_usd: number;
  total_volume_usd: number;
  avg_trade_size_usd: number;
  perp_trades_count: number;
  spot_trades_count: number;
  first_trade_at: string | null;
  last_trade_at: string | null;
};

function isClosingTrade(trade: TradeMatch): boolean {
  try {
    return BigInt(trade.closed_amount) !== BigInt(0);
  } catch {
    return false;
  }
}

export function computeTradeMetrics(trades: TradeMatch[]): TradeMetrics {
  const perpTrades = trades.filter((trade) => trade.is_perp);
  const spotTrades = trades.filter((trade) => !trade.is_perp);
  const perpClosingTrades = perpTrades.filter(isClosingTrade);
  const winningTrades = perpClosingTrades.filter(
    (trade) => fromX18BigInt(trade.realized_pnl) > 0,
  );

  // PnL only from perp trades.
  const trading_pnl_usd = perpClosingTrades.reduce(
    (sum, trade) => sum + fromX18BigInt(trade.realized_pnl),
    0,
  );

  // Matches API: fee already includes trading + sequencer fees.
  const total_fees_usd = trades.reduce(
    (sum, trade) => sum + Math.abs(fromX18BigInt(trade.fee)),
    0,
  );

  // Exact notional from quote leg in x18.
  const perp_volume_usd = perpTrades.reduce((sum, trade) => {
    const quoteFilled = (trade.quote_filled ?? "0").toString();
    return sum + Math.abs(fromX18BigInt(quoteFilled));
  }, 0);
  const spot_volume_usd = spotTrades.reduce((sum, trade) => {
    const quoteFilled = (trade.quote_filled ?? "0").toString();
    return sum + Math.abs(fromX18BigInt(quoteFilled));
  }, 0);
  const total_volume_usd = perp_volume_usd + spot_volume_usd;

  const avg_trade_size_usd =
    trades.length > 0 ? total_volume_usd / trades.length : 0;

  const perp_trades_count = perpTrades.length;
  const spot_trades_count = spotTrades.length;

  // First / last trade times: use min/max submission_idx (not array ends — unstable with ties / partial loads).
  let first_trade_at: string | null = null;
  let last_trade_at: string | null = null;
  if (trades.length > 0) {
    let minIdx: bigint | null = null;
    let maxIdx: bigint | null = null;
    let minTrade: TradeMatch | null = null;
    let maxTrade: TradeMatch | null = null;
    for (const t of trades) {
      try {
        const idx = BigInt(t.submission_idx);
        if (minIdx === null || idx < minIdx) {
          minIdx = idx;
          minTrade = t;
        }
        if (maxIdx === null || idx > maxIdx) {
          maxIdx = idx;
          maxTrade = t;
        }
      } catch {
        /* skip malformed idx */
      }
    }
    const pickTs = (tr: TradeMatch | null): string | null => {
      if (!tr) return null;
      return nanoStringToMs(tr.timestamp) !== null ? tr.timestamp : null;
    };
    first_trade_at = pickTs(minTrade);
    last_trade_at = pickTs(maxTrade);
  }

  return {
    win_rate:
      perpClosingTrades.length > 0
        ? (winningTrades.length / perpClosingTrades.length) * 100
        : 0,
    trading_pnl_usd,
    total_fees_usd,
    perp_volume_usd,
    spot_volume_usd,
    total_volume_usd,
    avg_trade_size_usd,
    perp_trades_count,
    spot_trades_count,
    last_trade_at,
    first_trade_at,
  };
}

export function mergePnl(
  tradeMetrics: TradeMetrics,
  funding_pnl_usd: number,
): TradeMetrics & { funding_pnl_usd: number; net_pnl_usd: number } {
  return {
    ...tradeMetrics,
    funding_pnl_usd,
    net_pnl_usd:
      tradeMetrics.trading_pnl_usd - tradeMetrics.total_fees_usd + funding_pnl_usd,
  };
}
