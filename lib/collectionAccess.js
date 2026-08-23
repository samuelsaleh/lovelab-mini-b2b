import { COLLECTIONS, ADMIN_ONLY_COLLECTION_IDS, RETIRED_COLLECTION_IDS, PRICELISTS } from './catalog.js'

function isSellable(c) {
  return !RETIRED_COLLECTION_IDS.has(c.id)
}

// Iconix Flower / Riviera / Linea — visible to every agent without full admin preview.
export const ICONIX_PREVIEW_COLLECTION_IDS = new Set([
  'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5',
])

// Moonlight + Sienna + Za-Ha stay admin-only except for the agents listed
// below (Sam, Aug 2026 — Piotr only for now).
export const MOONLIGHT_SIENNA_ZAHA_IDS = new Set([
  'MFM', 'MNO', 'MNH',
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5',
  'ZAHA',
])

// Extra preview grants on top of Iconix, keyed by lowercase email.
export const EXTRA_PREVIEW_GRANTS_BY_EMAIL = {
  'piotr.kicinski84@gmail.com': MOONLIGHT_SIENNA_ZAHA_IDS,
}

export function getGrantedPreviewCollectionIds(profile) {
  if (profile?.role === 'admin') return ADMIN_ONLY_COLLECTION_IDS
  // No profile (unauthenticated / public surfaces) gets no preview access.
  if (!profile) return new Set()
  // Every logged-in agent sees the 6 Iconix preview collections; a few
  // agents also get Moonlight / Sienna / Za-Ha via EXTRA_PREVIEW_GRANTS_BY_EMAIL.
  const granted = new Set(ICONIX_PREVIEW_COLLECTION_IDS)
  const email = String(profile.email || '').trim().toLowerCase()
  const extra = EXTRA_PREVIEW_GRANTS_BY_EMAIL[email]
  if (extra) {
    for (const id of extra) granted.add(id)
  }
  return granted
}

export function canSeeCollection(collectionId, profile) {
  if (RETIRED_COLLECTION_IDS.has(collectionId)) return false
  if (!ADMIN_ONLY_COLLECTION_IDS.has(collectionId)) return true
  if (profile?.role === 'admin') return true
  return getGrantedPreviewCollectionIds(profile).has(collectionId)
}

// Admins see everything; agents with an email allowlist see legacy + their preview ids;
// everyone else sees legacy only. Boolean arg kept for existing tests:
// getVisibleCollections(true) → all, getVisibleCollections(false) → legacy only.
export function getVisibleCollections(profileOrLegacyFlag) {
  if (profileOrLegacyFlag === true) return COLLECTIONS.filter(isSellable)
  if (profileOrLegacyFlag === false || profileOrLegacyFlag == null) {
    return COLLECTIONS.filter((c) => isSellable(c) && !ADMIN_ONLY_COLLECTION_IDS.has(c.id))
  }
  if (profileOrLegacyFlag?.role === 'admin') return COLLECTIONS.filter(isSellable)
  const granted = getGrantedPreviewCollectionIds(profileOrLegacyFlag)
  return COLLECTIONS.filter(
    (c) => isSellable(c) && (!ADMIN_ONLY_COLLECTION_IDS.has(c.id) || granted.has(c.id)),
  )
}

export function getPromptPreviewOptions(profile) {
  if (profile?.role === 'admin') return { includeAdminOnly: true }
  const granted = getGrantedPreviewCollectionIds(profile)
  if (granted.size > 0) return { allowedPreviewIds: granted }
  return { includeAdminOnly: false }
}

// ─── Price list visibility ───
// The October 2026 revision only reprices Moonlight / Sienna / Za-Ha, which are
// themselves preview-only. For an agent who cannot sell those collections it is
// byte-identical to the 2026 list, so offering it as a third choice is pure
// confusion — Sam asked (Aug 2026) that only admins and Piotr see it.
//
// Its audience is therefore derived from the collection grants rather than a
// second allowlist: whoever is granted Moonlight / Sienna / Za-Ha gets the list
// that reprices them, and there is only one place to edit when that changes.
export const PREVIEW_PRICELISTS = new Set(['2026-10'])

export function canSeePricelist(pricelistYear, profile) {
  const year = String(pricelistYear)
  if (!PREVIEW_PRICELISTS.has(year)) return true
  if (profile?.role === 'admin') return true
  const granted = getGrantedPreviewCollectionIds(profile)
  return [...MOONLIGHT_SIENNA_ZAHA_IDS].every((id) => granted.has(id))
}

// The price lists to offer as a choice. `activeYear` is always included even
// when the profile could not have chosen it: a document saved on the October
// list must keep showing which list priced it, and quietly relabelling it to
// 2026 would print a price list name that does not match the prices.
export function getVisiblePricelists(profile, activeYear = null) {
  const active = activeYear == null ? null : String(activeYear)
  return PRICELISTS.filter((year) => year === active || canSeePricelist(year, profile))
}
