/**
 * The address a saved order writes back onto the shared client record.
 *
 * After every order save the Order Form syncs its header onto the client so
 * the next order for that boutique is prefilled. That sync used to send every
 * field verbatim — `address: addressLine1, city: addressLine2`, no `zip` — and
 * the server nulled whatever was blank or missing. So each saved order erased
 * the client's postcode, wrote "75001 Paris" into `city`, and, when the form's
 * address lines happened to be empty, erased the street and city as well.
 * Folies lost its address exactly that way.
 *
 * Rule now: a field is sent only when the form actually has a value for it.
 * Absent means "leave what is stored". The second address line, labelled
 * "Postal code, City", is split into the two columns it stands for.
 */

import { derivePostalAndCity } from './clientAddress'

const text = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * @param {{ addressLine1?: string, addressLine2?: string, country?: string, vatNumber?: string }} header
 * @returns {{ address?: string, zip?: string, city?: string, country?: string, vat?: string }}
 *   only the keys that carry a value
 */
export function clientAddressPatch(header = {}) {
  const patch = {}

  const address = text(header.addressLine1)
  if (address) patch.address = address

  const { postalCode, city } = derivePostalAndCity({
    addressLine1: header.addressLine1,
    addressLine2: header.addressLine2,
  })
  if (postalCode) patch.zip = postalCode
  if (city) patch.city = city

  const country = text(header.country)
  if (country) patch.country = country

  const vat = text(header.vatNumber)
  if (vat) patch.vat = vat

  return patch
}
