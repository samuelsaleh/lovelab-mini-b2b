/**
 * Unit tests for restoreOrderState.
 *
 * These pin down the silent-money bug where re-opening a saved order would
 * drop the delivery fee, VAT line, or custom line, and then re-saving would
 * persist the missing values back to the document.
 */

import { restoreOrderState } from '../restoreOrderState'

describe('restoreOrderState', () => {
  it('returns null shippingAmount when nothing is set', () => {
    expect(restoreOrderState({}).shippingAmount).toBeNull()
  })

  it('reads shipping from top-level metadata.shipping_amount when present', () => {
    const r = restoreOrderState({}, { shipping_amount: 50 })
    expect(r.shippingAmount).toBe(50)
  })

  it('reads shipping from formState.shippingAmount when top-level is absent', () => {
    const r = restoreOrderState({ shippingAmount: 30 })
    expect(r.shippingAmount).toBe(30)
  })

  it('falls back to legacy formState.deliveryCost', () => {
    const r = restoreOrderState({ deliveryCost: 25 })
    expect(r.shippingAmount).toBe(25)
  })

  it('prefers top-level metadata over formState when both are set', () => {
    const r = restoreOrderState({ shippingAmount: 30, deliveryCost: 25 }, { shipping_amount: 50 })
    expect(r.shippingAmount).toBe(50)
  })

  it('treats top-level shipping_amount === 0 as not set so formState can win', () => {
    // The save path always writes Number(shippingAmount) || 0 to top-level —
    // so a stored 0 should not override a populated formState.shippingAmount.
    const r = restoreOrderState({ shippingAmount: 30 }, { shipping_amount: 0 })
    expect(r.shippingAmount).toBe(30)
  })

  it('restores taxPercent and taxLabel', () => {
    const r = restoreOrderState({ taxPercent: 21, taxLabel: 'BTW' })
    expect(r.taxPercent).toBe(21)
    expect(r.taxLabel).toBe('BTW')
  })

  it('restores customLineLabel and customLineAmount', () => {
    const r = restoreOrderState({ customLineLabel: 'Engraving', customLineAmount: 15 })
    expect(r.customLineLabel).toBe('Engraving')
    expect(r.customLineAmount).toBe(15)
  })

  it('coerces a string vitrineQty to a non-negative number', () => {
    expect(restoreOrderState({ vitrineQty: '3' }).vitrineQty).toBe(3)
    expect(restoreOrderState({ vitrineQty: '-5' }).vitrineQty).toBe(0)
    expect(restoreOrderState({ vitrineQty: 'foo' }).vitrineQty).toBe(0)
  })

  it('coerces non-string discountDisplay so .trim() never crashes', () => {
    // The previous bug: a numeric discountDisplay made the consumer code
    // call .trim() on a number and explode. The restore now returns it as
    // a string, and the consumer additionally guards with String(... ?? '').
    expect(restoreOrderState({ discountDisplay: 10 }).discountDisplay).toBe('10')
    expect(restoreOrderState({ discountDisplay: '10%' }).discountDisplay).toBe('10%')
    expect(restoreOrderState({ discountDisplay: null }).discountDisplay).toBeNull()
  })

  it('survives a totally empty / null formState', () => {
    expect(() => restoreOrderState(null)).not.toThrow()
    const r = restoreOrderState(null)
    expect(r.shippingAmount).toBeNull()
    expect(r.taxPercent).toBeNull()
  })
})
