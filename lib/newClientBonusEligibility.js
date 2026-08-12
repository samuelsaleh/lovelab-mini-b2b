/**
 * Which commission rows may the admin add a new-client bonus to?
 *
 * The bonus is no longer created automatically for most agents, so the
 * commission table has to point out the orders where the decision is
 * still open: the agent's FIRST order for a customer that has no bonus
 * yet. Everything here is derived from the rows already loaded in the
 * browser, so it is a hint — `createManualBonusForOrder` re-checks it
 * against the whole database before inserting anything.
 */

import { normalizeCustomerName, resolveBonusMode } from './newClientBonus.js';

/** Customer key for a commission row, via its joined document. */
export function customerKeyForRow(row) {
  const doc = row?.document || {};
  const company = normalizeCustomerName(doc.client_company);
  if (company) return company;
  const name = normalizeCustomerName(doc.client_name);
  if (name) return name;
  // Quick orders carry no document, only a typed label.
  return normalizeCustomerName(row?.client_label);
}

/** Placeholder rows synthesised from documents aren't real DB rows. */
function isRealRow(row) {
  return !!row?.id && !String(row.id).startsWith('doc-');
}

function documentIdOf(row) {
  return row?.document_id || row?.document?.id || null;
}

/** Sort key: when the underlying order was written, not when the row was. */
function orderedAt(row) {
  const raw = row?.document?.created_at || row?.created_at;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/**
 * @param {Array<object>} rows      commission rows as returned by /api/commissions
 * @param {object} options
 * @param {object} options.agent    the agent profile (mode + amount)
 * @param {boolean} [options.isDerived] true when the table is showing
 *        document-derived placeholders instead of real commission rows
 * @returns {Set<string>} ids of order rows that may receive a bonus
 */
export function eligibleManualBonusRowIds(rows, { agent, isDerived = false } = {}) {
  const empty = new Set();
  if (isDerived) return empty;
  if (!Array.isArray(rows) || rows.length === 0) return empty;
  if (resolveBonusMode(agent) === 'off') return empty;
  if (!(Number(agent?.new_client_bonus_amount) > 0)) return empty;

  // Customers and documents that already have a bonus are settled — no
  // decision left to make. Cancelled bonuses don't count, mirroring
  // isFirstOrderForCustomer on the server.
  const bonusDocumentIds = new Set();
  const bonusCustomerKeys = new Set();
  for (const row of rows) {
    if (row?.type !== 'new_client_bonus') continue;
    if (row?.status === 'cancelled') continue;
    const docId = documentIdOf(row);
    if (docId) bonusDocumentIds.add(docId);
    const key = customerKeyForRow(row);
    if (key) bonusCustomerKeys.add(key);
  }

  const candidates = rows.filter((row) =>
    row?.type === 'order' &&
    row?.status !== 'cancelled' &&
    isRealRow(row) &&
    !!documentIdOf(row) &&
    !!customerKeyForRow(row),
  );

  // Oldest order per customer wins. The API returns newest-first, so sort
  // explicitly; ties fall back to the id to keep the result stable.
  const firstPerCustomer = new Map();
  for (const row of [...candidates].sort((a, b) => {
    const diff = orderedAt(a) - orderedAt(b);
    return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
  })) {
    const key = customerKeyForRow(row);
    if (!firstPerCustomer.has(key)) firstPerCustomer.set(key, row);
  }

  const eligible = new Set();
  for (const [key, row] of firstPerCustomer) {
    if (bonusCustomerKeys.has(key)) continue;
    if (bonusDocumentIds.has(documentIdOf(row))) continue;
    eligible.add(row.id);
  }
  return eligible;
}
