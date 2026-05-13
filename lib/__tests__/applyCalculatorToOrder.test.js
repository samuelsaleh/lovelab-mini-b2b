/**
 * Unit tests for `applyCalculatorToOrder` — the pure helper that translates
 * a Calculator "Apply" payload into discrete OrderForm state updates.
 *
 * The whole point of this module is to pin down the double-count bug Sam
 * reported on 2026-05-13 (subtotal 2270 + custom 45 was producing a
 * grandTotal of 2360 instead of 2315 because the calculator's rolled-up
 * `final` was being stored as a manual `finalTotalOverride` AND the line
 * items were also being added on top).
 *
 * Each test below mirrors the OrderForm's downstream `grandTotal`
 * computation:
 *
 *   const finalTotal       = patch.finalTotalOverride ?? subtotal
 *   const afterDiscount    = computeAfterDiscount(finalTotal, patch.discountDisplay)
 *   const base             = afterDiscount ?? finalTotal
 *   const beforeTax        = base + patch.shippingAmount + patch.customLineAmount + 0  // no vitrine
 *   const taxAmount        = patch.taxPercent > 0 ? beforeTax * patch.taxPercent / 100 : 0
 *   const grandTotal       = beforeTax + taxAmount
 *
 * …and asserts that `grandTotal` equals what the calculator's panel said
 * the user owed (`payload.finalTotal`). When those two diverge, money goes
 * missing or doubles up.
 */

import { applyCalculatorToOrder } from '../applyCalculatorToOrder'
import { computeAfterDiscount } from '../orderTotals'

/**
 * Mirror of OrderForm.jsx's grandTotal useMemo, but operating on a plain
 * subtotal + the patch returned by `applyCalculatorToOrder`. Used in every
 * test to confirm the two sides agree.
 */
function recomputeGrandTotal(subtotal, patch) {
  const finalTotal = patch.finalTotalOverride != null ? patch.finalTotalOverride : subtotal
  const afterDiscount = computeAfterDiscount(finalTotal, patch.discountDisplay)
  const base = afterDiscount != null ? afterDiscount : finalTotal
  const shipping = patch.shippingAmount || 0
  const custom = patch.customLineAmount || 0
  const beforeTax = base + shipping + custom // vitrine isn't part of calc
  const taxAmount = patch.taxPercent > 0 ? (beforeTax * patch.taxPercent) / 100 : 0
  return beforeTax + taxAmount
}

