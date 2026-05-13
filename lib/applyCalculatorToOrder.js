/**
 * Pure helper that translates a Calculator "Apply" payload into the discrete
 * pieces of order-form state that the form already tracks separately
 * (shipping, custom line, tax %, discount display, manual subtotal override).
 *
 * Why this exists as its own module
 * ─────────────────────────────────
 * The Calculator computes a single rolled-up `final` number for display in
 * its panel:
 *
 *   final = (subtotal − discount) + delivery + custom + (extra % of base)
 *
 * The OrderForm, on the other hand, keeps each contribution as its own piece
 * of state — `shippingAmount`, `customLineAmount`, `taxPercent`,
 * `discountDisplay`, etc. — and recomputes `grandTotal` from those parts:
 *
 *   grandTotal = afterDiscount(subtotal) + shipping + custom + vitrine + tax
 *
 * The previous implementation of `handleApplyFromCalc` set
 * `finalTotalOverride = calc.final` whenever there were any extras, which
 * effectively shoved the rolled-up number back into `subtotal` AND kept the
 * extras as separate line items, so the final grandTotal double-counted
 * every adjustment.
 *
 * Concretely: subtotal 2270 + custom 45 produced a grandTotal of 2360
 * instead of 2315 (the +45 was added once into the override and a second
 * time as the custom line). Shipping double-counted the same way, and
 * extra% was triple-counted because it folded into the override and then
 * the override got multiplied by `(1 + taxPercent)` again.
 *
 * The fix is simple: when applying from the calculator, never set
 * `finalTotalOverride` from `calc.final`. Line items are stored
 * independently and added back at grandTotal time. `finalTotalOverride` is
 * reserved exclusively for the case where the user types a number directly
 * into the "Final Total (EUR)" cell on the order form.
 */

import { formatDiscountDisplay } from './orderTotals'

/**
 * @typedef {object} CalcInput
 * @property {number} [subtotal] - Calculator's view of the row subtotal.
 * @property {number} [totalDiscount] - Sum of percent + flat discounts (in €).
 * @property {number|string} [discountPct] - Percent discount entered by the user.
 * @property {number|string} [discountFlat] - Flat discount entered by the user.
 * @property {number} [finalTotal] - Calculator's rolled-up final total.
 * @property {number} [delivery] - Delivery / shipping cost.
 * @property {string} [customLabel] - Custom line label (free text).
 * @property {number} [customAmount] - Custom adjustment amount (signed).
 * @property {number} [extraPercent] - Extra %  to apply (e.g. VAT).
 * @property {string} [extraPercentLabel] - Label for the extra % (e.g. "VAT").
 *
 * @typedef {object} CalcPatch
 * @property {number|null} shippingAmount
 * @property {string} customLineLabel
 * @property {number|null} customLineAmount
 * @property {number|null} taxPercent
 * @property {string|null} taxLabel - undefined when taxPercent stays untouched.
 * @property {string} discountDisplay - "" or "X%" or "€Y".
 * @property {number|null} finalTotalOverride - always null when applying from calc.
 */

/**
 * Convert a calculator payload into the patch the OrderForm should apply
 * to its state. Pure — no side effects — so it can be unit-tested.
 *
 * @param {CalcInput} input
 * @returns {CalcPatch}
 */
export function applyCalculatorToOrder(input = {}) {
  const {
    totalDiscount = 0,
    discountPct,
    discountFlat,
    delivery = 0,
    customLabel = '',
    customAmount,
    extraPercent = 0,
    extraPercentLabel = 'VAT',
  } = input

  const shippingAmount = delivery > 0 ? delivery : null
  const ca = Number(customAmount)
  const customLineAmount = !Number.isNaN(ca) && ca !== 0 ? ca : null

  let taxPercent
  let taxLabel
  if (extraPercent > 0) {
    taxPercent = extraPercent
    taxLabel = extraPercentLabel || 'VAT'
  } else {
    taxPercent = null
    taxLabel = null
  }

  const discountDisplay =
    totalDiscount > 0
      ? formatDiscountDisplay({ discountPct, discountFlat, totalDiscount })
      : ''

  // Critical: applying the calculator must never produce a manual subtotal
  // override. The calculator's `final` is just a display roll-up — the
  // OrderForm rebuilds it from independent line items, so reusing it as
  // an override would double-count every adjustment (see module docstring).
  const finalTotalOverride = null

  return {
    shippingAmount,
    customLineLabel: customLabel || '',
    customLineAmount,
    taxPercent,
    taxLabel,
    discountDisplay,
    finalTotalOverride,
  }
}
