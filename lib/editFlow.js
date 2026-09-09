/**
 * Re-edit flow — the state transitions that keep an edited order attached to
 * the document it came from.
 *
 * THE BUG THESE EXIST TO PREVENT
 * A saved order can be reopened two ways: straight into the Order Form
 * ("Re-edit"), or into the Builder to change the product lines. From the
 * Builder the only way back to the Order Form is Finalize, and Finalize used
 * to reset the whole editing context — it was written for turning a brand-new
 * build into a brand-new order. Running an edit through it meant:
 *
 *   - remarks, shipping, prepayment and payment method came back blank
 *   - the company field fell back to the last client picked at the top of the
 *     app, so the order saved under the wrong boutique
 *   - the app thought it was a new order: it offered a stale draft ("Start
 *     Fresh / Restore Draft") and Save created a SECOND document instead of
 *     updating the finalised one
 *
 * All three from one reset. The helpers below are pure so the transitions can
 * be pinned by tests without rendering the App.
 */

/**
 * What the App's editing context becomes when the Builder's quote is finalised
 * into the Order Form.
 *
 * A NEW build clears everything, as before. An EDIT keeps the document id and
 * every saved form field EXCEPT the rows — the rows are exactly what the user
 * went to the Builder to change, so they must come from the Builder's quote,
 * and the Order Form only prefills from the quote when the saved state carries
 * no rows of its own.
 */
export function finalizeTransition({ editingDocumentId, savedFormState, initialOrderChannel }) {
  if (!editingDocumentId) {
    return { editingDocumentId: null, savedFormState: null, initialOrderChannel: 'b2b' }
  }
  const { rows: _dropped, ...rest } = savedFormState || {}
  return {
    editingDocumentId,
    savedFormState: Object.keys(rest).length > 0 ? rest : null,
    initialOrderChannel: initialOrderChannel || 'b2b',
  }
}

/**
 * The App-level client that matches a document's saved form state.
 *
 * The Order Form seeds its company field from this client whenever it has no
 * saved state to go on, and the client gate persists it across reloads — so
 * if reopening a document leaves it pointing at the previous boutique, the
 * next save lands under the wrong name. Copy (restock) already did this sync;
 * Re-edit and Edit-in-Builder now do too.
 */
export function clientFromFormState(formState, prev = {}) {
  const p = prev || {}
  const s = formState || {}
  return {
    ...p,
    name: s.contactName || p.name || '',
    company: s.companyName || p.company || '',
    country: s.country || p.country || '',
    address: s.addressLine1 || p.address || '',
    city: p.city || '',
    zip: p.zip || '',
    email: s.email || p.email || '',
    phone: s.phone || p.phone || '',
    vat: s.vatNumber || p.vat || '',
    dzb_client_number: s.dzbClientNumber || p.dzb_client_number || '',
    jeweler_group: s.jewelerGroup || p.jeweler_group || null,
    shipping_same_as_billing: s.shippingSameAsBilling !== false,
    shipping_address: s.shippingAddressLine1 || p.shipping_address || '',
    shipping_address_line2: s.shippingAddressLine2 || p.shipping_address_line2 || '',
    shipping_country: s.shippingCountry || p.shipping_country || '',
  }
}

/**
 * The label the Builder shows while an existing order is being modified, so
 * "editing" and "creating" never look the same on screen. Null for a new build.
 */
export function editingOrderLabel({ editingDocumentId, savedFormState }) {
  if (!editingDocumentId) return null
  const who = savedFormState?.companyName || savedFormState?.contactName || ''
  return who ? `Editing order for ${who}` : 'Editing an existing order'
}
