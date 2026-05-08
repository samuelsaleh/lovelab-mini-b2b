/**
 * Pure helper that turns a saved formState (or draft formState) into a flat
 * object of values for the OrderForm to seed its useState hooks with.
 *
 * Why this exists: the previous restore logic in OrderForm.jsx was inlined
 * inside a useEffect and was hard to unit-test without mounting the entire
 * 2400-line component. By extracting the data transformation here, we can
 * pin down regressions like "re-opening an order silently dropped the
 * delivery fee" with a fast unit test.
 *
 * The OrderForm component still owns the actual state setters — this
 * helper only describes WHAT to restore, not HOW to apply it.
 */

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {object} formState - the saved metadata.formState payload (possibly
 *   from a saved document or a draft).
 * @param {object} [topLevel] - optional top-level metadata fields. Currently
 *   only `shipping_amount` is read; falls back to formState.shippingAmount /
 *   formState.deliveryCost otherwise (matching the cascade in
 *   `lib/commissionAttribution.js`).
 * @returns {object} a normalised set of values ready to feed into useState.
 */
export function restoreOrderState(formState, topLevel = {}) {
  const s = formState || {}

  // Shipping cascade: top-level metadata.shipping_amount wins (that's what
  // the backend uses for commissions), then formState.shippingAmount, then
  // the legacy formState.deliveryCost field.
  let shippingAmount = null
  if (topLevel.shipping_amount != null && topLevel.shipping_amount !== 0) {
    shippingAmount = num(topLevel.shipping_amount)
  } else if (s.shippingAmount != null) {
    shippingAmount = num(s.shippingAmount)
  } else if (s.deliveryCost != null) {
    shippingAmount = num(s.deliveryCost)
  }

  return {
    shippingAmount,
    taxPercent: s.taxPercent != null ? num(s.taxPercent) : null,
    taxLabel: typeof s.taxLabel === 'string' ? s.taxLabel : (s.taxLabel == null ? null : String(s.taxLabel)),
    customLineLabel: typeof s.customLineLabel === 'string' ? s.customLineLabel : (s.customLineLabel == null ? null : String(s.customLineLabel)),
    customLineAmount: s.customLineAmount != null ? num(s.customLineAmount) : null,
    vitrineQty: s.vitrineQty != null ? Math.max(0, Number(s.vitrineQty) || 0) : null,
    discountDisplay: s.discountDisplay != null ? String(s.discountDisplay) : null,
  }
}

export default restoreOrderState
