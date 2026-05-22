import { describe, expect, it } from 'vitest'
import type { TradeMatch } from '@/types/nado'
import { computeTradeMetrics, isClosingTrade, mergePnl } from './performance'

const WAD = BigInt(10) ** BigInt(18)

function perpClose(
  idx: string,
  timestampSec: number,
  realizedPnlUsd: number,
  feeUsd: number,
  quoteFilledUsd: number,
): TradeMatch {
  return {
    submission_idx: idx,
    timestamp: String(BigInt(timestampSec) * BigInt(1_000_000_000)),
    product_id: 2,
    pair: 'BTC-PERP',
    amount: (-BigInt(1) * WAD).toString(),
    price: (BigInt(67575) * WAD).toString(),
    quote_filled: (BigInt(Math.trunc(quoteFilledUsd * 1e18)) * BigInt(-1)).toString(),
    realized_pnl: (BigInt(Math.trunc(realizedPnlUsd * 1e18))).toString(),
    closed_amount: (-BigInt(1) * WAD).toString(), // non-zero → closing
    fee: (BigInt(Math.trunc(feeUsd * 1e18))).toString(),
    sequencer_fee: '0',
    side: 'short',
    is_perp: true,
  }
}

function perpOpen(idx: string, timestampSec: number, feeUsd: number, quoteFilledUsd: number): TradeMatch {
  return {
    submission_idx: idx,
    timestamp: String(BigInt(timestampSec) * BigInt(1_000_000_000)),
    product_id: 2,
    pair: 'BTC-PERP',
    amount: (BigInt(1) * WAD).toString(),
    price: (BigInt(67575) * WAD).toString(),
    quote_filled: (BigInt(Math.trunc(quoteFilledUsd * 1e18)) * BigInt(-1)).toString(),
    realized_pnl: '0',
    closed_amount: '0', // zero → opening fill
    fee: (BigInt(Math.trunc(feeUsd * 1e18))).toString(),
    sequencer_fee: '0',
    side: 'long',
    is_perp: true,
  }
}

function spotTrade(idx: string, timestampSec: number, feeUsd: number, quoteFilledUsd: number): TradeMatch {
  return {
    submission_idx: idx,
    timestamp: String(BigInt(timestampSec) * BigInt(1_000_000_000)),
    product_id: 1,
    pair: 'KBTC',
    amount: (BigInt(1) * WAD).toString(),
    price: (BigInt(67575) * WAD).toString(),
    quote_filled: (BigInt(Math.trunc(quoteFilledUsd * 1e18))).toString(),
    realized_pnl: '0',
    closed_amount: '0',
    fee: (BigInt(Math.trunc(feeUsd * 1e18))).toString(),
    sequencer_fee: '0',
    side: 'long',
    is_perp: false,
  }
}

// ─── isClosingTrade ──────────────────────────────────────────────────────────

describe('isClosingTrade', () => {
  it('returns false for opening fill (closed_amount = "0")', () => {
    expect(isClosingTrade(perpOpen('1', 1000, 5, 1000))).toBe(false)
  })

  it('returns true for closing fill (closed_amount != "0")', () => {
    expect(isClosingTrade(perpClose('1', 1000, 100, 5, 1000))).toBe(true)
  })

  it('returns false for malformed closed_amount', () => {
    const bad: TradeMatch = { ...perpOpen('1', 1000, 5, 1000), closed_amount: 'not-a-number' }
    expect(isClosingTrade(bad)).toBe(false)
  })
})

// ─── computeTradeMetrics ─────────────────────────────────────────────────────

