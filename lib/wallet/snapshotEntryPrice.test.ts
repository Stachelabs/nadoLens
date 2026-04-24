import { describe, it, expect } from 'vitest'
import type { Position } from '@/types/nado'
import { buildEntryPriceMap, applySnapshotEntryPrices } from './snapshotEntryPrice'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CROSS_PARENT = '0xc5a752a4b8d751859d29af9069486b5b48fa949964656661756c745f31000000'
const ISOLATED_POCKET = '0xc5a752a4b8d751859d29af9069486b5b48fa9499000000000000005a0069736f'

/** Snapshot event builder — mirrors actual Archive account_snapshots response shape */
function makeEvent(
  product_id: number,
  isolated: boolean,
  amount: string,         // x18 position size (negative = short)
  net_entry_unrealized: string, // x18 cost basis
) {
  return {
    product_id,
    isolated,
    post_balance: { perp: { balance: { amount } } },
    net_entry_unrealized,
  }
}

/** Minimal Position builder */
function makePos(overrides: Partial<Position> & { product_id: number; subaccount: string; isolated: boolean }): Position {
  return {
    pair: 'BTC-PERP',
    amount_x18: '300000000000000',
    amount: 0.0003,
    entry_price: null,
    funding_cumulative: null,
    fees_cumulative: null,
    realized_pnl_cumulative: null,
    mark_price: 68000,
    unrealized_pnl: 0,
    liquidation_price: 0,
    margin_used: 0,
    maint_weight: 0.99,
    ...overrides,
  }
}

// ─── buildEntryPriceMap ───────────────────────────────────────────────────────

describe('buildEntryPriceMap', () => {
  it('computes BTC cross entry price from live snapshot values', () => {
    // Live data: cross BTC long, 0.0003 BTC, net_entry = 20.571... USDT0
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '1775172853': [makeEvent(2, false, '300000000000000', '20571483333333333333')],
      },
    })
    const entry = map.get(`${CROSS_PARENT.toLowerCase()}:2:false`)
    expect(entry).toBeDefined()
    expect(entry!.entryPrice).toBeCloseTo(68571.61, 1)
  })

  it('computes ETH cross short entry price (negative amount, negative net_entry)', () => {
    // Live data: cross ETH short, -0.01 ETH, net_entry = -21.137... USDT0
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '1775172853': [makeEvent(4, false, '-10000000000000000', '-21137333333333333333')],
      },
    })
    const entry = map.get(`${CROSS_PARENT.toLowerCase()}:4:false`)
    expect(entry).toBeDefined()
    expect(entry!.entryPrice).toBeCloseTo(2113.73, 1)
  })

  it('computes BTC isolated entry price', () => {
    // Live data: isolated BTC long, 0.0001 BTC, net_entry = 6.6972 USDT0
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '1775172853': [makeEvent(2, true, '100000000000000', '6697200000000000000')],
      },
    })
    const entry = map.get(`${CROSS_PARENT.toLowerCase()}:2:true`)
    expect(entry).toBeDefined()
    expect(entry!.entryPrice).toBeCloseTo(66972, 0)
  })

  it('computes WTI isolated short entry price', () => {
    // Live data: isolated WTI short, -0.1 WTI, net_entry = -10.1615 USDT0
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '1775172853': [makeEvent(90, true, '-100000000000000000', '-10161494444444444444')],
      },
    })
    const entry = map.get(`${CROSS_PARENT.toLowerCase()}:90:true`)
    expect(entry).toBeDefined()
    expect(entry!.entryPrice).toBeCloseTo(101.615, 2)
  })

  it('returns empty map for empty snapshots', () => {
    const map = buildEntryPriceMap({})
    expect(map.size).toBe(0)
  })

  it('returns empty map when snapshots have no events', () => {
    const map = buildEntryPriceMap({ [CROSS_PARENT]: { '123': [] } })
    expect(map.size).toBe(0)
  })

  it('ignores spot events (no perp post_balance)', () => {
    // Spot event: post_balance.perp is absent
    const spotEvent = {
      product_id: 0,
      isolated: false,
      post_balance: { spot: { balance: { amount: '1000000000000000000' } } },
      net_entry_unrealized: '1000000000000000000',
    }
    // @ts-expect-error — testing with spot shape
    const map = buildEntryPriceMap({ [CROSS_PARENT]: { '123': [spotEvent] } })
    expect(map.size).toBe(0)
  })

  it('ignores events where amount is zero', () => {
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '123': [makeEvent(2, false, '0', '20571483333333333333')],
      },
    })
    expect(map.size).toBe(0)
  })

  it('normalizes subaccount key to lowercase', () => {
    const UPPER = CROSS_PARENT.toUpperCase()
    const map = buildEntryPriceMap({
      [UPPER]: {
        '123': [makeEvent(2, false, '300000000000000', '20571483333333333333')],
      },
    })
    // Key must be lowercase regardless of input casing
    expect(map.has(`${CROSS_PARENT.toLowerCase()}:2:false`)).toBe(true)
  })
})

// ─── applySnapshotEntryPrices ─────────────────────────────────────────────────

