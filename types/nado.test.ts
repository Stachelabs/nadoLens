import { describe, it, expect } from 'vitest'
import { fromX18BigInt } from './nado'

describe('fromX18BigInt', () => {
  it('converts positive integer x18', () => {
    expect(fromX18BigInt('1000000000000000000')).toBe(1)
  })

  it('converts zero', () => {
    expect(fromX18BigInt('0')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(fromX18BigInt('')).toBe(0)
  })

  it('converts fractional x18 (0.5)', () => {
    expect(fromX18BigInt('500000000000000000')).toBeCloseTo(0.5)
  })

  it('converts large positive (1000 USD)', () => {
    expect(fromX18BigInt('1000000000000000000000')).toBe(1000)
  })

  it('converts negative x18 (-1.5)', () => {
    expect(fromX18BigInt('-1500000000000000000')).toBeCloseTo(-1.5)
  })

  it('converts negative fractional (-0.5)', () => {
    expect(fromX18BigInt('-500000000000000000')).toBeCloseTo(-0.5)
  })

  it('converts small negative (-0.001)', () => {
    expect(fromX18BigInt('-1000000000000000')).toBeCloseTo(-0.001)
  })

  it('handles very large value without precision loss', () => {
    // 123456.789 in x18 — parseFloat would lose last digits
    const x18 = '123456789000000000000000'
    expect(fromX18BigInt(x18)).toBeCloseTo(123456.789, 3)
  })

  it('falls back to parseFloat for invalid BigInt input', () => {
    // Scientific notation — not valid BigInt, falls back
    expect(fromX18BigInt('1.5e18')).toBeCloseTo(1.5)
  })
})
