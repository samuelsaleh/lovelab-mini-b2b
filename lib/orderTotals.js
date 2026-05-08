// Pure helpers for order discount math.
//
// History: the OrderForm used to inline these computations and store every
// discount as a flat "€X" string. That had two consequences:
//   1. Editing the "Bracelets subtotal" override did not clear the discount,
//      so the same percent was deducted twice (8 625 → 6 900 → 5 175).
//   2. A "20% off" was frozen as €1725. If rows later changed, the absolute
//      € amount stayed the same instead of recomputing from the new subtotal.
//
// These helpers fix both: percent intent is preserved when the user only
// fills the % field, and `computeAfterDiscount` clamps at 0 so a runaway
// discount cannot push commissions / reports negative.

/**
 * Encode the calculator's discount inputs into the single string the
 * OrderForm persists (`discountDisplay`). Preserves "%" when the user
 * only used the percent field, otherwise falls back to a flat "€X".
 *
 * @param {{discountPct?: number|string, discountFlat?: number|string, totalDiscount?: number|string}} args
 * @returns {string} e.g. "20%", "€500", or ""
 */
export function formatDiscountDisplay({ discountPct, discountFlat, totalDiscount } = {}) {
  const pct = Number(discountPct) || 0
  const flat = Number(discountFlat) || 0
  const total = Number(totalDiscount) || (pct > 0 || flat > 0 ? null : 0)

  if (pct > 0 && flat <= 0) {
    return `${roundTo2(pct)}%`
  }
  if (total != null && total > 0) {
    return `€${roundTo2(total)}`
  }
  if (flat > 0) {
    return `€${roundTo2(flat)}`
  }
  return ''
}

/**
 * Compute the after-discount amount from a `discountDisplay` string.
 * Returns null when there is no discount (so callers can decide whether
 * to render the before/after breakdown). Always clamped at 0 to keep
 * downstream commissions and reports non-negative.
 *
 * Accepts:
 *   - "20%"  → percent of base
 *   - "€500" → flat euro off
 *   - "500"  → flat euro off (legacy)
 *   - ""     → no discount (returns null)
 *   - non-string → coerced via String()
 *
 * @param {number} base
 * @param {string|number|null|undefined} discountDisplay
 * @returns {number|null}
 */
export function computeAfterDiscount(base, discountDisplay) {
  const baseNum = Number(base) || 0
  const raw = String(discountDisplay ?? '').trim()
  if (!raw) return null

  if (raw.endsWith('%')) {
    const pct = parseFloat(raw) || 0
    if (pct <= 0) return null
    return Math.max(0, baseNum - (baseNum * pct) / 100)
  }

  const flat = parseFloat(raw.replace(/[€,\s]/g, '')) || 0
  if (flat <= 0) return null
  return Math.max(0, baseNum - flat)
}

function roundTo2(n) {
  return Math.round(n * 100) / 100
}