describe('applySnapshotEntryPrices', () => {
  it('overrides entry_price for cross position', () => {
    const positions = [
      makePos({ product_id: 2, subaccount: CROSS_PARENT, isolated: false }),
    ]
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '123': [makeEvent(2, false, '300000000000000', '20571483333333333333')],
      },
    })
    const result = applySnapshotEntryPrices(positions, map)
    expect(result[0]!.entry_price).toBeCloseTo(68571.61, 1)
  })

  it('overrides entry_price for isolated position using parent_subaccount', () => {
    const positions = [
      makePos({
        product_id: 2,
        subaccount: ISOLATED_POCKET,
        isolated: true,
        parent_subaccount: CROSS_PARENT,
      }),
    ]
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '123': [makeEvent(2, true, '100000000000000', '6697200000000000000')],
      },
    })
    const result = applySnapshotEntryPrices(positions, map)
    expect(result[0]!.entry_price).toBeCloseTo(66972, 0)
  })

  it('leaves entry_price as null when map has no entry for position', () => {
    const positions = [
      makePos({ product_id: 2, subaccount: CROSS_PARENT, isolated: false }),
    ]
    const result = applySnapshotEntryPrices(positions, new Map())
    expect(result[0]!.entry_price).toBeNull()
  })

  it('leaves entry_price as null for unknown product in non-empty map', () => {
    const positions = [
      // ETH position, but map only has BTC
      makePos({ product_id: 4, subaccount: CROSS_PARENT, isolated: false }),
    ]
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '123': [makeEvent(2, false, '300000000000000', '20571483333333333333')],
      },
    })
    const result = applySnapshotEntryPrices(positions, map)
    expect(result[0]!.entry_price).toBeNull()
  })

  it('returns positions unchanged when map is empty', () => {
    const positions = [
      makePos({ product_id: 2, subaccount: CROSS_PARENT, isolated: false, entry_price: null }),
    ]
    const result = applySnapshotEntryPrices(positions, new Map())
    expect(result).toEqual(positions)
  })

  // ── unrealized_pnl correctness ───────────────────────────────────────────

  it('computes pure unrealized_pnl ignoring Gateway p.unrealized_pnl', () => {
    // amount=2, oracle=3000, net_entry_unrealized=5600 → correctedPnl = 400
    // p.unrealized_pnl (Gateway) = 1200 (inflated by realized from partial close)
    // Correct answer: 400, NOT 1200
    const netEntryX18 = '5600000000000000000000'  // 5600 × 10^18
    const amountX18   = '2000000000000000000'     // 2 × 10^18
    const avgEntry    = 2800  // 5600 / 2

    const positions = [
      makePos({
        product_id: 99,
        subaccount: CROSS_PARENT,
        isolated: false,
        amount: 2,
        mark_price: 3000,
        unrealized_pnl: 1200, // Gateway's inflated value — must NOT be used
      }),
    ]
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '123': [makeEvent(99, false, amountX18, netEntryX18)],
      },
    })
    const result = applySnapshotEntryPrices(positions, map)
    expect(result[0]!.entry_price).toBeCloseTo(avgEntry, 4)
    expect(result[0]!.unrealized_pnl).toBeCloseTo(400, 4)
  })

  it('computes correct unrealized_pnl for a short position', () => {
    // Short: amount=-1, oracle=3000, avg_entry=3200 → PnL = (3000-3200)*(-1) = 200
    const netEntryX18 = '-3200000000000000000000'  // -3200 × 10^18
    const amountX18   = '-1000000000000000000'     // -1 × 10^18

    const positions = [
      makePos({
        product_id: 99,
        subaccount: CROSS_PARENT,
        isolated: false,
        amount: -1,
        mark_price: 3000,
        unrealized_pnl: -999, // Gateway's wrong value — must NOT be used
      }),
    ]
    const map = buildEntryPriceMap({
      [CROSS_PARENT]: { '123': [makeEvent(99, false, amountX18, netEntryX18)] },
    })
    const result = applySnapshotEntryPrices(positions, map)
    expect(result[0]!.unrealized_pnl).toBeCloseTo(200, 4)
  })

  it('does not mix cross and isolated for the same product_id', () => {
    const crossPos = makePos({ product_id: 2, subaccount: CROSS_PARENT, isolated: false })
    const isoPos = makePos({
      product_id: 2,
      subaccount: ISOLATED_POCKET,
      isolated: true,
      parent_subaccount: CROSS_PARENT,
    })

    const map = buildEntryPriceMap({
      [CROSS_PARENT]: {
        '123': [
          makeEvent(2, false, '300000000000000', '20571483333333333333'), // cross: 68571
          makeEvent(2, true, '100000000000000', '6697200000000000000'),   // isolated: 66972
        ],
      },
    })

    const result = applySnapshotEntryPrices([crossPos, isoPos], map)
    expect(result[0]!.entry_price).toBeCloseTo(68571.61, 1) // cross
    expect(result[1]!.entry_price).toBeCloseTo(66972, 0)    // isolated
  })
})
