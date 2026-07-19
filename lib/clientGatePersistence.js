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