describe('computeTradeMetrics', () => {
  it('returns all zeros for empty trades without NaN', () => {
    const m = computeTradeMetrics([])
    expect(m.win_rate).toBe(0)
    expect(m.trading_pnl_usd).toBe(0)
    expect(m.total_fees_usd).toBe(0)
    expect(m.perp_volume_usd).toBe(0)
    expect(m.spot_volume_usd).toBe(0)
    expect(m.perp_trades_count).toBe(0)
    expect(m.spot_trades_count).toBe(0)
    expect(m.first_trade_at).toBeNull()
    expect(m.last_trade_at).toBeNull()
    // Guard: no NaN anywhere
    for (const v of Object.values(m)) {
      if (typeof v === 'number') expect(v).not.toBeNaN()
    }
  })

  it('win_rate is 0 (not NaN) when no closing perp trades', () => {
    const trades = [perpOpen('1', 1_000_000, 5, 1000), perpOpen('2', 1_000_001, 5, 1000)]
    const m = computeTradeMetrics(trades)
    expect(m.win_rate).toBe(0)
    expect(m.trading_pnl_usd).toBe(0)
    expect(m.perp_trades_count).toBe(2)
  })

  it('win_rate = 50 for 1 win + 1 loss closing trades', () => {
    const trades = [
      perpClose('1', 1_000_000, 100, 5, 1000),  // win +100
      perpClose('2', 1_000_001, -50, 5, 1000),   // loss -50
    ]
    const m = computeTradeMetrics(trades)
    expect(m.win_rate).toBe(50)
    expect(m.trading_pnl_usd).toBeCloseTo(50, 5)
    expect(m.total_fees_usd).toBeCloseTo(10, 5)
  })

  it('spot-only: perp_volume = 0, spot_volume > 0, win_rate = 0', () => {
    const trades = [spotTrade('1', 1_000_000, 2, 500), spotTrade('2', 1_000_001, 2, 500)]
    const m = computeTradeMetrics(trades)
    expect(m.perp_volume_usd).toBe(0)
    expect(m.spot_volume_usd).toBeGreaterThan(0)
    expect(m.perp_trades_count).toBe(0)
    expect(m.spot_trades_count).toBe(2)
    expect(m.win_rate).toBe(0)
  })

  it('mixed spot + perp: volumes and counts separated', () => {
    const trades = [
      perpClose('1', 1_000_000, 100, 5, 1000),
      spotTrade('2', 1_000_001, 2, 500),
    ]
    const m = computeTradeMetrics(trades)
    expect(m.perp_trades_count).toBe(1)
    expect(m.spot_trades_count).toBe(1)
    expect(m.perp_volume_usd).toBeCloseTo(1000, 2)
    expect(m.spot_volume_usd).toBeCloseTo(500, 2)
  })

  it('first/last trade resolved by submission_idx, not array order', () => {
    // Array order: idx 3, 1, 2 — first should be idx 1, last idx 3
    const trades = [
      perpClose('3', 1_000_002, 10, 1, 100),
      perpClose('1', 1_000_000, 10, 1, 100),
      perpClose('2', 1_000_001, 10, 1, 100),
    ]
    const m = computeTradeMetrics(trades)
    // first_trade_at should correspond to submission_idx "1" (timestamp 1_000_000s)
    expect(m.first_trade_at).toBe(String(BigInt(1_000_000) * BigInt(1_000_000_000)))
    expect(m.last_trade_at).toBe(String(BigInt(1_000_002) * BigInt(1_000_000_000)))
  })
})

// ─── aggregated win rate ─────────────────────────────────────────────────────

describe('computeTradeMetrics — aggregated win rate', () => {
  it('1 order with 5 winning fills (same digest) = 100% win rate, not 5/5 per fill', () => {
    const trades = Array.from({ length: 5 }, (_, i) => ({
      ...perpClose(String(i + 1), 1_000_000 + i, 20, 1, 200),
      digest: '0xorder1',
    }))
    const m = computeTradeMetrics(trades)
    expect(m.win_rate).toBe(100)
  })

  it('1 winning order (3 fills) + 1 losing order (2 fills) = 50%', () => {
    const wins = Array.from({ length: 3 }, (_, i) => ({
      ...perpClose(String(i + 1), 1_000_000 + i, 30, 1, 300),
      digest: '0xwin',
    }))
    const losses = Array.from({ length: 2 }, (_, i) => ({
      ...perpClose(String(i + 10), 1_000_010 + i, -20, 1, 200),
      digest: '0xloss',
    }))
    const m = computeTradeMetrics([...wins, ...losses])
    expect(m.win_rate).toBe(50)
  })

  it('fills without digest count individually (legacy fallback)', () => {
    const trades = [
      perpClose('1', 1_000_000, 100, 5, 1000),  // win, no digest
      perpClose('2', 1_000_001, -50, 5, 1000),   // loss, no digest
    ]
    const m = computeTradeMetrics(trades)
    expect(m.win_rate).toBe(50)
  })

  it('net-positive aggregated order with mixed individual fills = 1 win', () => {
    const trades = [
      { ...perpClose('1', 1_000_000, 200, 1, 500), digest: '0xmixed' },
      { ...perpClose('2', 1_000_001, -50, 1, 500), digest: '0xmixed' },
    ]
    const m = computeTradeMetrics(trades)
    // Sum = 200 + (-50) = 150 > 0 → 1 win out of 1 order
    expect(m.win_rate).toBe(100)
  })

  it('trade counts still use individual fills, not aggregated orders', () => {
    const trades = Array.from({ length: 5 }, (_, i) => ({
      ...perpClose(String(i + 1), 1_000_000 + i, 20, 1, 200),
      digest: '0xorder1',
    }))
    const m = computeTradeMetrics(trades)
    expect(m.perp_trades_count).toBe(5)
  })
})

