/**
 * Shared consignment utilities used by both the admin dashboard and the
 * ConsignmentOrdersPanel component.
 */

// ── Status helpers ────────────────────────────────────────────────────────────

export function isReturned(doc) {
  return !!doc?.metadata?.consignment?.returned_at
}

export function isOverdue(doc) {
  const returnDate = doc?.metadata?.consignment?.return_date
  if (!returnDate) return false
  if (isReturned(doc)) return false
  return new Date(returnDate) < new Date()
}

/** Returns days until return date. Negative = overdue. Null = no date set. */
export function daysUntil(doc) {
  const returnDate = doc?.metadata?.consignment?.return_date
  if (!returnDate || isReturned(doc)) return null
  return Math.ceil((new Date(returnDate) - new Date()) / 86400000)
}

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * Shallow-merges `patch` into `order.metadata.consignment` and PATCHes the
 * document. Returns the updated document from the server.
 *
 * @param {string} orderId
 * @param {object} currentMetadataConsignment  existing metadata.consignment object
 * @param {object} patch                        fields to merge in
 * @returns {Promise<object>}                   parsed JSON response { document }
 */
/**
 * Marks a consignment order as simply returned (no sold items, no reconciliation).
 * Use this for the "Returned" fast-path button. For partial sales use ReconcileConsignmentModal.
 */
export async function closeConsignmentAsReturned(orderId, currentMetadataConsignment) {
  return patchConsignmentOrder(orderId, currentMetadataConsignment, {
    returned_at: new Date().toISOString(),
  })
}

export async function patchConsignmentOrder(orderId, currentMetadataConsignment, patch) {
  const newConsignment = { ...(currentMetadataConsignment || {}), ...patch }
  const res = await fetch(`/api/documents/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: { consignment: newConsignment } }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || 'Failed to update consignment order')
  }
  return data
}

// ── Row helpers ───────────────────────────────────────────────────────────────

/**
 * Returns a human-readable description for a formState row.
 */
export function rowDescription(row) {
  const parts = [row.collection, row.carat, row.shape, row.setting, row.material]
    .filter(Boolean)
  const desc = parts.join(' ')
  // Operator-precedence safe: only fall back to "Item #N" when desc is empty
  return desc || (row.no ? `Item #${row.no}` : 'Item')
}

/**
 * Returns compact key specs for display in small spaces.
 * e.g. "White · Red cord"
 */
export function rowSpecs(row) {
  const parts = []
  if (row.bpColor) parts.push(row.bpColor)
  if (row.colorCord) parts.push(`${row.colorCord} cord`)
  if (row.size) parts.push(`Size ${row.size}`)
  return parts.join(' · ')
}

/**
 * Extracts the non-empty rows from an order's formState.
 * Returns an empty array if formState is missing.
 */
export function getConsignmentRows(order) {
  const rows = order?.metadata?.formState?.rows || []
  return rows.filter(r => r.collection || r.quantity)
}
