import { describe, it, expect } from 'vitest'
import { ArchiveMatchSchema } from './nado'

describe('ArchiveMatchSchema', () => {
  const validMatch = {
    order: { priceX18: '100000000000000000000' },
    base_filled: '1000000000000000000',
    fee: '500000000000000',
    submission_idx: '12345',
    closed_amount: '0',
    realized_pnl: '0',
  }

  it('parses valid match with sequencer_fee', () => {
    const result = ArchiveMatchSchema.safeParse({
      ...validMatch,
      sequencer_fee: '100000000000000',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sequencer_fee).toBe('100000000000000')
    }
  })

  it('defaults sequencer_fee to "0" when missing', () => {
    const result = ArchiveMatchSchema.safeParse(validMatch)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sequencer_fee).toBe('0')
    }
  })

  it('parses quote_filled as optional', () => {
    const result = ArchiveMatchSchema.safeParse({
      ...validMatch,
      quote_filled: '-50000000000000000000',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quote_filled).toBe('-50000000000000000000')
    }
  })

  it('parses pre_balance with perp product_id', () => {
    const result = ArchiveMatchSchema.safeParse({
      ...validMatch,
      pre_balance: {
        base: {
          perp: {
            product_id: 90,
            balance: { amount: '1000000000000000000' },
          },
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pre_balance?.base?.perp?.product_id).toBe(90)
    }
  })
})