// ─── best_trade / worst_trade ────────────────────────────────────────────────

function perpCloseWith(
  idx: string,
  timestampSec: number,
  realizedPnlUsd: number,
  overrides: Partial<TradeMatch> = {},
): TradeMatch {
  return {
    ...perpClose(idx, timestampSec, realizedPnlUsd, 1, 500),
    ...overrides,
  }
}

describe('computeTradeMetrics — best_trade / worst_trade', () => {
  it('returns null for both when no closing trades', () => {
    const trades = [perpOpen('1', 1_000_000, 5, 1000)]
    const m = computeTradeMetrics(trades)
    expect(m.best_trade).toBeNull()
    expect(m.worst_trade).toBeNull()
  })

  it('returns null for both when empty', () => {
    const m = computeTradeMetrics([])
    expect(m.best_trade).toBeNull()
    expect(m.worst_trade).toBeNull()
  })

  it('single closing trade → both point to same order', () => {
    const trades = [perpCloseWith('1', 1_000_000, 50, { pair: 'ETH-PERP', side: 'long' })]
    const m = computeTradeMetrics(trades)
    expect(m.best_trade).not.toBeNull()
    expect(m.worst_trade).not.toBeNull()
    expect(m.best_trade!.pnl).toBeCloseTo(50, 2)
    expect(m.worst_trade!.pnl).toBeCloseTo(50, 2)
    expect(m.best_trade!.pair).toBe('ETH-PERP')
    expect(m.best_trade!.side).toBe('long')
  })

  it('picks highest pnl as best, lowest as worst', () => {
    const trades = [
      perpCloseWith('1', 1_000_000, 200, { pair: 'BTC-PERP' }),
      perpCloseWith('2', 1_000_001, -100, { pair: 'ETH-PERP' }),
      perpCloseWith('3', 1_000_002, 50, { pair: 'HYPE-PERP' }),
    ]
    const m = computeTradeMetrics(trades)
    expect(m.best_trade!.pnl).toBeCloseTo(200, 2)
    expect(m.best_trade!.pair).toBe('BTC-PERP')
    expect(m.worst_trade!.pnl).toBeCloseTo(-100, 2)
    expect(m.worst_trade!.pair).toBe('ETH-PERP')
  })

  it('multi-fill order uses aggregated pnl, not individual fills', () => {
    const trades = [
      perpCloseWith('1', 1_000_000, 80, { digest: '0xagg', pair: 'SOL-PERP' }),
      perpCloseWith('2', 1_000_001, 120, { digest: '0xagg', pair: 'SOL-PERP' }),
      perpCloseWith('3', 1_000_002, -50, { pair: 'ETH-PERP' }),
    ]
    const m = computeTradeMetrics(trades)
    // Aggregated: 0xagg = 80+120=200, no-digest ETH = -50
    expect(m.best_trade!.pnl).toBeCloseTo(200, 2)
    expect(m.best_trade!.pair).toBe('SOL-PERP')
    expect(m.worst_trade!.pnl).toBeCloseTo(-50, 2)
    expect(m.worst_trade!.pair).toBe('ETH-PERP')
  })

  it('includes closed_at as ISO string', () => {
    const trades = [perpCloseWith('1', 1_700_000_000, 100)]
    const m = computeTradeMetrics(trades)
    expect(m.best_trade!.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ─── mergePnl ────────────────────────────────────────────────────────────────

describe('mergePnl', () => {
  it('net_pnl = trading - fees + positive funding', () => {
    const trades = [perpClose('1', 1_000_000, 100, 10, 1000)]
    const metrics = computeTradeMetrics(trades)
    const merged = mergePnl(metrics, 25)
    expect(merged.funding_pnl_usd).toBe(25)
    expect(merged.net_pnl_usd).toBeCloseTo(100 - 10 + 25, 5)
  })

  it('net_pnl = trading - fees + negative funding (user paid out)', () => {
    const trades = [perpClose('1', 1_000_000, 100, 10, 1000)]
    const metrics = computeTradeMetrics(trades)
    const merged = mergePnl(metrics, -40)
    expect(merged.funding_pnl_usd).toBe(-40)
    expect(merged.net_pnl_usd).toBeCloseTo(100 - 10 - 40, 5)
  })
})
