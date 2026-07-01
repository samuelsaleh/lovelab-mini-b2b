import { COLLECTIONS, ADMIN_ONLY_COLLECTION_IDS } from '../catalog.js'
import {
  getVisibleCollections,
  canSeeCollection,
  getGrantedPreviewCollectionIds,
  getPromptPreviewOptions,
  ICONIX_PREVIEW_COLLECTION_IDS,
} from '../collectionAccess.js'

const BASTIAN = {
  email: 'bastianmeyer319@hotmail.com',
  role: 'agent',
  full_name: 'Bastian Mayer',
}

const NICOLAS = {
  email: 'nicolas.vial@ascension-france.com',
  role: 'agent',
  full_name: 'NICOLAS WHOLESALE FRANCE',
}

const OTHER_AGENT = {
  email: 'other.agent@example.com',
  role: 'agent',
}

const ICONIX_IDS = [...ICONIX_PREVIEW_COLLECTION_IDS]
const HIDDEN_FOR_BASTIAN = ['MFM', 'MNO', 'MNH', 'SI1', 'SI2P', 'SI3', 'SI4', 'SI5', 'ZAHA']

describe('collectionAccess — Bastian + Nicolas Iconix preview', () => {
  test.each([BASTIAN, NICOLAS])('%s is granted exactly the 6 Iconix collection ids', (profile) => {
    const granted = getGrantedPreviewCollectionIds(profile)
    expect([...granted].sort()).toEqual([...ICONIX_IDS].sort())
  })

  test('other agents get no preview collections', () => {
    expect(getGrantedPreviewCollectionIds(OTHER_AGENT).size).toBe(0)
  })

  test('admins are granted all admin-only collections', () => {
    expect(getGrantedPreviewCollectionIds({ role: 'admin' })).toEqual(ADMIN_ONLY_COLLECTION_IDS)
  })

  test.each([BASTIAN, NICOLAS])('%s can see Iconix collections but not Moonlight/Sienna/Za-Ha', (profile) => {
    for (const id of ICONIX_IDS) {
      expect(canSeeCollection(id, profile)).toBe(true)
    }
    for (const id of HIDDEN_FOR_BASTIAN) {
      expect(canSeeCollection(id, profile)).toBe(false)
    }
    expect(canSeeCollection('CUTY', profile)).toBe(true)
  })

  test.each([BASTIAN, NICOLAS])('getVisibleCollections(profile) includes legacy + Iconix for %s', (profile) => {
    const visibleIds = getVisibleCollections(profile).map((c) => c.id)
    for (const id of ICONIX_IDS) {
      expect(visibleIds).toContain(id)
    }
    for (const id of HIDDEN_FOR_BASTIAN) {
      expect(visibleIds).not.toContain(id)
    }
    expect(visibleIds.length).toBe(COLLECTIONS.length - HIDDEN_FOR_BASTIAN.length)
  })

  test.each([BASTIAN, NICOLAS])('getPromptPreviewOptions returns partial preview for %s', (profile) => {
    expect(getPromptPreviewOptions(profile)).toEqual({
      allowedPreviewIds: ICONIX_PREVIEW_COLLECTION_IDS,
    })
  })

  test('getPromptPreviewOptions admin vs unprivileged agent', () => {
    expect(getPromptPreviewOptions({ role: 'admin' })).toEqual({ includeAdminOnly: true })
    expect(getPromptPreviewOptions(OTHER_AGENT)).toEqual({ includeAdminOnly: false })
  })
})

describe('getVisibleCollections — legacy boolean API', () => {
  test('admins see every collection', () => {
    expect(getVisibleCollections(true)).toHaveLength(COLLECTIONS.length)
    expect(getVisibleCollections(true)).toBe(COLLECTIONS)
  })

  test('false/undefined hides all preview collections', () => {
    const visible = getVisibleCollections(false)
    for (const id of ADMIN_ONLY_COLLECTION_IDS) {
      expect(visible.map((c) => c.id)).not.toContain(id)
    }
  })
})
