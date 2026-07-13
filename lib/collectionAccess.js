import { COLLECTIONS, ADMIN_ONLY_COLLECTION_IDS } from './catalog.js'

// Iconix Flower / Riviera / Linea — visible to every agent without full admin preview.
export const ICONIX_PREVIEW_COLLECTION_IDS = new Set([
  'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5',
])

export function getGrantedPreviewCollectionIds(profile) {
  if (profile?.role === 'admin') return ADMIN_ONLY_COLLECTION_IDS
  // No profile (unauthenticated / public surfaces) gets no preview access.
  if (!profile) return new Set()
  // Every logged-in agent now sees the 6 Iconix preview collections.
  return ICONIX_PREVIEW_COLLECTION_IDS
}

export function canSeeCollection(collectionId, profile) {
  if (!ADMIN_ONLY_COLLECTION_IDS.has(collectionId)) return true
  if (profile?.role === 'admin') return true
  return getGrantedPreviewCollectionIds(profile).has(collectionId)
}

// Admins see everything; agents with an email allowlist see legacy + their preview ids;
// everyone else sees legacy only. Boolean arg kept for existing tests:
// getVisibleCollections(true) → all, getVisibleCollections(false) → legacy only.
export function getVisibleCollections(profileOrLegacyFlag) {
  if (profileOrLegacyFlag === true) return COLLECTIONS
  if (profileOrLegacyFlag === false || profileOrLegacyFlag == null) {
    return COLLECTIONS.filter((c) => !ADMIN_ONLY_COLLECTION_IDS.has(c.id))
  }
  if (profileOrLegacyFlag?.role === 'admin') return COLLECTIONS
  const granted = getGrantedPreviewCollectionIds(profileOrLegacyFlag)
  return COLLECTIONS.filter(
    (c) => !ADMIN_ONLY_COLLECTION_IDS.has(c.id) || granted.has(c.id),
  )
}

export function getPromptPreviewOptions(profile) {
  if (profile?.role === 'admin') return { includeAdminOnly: true }
  const granted = getGrantedPreviewCollectionIds(profile)
  if (granted.size > 0) return { allowedPreviewIds: granted }
  return { includeAdminOnly: false }
}
