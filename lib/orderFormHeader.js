/**
 * Header defaults for OrderForm.
 *
 * Incoming website B2B/B2C orders often only have contact, email, phone,
 * country, and rows. The form used to fill the gaps from the logged-in user
 * ("Order by") and leftover ClientGate / localStorage data (VAT, street).
 * Two people opening the same order then saw two different headers.
 *
 * Rule: if we are opening a saved snapshot, only paint what that snapshot
 * actually has. Missing createdBy / VAT / address stay empty. Prefer empty
 * over invented data.
 */

import { JEWELER_GROUP, jewelerGroupFromLegacy, normalizeJewelerGroup } from './jewelerGroup'

function text(value) {
  if (value == null) return ''
  return String(value)
}

export const EMPTY_CLIENT = {
  name: '',
  phone: '',
  email: '',
  company: '',
  country: '',
  address: '',
  city: '',
  zip: '',
  vat: '',
  vatValid: null,
  vatValidating: false,
  vatStatus: null,
  vatErrorCode: null,
  vatMessageKey: null,
  savedClientId: null,
  dzb_client_number: '',
  jeweler_group: null,
  shipping_same_as_billing: true,
  shipping_address: '',
  shipping_address_line2: '',
  shipping_country: '',
}

export function headerFromSavedForm(formState) {
  const s = formState && typeof formState === 'object' ? formState : {}
  return {
    companyName: text(s.companyName),
    contactName: text(s.contactName),
    addressLine1: text(s.addressLine1),
    addressLine2: text(s.addressLine2),
    country: text(s.country),
    shippingSameAsBilling: s.shippingSameAsBilling != null ? Boolean(s.shippingSameAsBilling) : true,
    shippingAddressLine1: text(s.shippingAddressLine1),
    shippingAddressLine2: text(s.shippingAddressLine2),
    shippingCountry: text(s.shippingCountry),
    vatNumber: text(s.vatNumber),
    vatValid: s.vatValid === true || s.vatValid === false ? s.vatValid : null,
    email: text(s.email),
    phone: text(s.phone),
    createdBy: text(s.createdBy),
    eventName: text(s.eventName),
    dzbEnabled: s.dzbEnabled != null ? Boolean(s.dzbEnabled) : Boolean(s.dzbClientNumber),
    dzbClientNumber: text(s.dzbClientNumber),
    jewelerGroup: jewelerGroupFromLegacy(s),
  }
}

export function headerFromNewOrder(client, currentUser) {
  return {
    companyName: client?.company || '',
    contactName: client?.name || '',
    addressLine1: client?.address || '',
    addressLine2: [client?.zip, client?.city].filter(Boolean).join(' '),
    country: client?.country || '',
    shippingSameAsBilling: client?.shipping_same_as_billing !== false,
    shippingAddressLine1: client?.shipping_address || '',
    shippingAddressLine2: client?.shipping_address_line2 || '',
    shippingCountry: client?.shipping_country || '',
    vatNumber: client?.vat || '',
    vatValid: client?.vatValid ?? null,
    email: client?.email || '',
    phone: client?.phone || '',
    createdBy: currentUser?.full_name || currentUser?.email || '',
    eventName: '',
    dzbEnabled: Boolean(client?.dzb_client_number),
    dzbClientNumber: client?.dzb_client_number || '',
    jewelerGroup: client?.jeweler_group
      ? normalizeJewelerGroup(client.jeweler_group)
      : JEWELER_GROUP.AUCUN,
  }
}

/**
 * @param {object} opts
 * @param {object|null} [opts.savedFormState]
 * @param {object|null} [opts.client]
 * @param {object|null} [opts.currentUser]
 * @param {boolean} [opts.editingExisting]  true when re-opening a saved document
 */
export function resolveOrderFormHeader({
  savedFormState = null,
  client = null,
  currentUser = null,
  editingExisting = false,
} = {}) {
  const hasSaved = savedFormState != null && typeof savedFormState === 'object'

  // Re-edit OR restock/duplicate snapshot: never invent VAT/address from a
  // leftover session client. Restock still credits Order by to the person
  // opening the new order (formStateForRestock strips createdBy on purpose).
  if (editingExisting || hasSaved) {
    const header = headerFromSavedForm(hasSaved ? savedFormState : {})
    if (!editingExisting) {
      header.createdBy = currentUser?.full_name || currentUser?.email || ''
    }
    return header
  }

  return headerFromNewOrder(client, currentUser)
}

/** App-level client built only from a saved snapshot — no leftover merge. */
export function clientFromOrderFormState(formState) {
  const s = formState && typeof formState === 'object' ? formState : {}
  return {
    ...EMPTY_CLIENT,
    name: text(s.contactName),
    phone: text(s.phone),
    email: text(s.email),
    company: text(s.companyName),
    country: text(s.country),
    address: text(s.addressLine1),
    vat: text(s.vatNumber),
    dzb_client_number: text(s.dzbClientNumber),
    jeweler_group: s.jewelerGroup || null,
    shipping_same_as_billing: s.shippingSameAsBilling !== false,
    shipping_address: text(s.shippingAddressLine1),
    shipping_address_line2: text(s.shippingAddressLine2),
    shipping_country: text(s.shippingCountry),
  }
}
