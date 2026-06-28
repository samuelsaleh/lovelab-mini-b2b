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

const OTHER_AGENT = {
  email: 'other.agent@example.com',
  role: 'agent',
}

const ICONIX_IDS = [...ICONIX_PREVIEW_COLLECTION_IDS]
const HIDDEN_FOR_BASTIAN = ['MFM', 'MNO', 'MNH', 'SI1', 'SI2P', 'SI3', 'SI4', 'SI5', 'ZAHA']

describe('collectionAccess — Bastian Iconix preview', () => {
  test('Bastian is granted exactly the 6 Iconix collection ids', () => {
    const granted = getGrantedPreviewCollectionIds(BASTIAN)
    expect([...granted].sort()).toEqual([...ICONIX_IDS].sort())
  })

  test('other agents get no preview collections', () => {
    expect(getGrantedPreviewCollectionIds(OTHER_AGENT).size).toBe(0)
  })

  test('admins are granted all admin-only collections', () => {
    expect(getGrantedPreviewCollectionIds({ role: 'admin' })).toEqual(ADMIN_ONLY_COLLECTION_IDS)
  })

  test('Bastian can see Iconix collections but not Moonlight/Sienna/Za-Ha', () => {
    for (const id of ICONIX_IDS) {
      expect(canSeeCollection(id, BASTIAN)).toBe(true)
    }
    for (const id of HIDDEN_FOR_BASTIAN) {
      expect(canSeeCollection(id, BASTIAN)).toBe(false)
    }
    expect(canSeeCollection('CUTY', BASTIAN)).toBe(true)
  })

  test('getVisibleCollections(profile) includes legacy + Iconix for Bastian', () => {
    const visibleIds = getVisibleCollections(BASTIAN).map((c) => c.id)
    for (const id of ICONIX_IDS) {
      expect(visibleIds).toContain(id)
    }
    for (const id of HIDDEN_FOR_BASTIAN) {
      expect(visibleIds).not.toContain(id)
    }
    expect(visibleIds.length).toBe(COLLECTIONS.length - HIDDEN_FOR_BASTIAN.length)
  })

  test('getPromptPreviewOptions returns partial preview for Bastian', () => {
    expect(getPromptPreviewOptions(BASTIAN)).toEqual({
      allowedPreviewIds: ICONIX_PREVIEW_COLLECTION_IDS,
    })
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