describe('applyCalculatorToOrder — line item splitting', () => {
  it('produces an empty patch when nothing is set', () => {
    const patch = applyCalculatorToOrder({})
    expect(patch).toEqual({
      shippingAmount: null,
      customLineLabel: '',
      customLineAmount: null,
      taxPercent: null,
      taxLabel: null,
      discountDisplay: '',
      finalTotalOverride: null,
    })
  })

  it('handles the classic +€45 custom adjustment without doubling it', () => {
    // Sam's repro: subtotal 2270, custom +45, no discount, no shipping,
    // no extra %. The calculator's final = 2315. Pre-fix this scenario
    // wrote 2315 into finalTotalOverride AND 45 into customLineAmount,
    // producing a grandTotal of 2360. The patch must keep the override
    // null so the line item is the only contribution above subtotal.
    const subtotal = 2270
    const patch = applyCalculatorToOrder({
      subtotal,
      totalDiscount: 0,
      finalTotal: 2315,
      delivery: 0,
      customLabel: 'Adjustment',
      customAmount: 45,
      extraPercent: 0,
    })
    expect(patch.finalTotalOverride).toBe(null)
    expect(patch.customLineAmount).toBe(45)
    expect(patch.customLineLabel).toBe('Adjustment')
    expect(patch.shippingAmount).toBe(null)
    expect(patch.taxPercent).toBe(null)
    expect(patch.discountDisplay).toBe('')

    expect(recomputeGrandTotal(subtotal, patch)).toBe(2315)
  })

  it('does not double-count delivery either', () => {
    const subtotal = 2270
    const patch = applyCalculatorToOrder({
      subtotal,
      totalDiscount: 0,
      finalTotal: 2280,
      delivery: 10,
      customLabel: '',
      customAmount: 0,
      extraPercent: 0,
    })
    expect(patch.shippingAmount).toBe(10)
    expect(patch.customLineAmount).toBe(null)
    expect(patch.finalTotalOverride).toBe(null)
    expect(recomputeGrandTotal(subtotal, patch)).toBe(2280)
  })

  it('does not triple-count an extra % (VAT) line', () => {
    // Pre-fix: finalTotalOverride = 2746.7 (= 2270 * 1.21), then beforeTax
    // = 2746.7, then *1.21 again → 3323.5. That's the triple-count bug.
    const subtotal = 2270
    const patch = applyCalculatorToOrder({
      subtotal,
      totalDiscount: 0,
      finalTotal: 2746.7,
      delivery: 0,
      customLabel: '',
      customAmount: 0,
      extraPercent: 21,
      extraPercentLabel: 'VAT',
    })
    expect(patch.taxPercent).toBe(21)
    expect(patch.taxLabel).toBe('VAT')
    expect(patch.finalTotalOverride).toBe(null)
    expect(recomputeGrandTotal(subtotal, patch)).toBeCloseTo(2746.7, 2)
  })

  it('combines delivery + custom + tax into the right grand total', () => {
    const subtotal = 1000
    // delivery 50, custom -100, extraPct 21
    // base = 1000, beforeTax = 1000 + 50 - 100 = 950, tax = 950 * 0.21 = 199.5
    // grandTotal = 1149.5
    const patch = applyCalculatorToOrder({
      subtotal,
      totalDiscount: 0,
      finalTotal: 1149.5,
      delivery: 50,
      customLabel: 'Refund',
      customAmount: -100,
      extraPercent: 21,
      extraPercentLabel: 'VAT',
    })
    expect(patch.shippingAmount).toBe(50)
    expect(patch.customLineAmount).toBe(-100)
    expect(patch.taxPercent).toBe(21)
    expect(patch.finalTotalOverride).toBe(null)
    expect(recomputeGrandTotal(subtotal, patch)).toBeCloseTo(1149.5, 2)
  })

  it('encodes a percent-only discount as "X%" so it survives row changes', () => {
    const subtotal = 2000
    // 20% off subtotal → 1600, no other extras
    const patch = applyCalculatorToOrder({
      subtotal,
      totalDiscount: 400,
      discountPct: 20,
      discountFlat: 0,
      finalTotal: 1600,
      delivery: 0,
      customAmount: 0,
      extraPercent: 0,
    })
    expect(patch.discountDisplay).toBe('20%')
    expect(patch.finalTotalOverride).toBe(null)
    expect(recomputeGrandTotal(subtotal, patch)).toBe(1600)
  })

  it('encodes a flat-only discount as "€X"', () => {
    const subtotal = 2000
    const patch = applyCalculatorToOrder({
      subtotal,
      totalDiscount: 250,
      discountPct: 0,
      discountFlat: 250,
      finalTotal: 1750,
      delivery: 0,
      customAmount: 0,
      extraPercent: 0,
    })
    expect(patch.discountDisplay).toBe('€250')
    expect(patch.finalTotalOverride).toBe(null)
    expect(recomputeGrandTotal(subtotal, patch)).toBe(1750)
  })

  it('combines a discount with shipping + custom + tax without compounding', () => {
    const subtotal = 2000
    // 10% off → 1800, delivery 50 → 1850, custom +25 → 1875,
    // VAT 21% on 1875 → 393.75, grand total 2268.75
    const patch = applyCalculatorToOrder({
      subtotal,
      totalDiscount: 200,
      discountPct: 10,
      discountFlat: 0,
      finalTotal: 2268.75,
      delivery: 50,
      customLabel: 'Engraving',
      customAmount: 25,
      extraPercent: 21,
      extraPercentLabel: 'VAT',
    })
    expect(patch.discountDisplay).toBe('10%')
    expect(patch.shippingAmount).toBe(50)
    expect(patch.customLineAmount).toBe(25)
    expect(patch.taxPercent).toBe(21)
    expect(patch.finalTotalOverride).toBe(null)
    expect(recomputeGrandTotal(subtotal, patch)).toBeCloseTo(2268.75, 2)
  })

  it('treats customAmount === 0 and === undefined the same (null)', () => {
    expect(applyCalculatorToOrder({ customAmount: 0 }).customLineAmount).toBe(null)
    expect(applyCalculatorToOrder({}).customLineAmount).toBe(null)
    expect(applyCalculatorToOrder({ customAmount: '' }).customLineAmount).toBe(null)
  })

  it('coerces a numeric string customAmount to a number', () => {
    expect(applyCalculatorToOrder({ customAmount: '45' }).customLineAmount).toBe(45)
    expect(applyCalculatorToOrder({ customAmount: '-12.5' }).customLineAmount).toBe(-12.5)
  })

  it('falls back to "VAT" when extraPercent is set without a label', () => {
    const patch = applyCalculatorToOrder({ extraPercent: 21 })
    expect(patch.taxPercent).toBe(21)
    expect(patch.taxLabel).toBe('VAT')
  })

  it('keeps the user-supplied tax label when provided', () => {
    const patch = applyCalculatorToOrder({ extraPercent: 6, extraPercentLabel: 'TVA réduite' })
    expect(patch.taxLabel).toBe('TVA réduite')
  })

  it('treats extraPercent <= 0 as no tax', () => {
    expect(applyCalculatorToOrder({ extraPercent: 0 }).taxPercent).toBe(null)
    expect(applyCalculatorToOrder({ extraPercent: -5 }).taxPercent).toBe(null)
  })
})
