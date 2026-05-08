/**
 * Order row completeness validator + a couple of hardened helpers used in the
 * order grid. Lives outside `OrderForm.jsx` so the logic is pure, importable,
 * and unit-testable on its own.
 *
 * Two responsibilities:
 *
 *  1. `validateRow` / `validateOrder` — given the rows currently in the order
 *     grid, return which ones are incomplete and exactly which fields are
 *     missing. The Save button uses this as a hard gate.
 *
 *  2. `findCollection` and `splitHousing` — moved out of `OrderForm.jsx` and
 *     hardened against non-string input. Previously these threw a TypeError
 *     when an upstream payload contained a number / object instead of a
 *     string, which surfaced as a "lots of crashes" complaint.
 */

import { COLLECTIONS } from './catalog'

// Fields that must be filled for a row to be considered complete.
// Some fields are conditionally required based on the collection's catalog
// definition (e.g. shape only matters when the collection actually has a
// `shapes` list). Order matters for display: this is the order the missing
// fields are listed back to the user in the warning banner.
const ROW_FIELD_LABELS = {
  quantity: 'quantity',
  collection: 'collection',
  carat: 'carat',
  shape: 'shape',
  setting: 'setting',
  bpColor: 'bpColor',
  size: 'size',
  material: 'material',
  colorCord: 'colorCord',
  unitPrice: 'unitPrice',
}

const ALWAYS_REQUIRED = ['quantity', 'collection', 'carat', 'unitPrice']
// Order in which conditional fields are appended (matching the table column order).
const CONDITIONAL_REQUIRED_ORDER = ['shape', 'setting', 'bpColor', 'size', 'material', 'colorCord']

function isFieldFilled(value) {
  return String(value ?? '').trim() !== ''
}

function collectionHasSetting(collection) {
  if (!collection?.housing) return false
  return ['shapyShine', 'matchy', 'sparkleProng', 'multiThree'].includes(collection.housing)
}

function collectionRequiresShape(collection) {
  return Array.isArray(collection?.shapes) && collection.shapes.length > 0
}

function collectionRequiresBpColor(collection) {
  // sparkleProng renders bpColor as N/A in the table — skip it there too.
  return !!collection?.housing && collection.housing !== 'sparkleProng'
}

function collectionRequiresSize(collection) {
  return Array.isArray(collection?.sizes) && collection.sizes.length > 0
}

// `material` (cord type + thickness) is only a user-pickable field when the
// collection's cord is silk-based. For nylon / shine / etc. the order form
// just shows a read-only label derived from the catalog and the row's
// `material` field stays empty by design — requiring it would block every
// non-silk order on save, which is what the previous version of this
// validator did.
function collectionRequiresMaterial(collection) {
  return collection?.cord === 'silk' || collection?.cord === 'silkBraided'
}

// `colorCord` is only pickable when the collection actually has a cord
// palette to choose from (the form only renders the select when
// `collection.cord` is set).
function collectionRequiresColorCord(collection) {
  return !!collection?.cord
}

/**
 * Build the list of required fields for a given row + collection. Returns the
 * field keys in display order so the resulting banner reads naturally.
 */
export function getRequiredFieldsForRow(collection) {
  const required = [...ALWAYS_REQUIRED]
  // Insert conditional fields in their visual table order.
  for (const key of CONDITIONAL_REQUIRED_ORDER) {
    if (key === 'shape' && collectionRequiresShape(collection)) required.push(key)
    if (key === 'setting' && collectionHasSetting(collection)) required.push(key)
    if (key === 'bpColor' && collectionRequiresBpColor(collection)) required.push(key)
    if (key === 'size' && collectionRequiresSize(collection)) required.push(key)
    if (key === 'material' && collectionRequiresMaterial(collection)) required.push(key)
    if (key === 'colorCord' && collectionRequiresColorCord(collection)) required.push(key)
  }
  return required
}

/**
 * Check a single row. The collection is what `findCollection(row.collection)`
 * returns and may be null when the user hasn't picked a collection yet — in
 * which case we treat the row as missing the `collection` field only and
 * skip the collection-specific checks.
 */
export function validateRow(row, collection) {
  if (!row) return { ok: false, missing: ['row'] }

  // No collection picked yet → only the basic top-level requirements apply.
  if (!collection) {
    const missing = []
    for (const key of ALWAYS_REQUIRED) {
      if (!isFieldFilled(row[key])) missing.push(key)
    }
    return { ok: missing.length === 0, missing }
  }

  const required = getRequiredFieldsForRow(collection)
  const missing = required.filter((key) => !isFieldFilled(row[key]))
  return { ok: missing.length === 0, missing }
}

/**
 * Validate every row that the user actually filled (so empty trailing rows
 * don't produce noise). Empty rows — no field at all touched — are ignored.
 */
export function validateOrder(filledRows, findCollectionFn = findCollection) {
  const issues = []
  for (const row of filledRows || []) {
    const collection = findCollectionFn(row?.collection)
    const result = validateRow(row, collection)
    if (!result.ok) {
      issues.push({
        rowNo: row?.no || '',
        missing: result.missing,
      })
    }
  }
  return { ok: issues.length === 0, issues }
}

/**
 * Look up a catalog collection by user-typed product name. Hardened against
 * non-string input (numbers, objects, null) so a corrupted upstream payload
 * never crashes the form.
 */
export function findCollection(productName) {
  const raw = productName
  if (raw == null) return null
  const str = typeof raw === 'string' ? raw : String(raw)
  if (!str) return null
  const name = str.toUpperCase()
  return (
    COLLECTIONS.find(
      (c) => c.label.toUpperCase() === name || c.id.toUpperCase() === name,
    ) ||
    COLLECTIONS.find(
      (c) => name.includes(c.label.toUpperCase()) || name.includes(c.id.toUpperCase()),
    ) ||
    null
  )
}

/**
 * Decompose a stored housing string like "Bezel YGold" into setting + colour.
 * Hardened against non-string input.
 */
export function splitHousing(housing) {
  const str = housing == null ? '' : (typeof housing === 'string' ? housing : String(housing))
  if (!str) return { setting: '', color: '' }
  if (str.startsWith('Bezel ')) return { setting: 'Bezel', color: str.slice(6) }
  if (str.startsWith('Prong ')) return { setting: 'Prong', color: str.slice(6) }
  if (str === 'Prong') return { setting: 'Prong', color: '' }
  return { setting: '', color: str }
}

export const ROW_FIELD_KEYS = ROW_FIELD_LABELS
