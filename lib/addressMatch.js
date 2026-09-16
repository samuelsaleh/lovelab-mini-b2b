/**
 * Does the address on an order still belong to the boutique named on it?
 *
 * Dionne, 15 Sept 2026: three orders for Théâtrophil went out with another
 * shop's address before she noticed. The form leak that caused it is fixed,
 * but a mistyped or stale address can arrive by other routes, so the order is
 * checked against the directory one last time before it is saved.
 *
 * The comparison has to tolerate how people actually type addresses:
 * "Elisabethstraße 2" and "Elisabethstr. 2" are the same door, and so are
 * "19100 BRIVE LA GAILLARDE" and "19100 Brive-la-Gaillarde". Only a genuine
 * difference should interrupt someone mid-sale.
 */

const STREET_WORDS = [
  // German / Dutch
  ['strasse', 'str'], ['straße', 'str'], ['str.', 'str'], ['straat', 'str'],
  // French
  ['avenue', 'av'], ['ave', 'av'], ['boulevard', 'bd'], ['blvd', 'bd'],
  ['place', 'pl'], ['route', 'rte'], ['chemin', 'ch'], ['impasse', 'imp'],
  // English / Italian
  ['street', 'st'], ['road', 'rd'], ['via', 'via'],
]

/**
 * Particles people drop without meaning anything by it: the directory holds
 * "9 rue Toulzac" for an order typed "9 rue de Toulzac". Two streets in one
 * postcode are not told apart by these, and the house number still is.
 */
const PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', "l", 'der', 'den', 'van', 'di', 'the'])

/**
 * Reduce an address line to what actually identifies it: lower case, no
 * accents, no punctuation, street words abbreviated, particles dropped,
 * numbers kept.
 */
export function normalizeAddress(value) {
  let s = String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  // Glue a German street suffix to its name before punctuation is dropped, so
  // "elisabethstr. 2" and "elisabethstrasse 2" reduce to the same thing.
  s = s.replace(/(strasse|straße|str\.)(?=\s|$)/g, ' strasse ')
  s = s.replace(/[.,;:/\\'`’"()\[\]-]+/g, ' ')
  const words = s.split(/\s+/).filter(Boolean).map((word) => {
    const hit = STREET_WORDS.find(([long]) => word === long)
    return hit ? hit[1] : word
  }).filter((word) => !PARTICLES.has(word))
  return words.join(' ').trim()
}

/** The digits of a postcode, or '' — the part people never abbreviate. */
export function postcodeOf(value) {
  const match = String(value ?? '').match(/\b\d{4,6}\b/)
  return match ? match[0] : ''
}

/**
 * Compare an order's address against a directory row.
 *
 * @param {{addressLine1?: string, addressLine2?: string}} orderAddress
 * @param {{address?: string, zip?: string, city?: string}} clientRow
 * @returns {{match: boolean, reason: string}} reason is 'same' | 'empty' |
 *   'postcode' | 'street' — 'empty' when there is nothing to compare, which
 *   never warns.
 */
export function addressMatchesClient(orderAddress, clientRow) {
  const orderStreet = normalizeAddress(orderAddress?.addressLine1)
  const rowStreet = normalizeAddress(clientRow?.address)
  const orderPost = postcodeOf(orderAddress?.addressLine2)
  const rowPost = postcodeOf(clientRow?.zip) || postcodeOf(clientRow?.city)

  // Nothing on one side to compare against: a client we have never stored an
  // address for, or an order still being filled in. Say nothing.
  if ((!orderStreet && !orderPost) || (!rowStreet && !rowPost)) {
    return { match: true, reason: 'empty' }
  }

  // A different town is the loud case — that is what a leaked address looks
  // like, and it is the one worth stopping for.
  if (orderPost && rowPost && orderPost !== rowPost) {
    return { match: false, reason: 'postcode' }
  }
  if (orderStreet && rowStreet && orderStreet !== rowStreet) {
    // Same postcode and a different street is usually a second shop or a move,
    // not a leak — but it is still worth a glance.
    return { match: false, reason: 'street' }
  }
  return { match: true, reason: 'same' }
}

/** One line of the directory's address, for showing both side by side. */
export function formatClientAddress(clientRow) {
  const street = String(clientRow?.address ?? '').trim()
  const rest = [clientRow?.zip, clientRow?.city].map((p) => String(p ?? '').trim()).filter(Boolean).join(' ')
  return [street, rest].filter(Boolean).join(', ')
}
