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
