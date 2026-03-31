import { describe, expect, it } from 'vitest'
import {
  filterTradesByPeriod,
  formatEquityPeriodLabel,
  getPeriodBoundsUtc,
  type EquityPeriod,
} from './equityPeriod'
import type { TradeMatch } from '@/types/nado'

function mockTrade(timestampSec: number, submissionIdx: string): TradeMatch {
  const z = '0'.repeat(77)
  return {
    submission_idx: submissionIdx,
    digest: `0x${submissionIdx.padStart(64, '0')}`,
    timestamp: String(timestampSec * 1_000_000_000),
    realized_pnl: `${z}0`,
    product_id: 1,
    pair: 'BTC-PERP',
    amount: `${z}0`,
    price: `${z}0`,
    closed_amount: `${z}0`,
    fee: `${z}0`,
    sequencer_fee: `${z}0`,
    side: 'long',
    is_perp: true,
  }
}

describe('equityPeriod rolling windows', () => {
  const fixed = Date.UTC(2026, 2, 30, 15, 0, 0, 0)
  const endSec = Math.floor(fixed / 1000)

  it('daily is last 24h', () => {
    const b = getPeriodBoundsUtc('24 Hours', fixed)!
    expect(b.startSec).toBe(endSec - 24 * 60 * 60)
    expect(b.endSec).toBe(endSec)
  })

  it('weekly is last 7 days', () => {
    const b = getPeriodBoundsUtc('7 Days', fixed)!
    expect(b.startSec).toBe(endSec - 7 * 24 * 60 * 60)
  })

  it('monthly is last 30 days', () => {
    const b = getPeriodBoundsUtc('30 Days', fixed)!
    expect(b.startSec).toBe(endSec - 30 * 24 * 60 * 60)
  })

  it('filterTradesByPeriod keeps only in-window trades', () => {
    const inside = mockTrade(endSec - 3600, '1')
    const before = mockTrade(endSec - (24 * 60 * 60 + 10), '2')
    const list = [before, inside]
    const daily = filterTradesByPeriod(list, '24 Hours', fixed)
    expect(daily).toHaveLength(1)
    expect(daily[0].submission_idx).toBe('1')
  })

  it('all returns all trades', () => {
    const list = [mockTrade(100, '1'), mockTrade(200, '2')]
    expect(filterTradesByPeriod(list, 'All time' as EquityPeriod)).toEqual(list)
  })

  it('labels match rolling wording', () => {
    expect(formatEquityPeriodLabel('24 Hours')).toBe('Last 24h')
    expect(formatEquityPeriodLabel('7 Days')).toBe('Last 7 days')
    expect(formatEquityPeriodLabel('30 Days')).toBe('Last 30 days')
    expect(formatEquityPeriodLabel('All time')).toBe('All time (since first trade)')
  })
})
