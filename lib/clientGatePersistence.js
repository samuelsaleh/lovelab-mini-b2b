/**
 * Pure helpers for ClientGate / App localStorage persistence.
 * Extracted so the mid-gate wipe race can be unit-tested without mounting App.
 */

/**
 * Build the localStorage payload. Always includes `client` — even when the
 * gate is still open (clientReady === false) — so a refresh or admin
 * profile-load race cannot lose typed company/VAT/address.
 */
export function buildPersistedAppState({
  lines,
  client,
  clientReady,
  curQuote,
  aiMsgs,
  activeTab,
  builderBudget,
  aiBudget,
  aiCollections,
  aiColors,
  pricelistYear,
}) {
  const trimmedAiMsgs = Array.isArray(aiMsgs) && aiMsgs.length > 50
    ? aiMsgs.slice(-50)
    : (aiMsgs || [])
  return {
    lines,
    client: client || null,
    clientReady: Boolean(clientReady),
    curQuote,
    aiMsgs: trimmedAiMsgs,
    activeTab,
    builderBudget,
    aiBudget,
    aiCollections,
    aiColors,
    pricelistYear,
  }
}

/**
 * Decide whether the admin "bypass gate on first profile load" effect may
 * force clientReady=true. Must NOT run after an explicit New Client click.
 */
export function shouldAdminBypassClientGate({ isAdmin, adminInitDone, explicitClientGate }) {
  if (!isAdmin) return false
  if (adminInitDone) return false
  if (explicitClientGate) return false
  return true
}

/**
 * Restore client + clientReady from a parsed localStorage blob.
 * Unlike the old path, restores client even when clientReady is false.
 */
export function restoreClientFromStorage(state) {
  if (!state || typeof state !== 'object') {
    return { client: null, clientReady: undefined, explicitClientGate: false }
  }
  const clientReady = state.clientReady
  const client = state.client || null
  return {
    client,
    clientReady,
    explicitClientGate: clientReady === false,
  }
}

/**
 * Strip only eventName/createdBy from a formState for restock/duplicate,
 * keeping client identity fields.
 */
export function formStateForRestock(formState) {
  if (!formState || typeof formState !== 'object') return null
  const { eventName: _e, createdBy: _c, ...rest } = formState
  return rest
}

/**
 * Everything on a saved order that belongs to THAT client or THAT deal —
 * dropped when the same cart is duplicated for someone else (Sam, 15 Sep
 * 2026: "same cart, different client").
 *
 * Identity and addresses go because they are the other boutique's. Tax and
 * shipping go because they follow the delivery country. The negotiated parts
 * (discount, total override, prepayment, custom line) and the remarks belong
 * to the old deal, and the date belongs to the old order: carrying any of
 * them over silently would put the wrong money on the new one.
 *
 * What stays is the cart: rows, packaging, the vitrine, and the price list.
 */
export const CLIENT_FIELDS = [
  'companyName', 'contactName', 'email', 'phone',
  'addressLine1', 'addressLine2', 'country', 'vatNumber',
  'shippingSameAsBilling', 'shippingAddressLine1', 'shippingAddressLine2', 'shippingCountry',
  'dzbEnabled', 'dzbClientNumber', 'jewelerGroup', 'synaliaEnabled', 'synalia',
]
export const DEAL_FIELDS = [
  'discountDisplay', 'finalTotalOverride',
  'hasPrepayment', 'prepaymentAmount', 'prepaymentMethod',
  'shippingAmount', 'taxPercent', 'taxLabel',
  'customLineLabel', 'customLineAmount',
  'remarks', 'date',
]

/**
 * A formState for the same cart under a new client.
 *
 * `clientFields` is already in formState shape (use clientRowToFormFields for
 * a row from the clients directory). Only known client fields are taken, and
 * only when they carry something, so a half-filled dialog cannot write blanks
 * over the cart.
 *
 * @param {object} formState  the saved order's formState
 * @param {object} clientFields  who it is for now, in formState keys
 * @returns {object|null}
 */
export function formStateForNewClient(formState, clientFields = {}) {
  const base = formStateForRestock(formState)
  if (!base) return null
  const next = { ...base }
  for (const key of [...CLIENT_FIELDS, ...DEAL_FIELDS]) delete next[key]
  for (const key of CLIENT_FIELDS) {
    const value = clientFields?.[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) next[key] = trimmed
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      next[key] = value
    } else if (value != null && key === 'jewelerGroup') {
      next[key] = value
    }
  }
  return next
}

/**
 * A row from the clients directory (GET /api/clients) in formState keys, so
 * picking a saved boutique fills the new order's header the way the client
 * gate would have.
 */
export function clientRowToFormFields(row) {
  if (!row || typeof row !== 'object') return {}
  const out = {
    companyName: row.company || '',
    contactName: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    country: row.country || '',
    addressLine1: row.address || '',
    addressLine2: [row.zip, row.city].filter(Boolean).join(' '),
    vatNumber: row.vat || '',
    dzbClientNumber: row.dzb_client_number || '',
    shippingAddressLine1: row.shipping_address || '',
    shippingAddressLine2: row.shipping_address_line2 || '',
    shippingCountry: row.shipping_country || '',
  }
  if (row.dzb_client_number) out.dzbEnabled = true
  if (row.jeweler_group) out.jewelerGroup = row.jeweler_group
  if (row.shipping_same_as_billing === false) out.shippingSameAsBilling = false
  return out
}
