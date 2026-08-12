/**
 * Client-side helpers for the "customer paid" tick on the agent detail page.
 *
 * The server cascades an order's customer_paid_at onto the linked
 * new_client_bonus row (same agent + document). `applyCustomerPaidLocally`
 * reproduces that cascade in React state so both checkboxes flip in the same
 * render instead of only after the server round trip.
 */

/**
 * Flip customer_paid_at on the given commission ids, plus any
 * new_client_bonus row linked to the same (agent_id, document_id) as a
 * targeted 'order' row.
 *
 * @param {Array<object>} rows - current commission rows
 * @param {string[]} ids - commission ids being toggled
 * @param {boolean} paid - true to set a timestamp, false to clear it
 * @param {string} [timestamp] - ISO timestamp to write (defaults to now)
 * @returns {Array<object>} new rows array
 */
export function applyCustomerPaidLocally(rows, ids, paid, timestamp) {
  const list = Array.isArray(rows) ? rows : [];
  const targetIds = new Set(Array.isArray(ids) ? ids : []);
  if (targetIds.size === 0) return list;

  const nextValue = paid ? (timestamp || new Date().toISOString()) : null;

  // Bonus rows only cascade from an 'order' row that is actually linked to a
  // document. A bonus row toggled on its own never drags anything with it.
  const cascadeKeys = new Set();
  for (const row of list) {
    if (!targetIds.has(row?.id)) continue;
    if (row?.type !== 'order') continue;
    if (!row?.document_id || !row?.agent_id) continue;
    cascadeKeys.add(`${row.agent_id}::${row.document_id}`);
  }

  return list.map((row) => {
    const isTarget = targetIds.has(row?.id);
    const isCascaded =
      !isTarget &&
      row?.type === 'new_client_bonus' &&
      !!row?.document_id &&
      !!row?.agent_id &&
      cascadeKeys.has(`${row.agent_id}::${row.document_id}`);

    if (!isTarget && !isCascaded) return row;
    return { ...row, customer_paid_at: nextValue };
  });
}

/**
 * Ids that a bulk paid/unpaid action should actually send.
 * Rows already in the requested state are dropped so ticking "select all"
 * doesn't re-stamp customer_paid_at on rows that were already ticked.
 */
export function selectableForBulk(rows, ids, paid) {
  const list = Array.isArray(rows) ? rows : [];
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  return list
    .filter((row) => wanted.has(row?.id) && !!row?.customer_paid_at !== paid)
    .map((row) => row.id);
}

/**
 * Send one bulk request. Returns the parsed body; throws on a non-2xx.
 */
export async function sendBulkCustomerPaid(ids, paid, fetchImpl = fetch) {
  const res = await fetchImpl('/api/commissions/customer-paid-bulk', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, paid }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Failed to update commissions');
  return json;
}
