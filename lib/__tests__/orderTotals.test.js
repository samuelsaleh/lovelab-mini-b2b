/**
 * Unit tests for orderTotals helpers.
 *
 * These pin down the double-discount bug Sam reported (8 625 → 6 900 → 5 175):
 *   - `computeAfterDiscount` must accept "%" and "€" formats and clamp at 0.
 *   - `formatDiscountDisplay` must preserve percent intent when the user only
 *     used the percent field, so a later row change keeps the right
 *     percentage instead of a frozen flat amount.
 */

import { computeAfterDiscount, formatDiscountDisplay } from '../orderTotals'

describe('formatDiscountDisplay', () => {
  it('returns "" when nothing is set', () => {
    expect(formatDiscountDisplay()).toBe('')
    expect(formatDiscountDisplay({})).toBe('')
    expect(formatDiscountDisplay({ discountPct: 0, discountFlat: 0 })).toBe('')
  })

  it('encodes percent-only input as "X%"', () => {
    expect(formatDiscountDisplay({ discountPct: 20 })).toBe('20%')
    expect(formatDiscountDisplay({ discountPct: '12.5', discountFlat: '' })).toBe('12.5%')
  })

  it('encodes flat-only input as "€X"', () => {
    expect(formatDiscountDisplay({ discountFlat: 500 })).toBe('€500')
    expect(formatDiscountDisplay({ discountFlat: 12.345 })).toBe('€12.35')
  })

  it('falls back to flat when both percent and flat are entered', () => {
    // Both at once is an edge case; preserve the resolved euro amount so
    // the form still subtracts the right total. Percent intent is a nice
    // bonus, not a hard requirement here.
    expect(formatDiscountDisplay({ discountPct: 10, discountFlat: 50, totalDiscount: 250 }))
      .toBe('€250')
  })

  it('rounds the encoded amount to 2 decimals', () => {
    expect(formatDiscountDisplay({ discountFlat: 1725.456 })).toBe('€1725.46')
  })
})

describe('computeAfterDiscount', () => {
  it('returns null for an empty discount string', () => {
    expect(computeAfterDiscount(8625, '')).toBeNull()
    expect(computeAfterDiscount(8625, null)).toBeNull()
    expect(computeAfterDiscount(8625, undefined)).toBeNull()
  })

  it('handles percent format', () => {
    expect(computeAfterDiscount(8625, '20%')).toBe(6900)
    expect(computeAfterDiscount(1000, '10%')).toBe(900)
  })

  it('handles flat euro format with €', () => {
    expect(computeAfterDiscount(8625, '€1725')).toBe(6900)
  })

  it('handles legacy plain numeric flat format', () => {
    expect(computeAfterDiscount(8625, '1725')).toBe(6900)
  })

  it('clamps at 0 when the discount exceeds the base (no negative totals)', () => {
    // This one is critical: a runaway €5000 off €100 used to make
    // afterDiscount = -4900, which then poisoned commissions and Excel
    // exports. Now it stops at 0.
    expect(computeAfterDiscount(100, '€5000')).toBe(0)
    expect(computeAfterDiscount(100, '200%')).toBe(0)
  })

  it('returns null for zero / negative discount values', () => {
    expect(computeAfterDiscount(8625, '0%')).toBeNull()
    expect(computeAfterDiscount(8625, '-5%')).toBeNull()
    expect(computeAfterDiscount(8625, '€0')).toBeNull()
  })

  it('coerces non-string discountDisplay defensively', () => {
    expect(computeAfterDiscount(8625, 1725)).toBe(6900)
    expect(computeAfterDiscount(8625, { junk: true })).toBeNull()
  })

  it('regression: double-discount path is reproducible without the override fix', () => {
    // This documents the bug that motivated the fix:
    //   1. Calculator stores "€1725" for a 20%-of-8625 discount.
    //   2. User then types 6900 into the Bracelets subtotal field.
    //   3. afterDiscount(6900, "€1725") = 5175 (DOUBLED).
    //
    // The bug lived in the OrderForm coupling: the override input did not
    // clear the discount string. The math itself is correct — proven here.
    expect(computeAfterDiscount(8625, '€1725')).toBe(6900)
    expect(computeAfterDiscount(6900, '€1725')).toBe(5175) // would have been the bug
    // Once the override clears discountDisplay, computeAfterDiscount(6900, "")
    // returns null and the grand total stays at 6900.
    expect(computeAfterDiscount(6900, '')).toBeNull()
  })

  it('regression: percent intent survives row changes', () => {
    // Old behaviour: discount was frozen at €1725 even after rows changed.
    //   subtotal 8 625 → applied 20% → "€1725"
    //   user added a row → subtotal 10 000 → afterDiscount = 8 275 ❌
    // New behaviour: percent-only input is stored as "20%" and recomputes.
    expect(computeAfterDiscount(10000, '20%')).toBe(8000)
  })
})
