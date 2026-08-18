import { describe, expect, it } from 'vitest'
import {
  estimateInterest,
  estimateMaturityInterest,
  parseRatePercent,
} from './format'

describe('parseRatePercent', () => {
  it('accepts dot and comma decimals', () => {
    expect(parseRatePercent('9.5')).toBe(9.5)
    expect(parseRatePercent('9,5')).toBe(9.5)
    expect(parseRatePercent('9,3')).toBe(9.3)
  })

  it('keeps trailing dot as whole number while typing', () => {
    expect(parseRatePercent('9.')).toBe(9)
  })

  it('does not glue 9 and 8 into 98 when comma is used', () => {
    // User intent "9,8" must not become 98
    expect(parseRatePercent('9,8')).toBe(9.8)
    expect(parseRatePercent('98')).toBe(98)
  })
})

describe('estimateInterest', () => {
  it('uses calendar days: 400tr × 9.3%/năm × 365/365', () => {
    const start = '2026-08-05T12:00:00.000Z'
    const end = '2027-08-05T12:00:00.000Z'
    const interest = estimateInterest(400_000_000, 9.3, start, end)
    // 400e6 * 0.093 * 365/365 = 37_200_000 (exact year may be 365 days)
    expect(Math.round(interest)).toBeGreaterThan(37_000_000)
    expect(Math.round(interest)).toBeLessThan(37_400_000)
  })

  it('same calendar day → 0 lãi tạm (không nhân theo giờ)', () => {
    // Dùng giờ local trưa cùng ngày — tránh lệch múi giờ UTC
    const day = new Date(2026, 7, 5, 8, 0, 0).toISOString()
    const later = new Date(2026, 7, 5, 20, 0, 0).toISOString()
    expect(estimateInterest(400_000_000, 9.3, day, later)).toBe(0)
  })

  it('1 full day', () => {
    const a = new Date(2026, 7, 5, 12, 0, 0).toISOString()
    const b = new Date(2026, 7, 6, 12, 0, 0).toISOString()
    const interest = estimateInterest(400_000_000, 9.3, a, b)
    // 400e6 * 0.093 / 365 ≈ 101_917.8
    expect(Math.round(interest)).toBe(101_918)
  })
})

describe('estimateMaturityInterest', () => {
  it('prefers maturity date over term months', () => {
    const start = '2026-08-05T12:00:00.000Z'
    const mat = '2027-08-05T12:00:00.000Z'
    const fromDate = estimateMaturityInterest(
      400_000_000,
      9.3,
      start,
      mat,
      6,
    )
    const fromMonths = estimateMaturityInterest(
      400_000_000,
      9.3,
      start,
      null,
      12,
    )
    expect(Math.round(fromDate)).toBeGreaterThan(37_000_000)
    expect(Math.round(fromMonths)).toBe(37_200_000) // 400e6 * 0.093 * 12/12
  })

  it('term months only when no maturity', () => {
    // 6 tháng: 400e6 * 0.093 * 6/12 = 18_600_000
    expect(
      Math.round(
        estimateMaturityInterest(
          400_000_000,
          9.3,
          '2026-08-05T12:00:00.000Z',
          null,
          6,
        ),
      ),
    ).toBe(18_600_000)
  })
})
