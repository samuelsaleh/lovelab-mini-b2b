import { COLLECTIONS, ADMIN_ONLY_COLLECTION_IDS } from '../catalog.js'
import {
  getVisibleCollections,
  canSeeCollection,
  getGrantedPreviewCollectionIds,
  getPromptPreviewOptions,
  ICONIX_PREVIEW_COLLECTION_IDS,
  MOONLIGHT_SIENNA_ZAHA_IDS,
} from '../collectionAccess.js'

const BASTIAN = {
  email: 'bastianmeyer319@hotmail.com',
  role: 'agent',
  full_name: 'Bastian Mayer',
}

const SARAH = {
  email: 'sarah@showroomaccestory.com',
  role: 'agent',
  full_name: 'Sarah Goutard',
}

const OTHER_AGENT = {
  email: 'other.agent@example.com',
  role: 'agent',
}

const PIOTR = {
  email: 'piotr.kicinski84@gmail.com',
  role: 'member',
  full_name: 'Piotr Kiciński',
}

const ICONIX_IDS = [...ICONIX_PREVIEW_COLLECTION_IDS]
const MOONLIGHT_SIENNA_ZAHA = [...MOONLIGHT_SIENNA_ZAHA_IDS]
const HIDDEN_FOR_REGULAR_AGENTS = MOONLIGHT_SIENNA_ZAHA

describe('collectionAccess — every agent gets the Iconix preview', () => {
  test.each([BASTIAN, SARAH, OTHER_AGENT])('%s is granted exactly the 6 Iconix collection ids', (profile) => {
    const granted = getGrantedPreviewCollectionIds(profile)
    expect([...granted].sort()).toEqual([...ICONIX_IDS].sort())
  })

  test('a brand-new agent (no email allowlist) also gets the 6 Iconix ids', () => {
    const NEW_AGENT = { email: 'fresh.agent@example.com', role: 'agent' }
    expect([...getGrantedPreviewCollectionIds(NEW_AGENT)].sort()).toEqual([...ICONIX_IDS].sort())
  })

  test('no profile (unauthenticated / public) gets no preview collections', () => {
    expect(getGrantedPreviewCollectionIds(null).size).toBe(0)
    expect(getGrantedPreviewCollectionIds(undefined).size).toBe(0)
  })

  test('admins are granted all admin-only collections', () => {
    expect(getGrantedPreviewCollectionIds({ role: 'admin' })).toEqual(ADMIN_ONLY_COLLECTION_IDS)
  })

  test.each([BASTIAN, SARAH, OTHER_AGENT])('%s can see Iconix collections but not Moonlight/Sienna/Za-Ha', (profile) => {
    for (const id of ICONIX_IDS) {
      expect(canSeeCollection(id, profile)).toBe(true)
    }
    for (const id of HIDDEN_FOR_REGULAR_AGENTS) {
      expect(canSeeCollection(id, profile)).toBe(false)
    }
    expect(canSeeCollection('CUTY', profile)).toBe(true)
  })

  test('a null viewer cannot see Iconix (no leak on public surfaces)', () => {
    for (const id of ICONIX_IDS) {
      expect(canSeeCollection(id, null)).toBe(false)
    }
    // Legacy collections stay visible to everyone.
    expect(canSeeCollection('CUTY', null)).toBe(true)
  })

  test.each([BASTIAN, SARAH, OTHER_AGENT])('getVisibleCollections(profile) includes legacy + Iconix for %s', (profile) => {
    const visibleIds = getVisibleCollections(profile).map((c) => c.id)
    for (const id of ICONIX_IDS) {
      expect(visibleIds).toContain(id)
    }
    for (const id of HIDDEN_FOR_REGULAR_AGENTS) {
      expect(visibleIds).not.toContain(id)
    }
    expect(visibleIds.length).toBe(COLLECTIONS.length - HIDDEN_FOR_REGULAR_AGENTS.length)
  })

  test.each([BASTIAN, SARAH, OTHER_AGENT])('getPromptPreviewOptions returns partial preview for %s', (profile) => {
    expect(getPromptPreviewOptions(profile)).toEqual({
      allowedPreviewIds: ICONIX_PREVIEW_COLLECTION_IDS,
    })
  })

  test('getPromptPreviewOptions admin vs no profile', () => {
    expect(getPromptPreviewOptions({ role: 'admin' })).toEqual({ includeAdminOnly: true })
    expect(getPromptPreviewOptions(null)).toEqual({ includeAdminOnly: false })
  })
})

describe('collectionAccess — Piotr gets Moonlight / Sienna / Za-Ha', () => {
  const expectedIds = [...ICONIX_IDS, ...MOONLIGHT_SIENNA_ZAHA].sort()

  test('Piotr is granted Iconix plus Moonlight, Sienna and Za-Ha', () => {
    expect([...getGrantedPreviewCollectionIds(PIOTR)].sort()).toEqual(expectedIds)
  })

  test('email match is case-insensitive', () => {
    expect([...getGrantedPreviewCollectionIds({
      ...PIOTR,
      email: 'Piotr.Kicinski84@Gmail.com',
    })].sort()).toEqual(expectedIds)
  })

  test('Piotr can see and order those collections; other agents still cannot', () => {
    for (const id of MOONLIGHT_SIENNA_ZAHA) {
      expect(canSeeCollection(id, PIOTR)).toBe(true)
      expect(canSeeCollection(id, OTHER_AGENT)).toBe(false)
    }
    const visibleIds = getVisibleCollections(PIOTR).map((c) => c.id)
    for (const id of MOONLIGHT_SIENNA_ZAHA) {
      expect(visibleIds).toContain(id)
    }
    expect(visibleIds.length).toBe(COLLECTIONS.length - (
      [...ADMIN_ONLY_COLLECTION_IDS].filter((id) => !expectedIds.includes(id)).length
    ))
  })

  test('getPromptPreviewOptions includes the extra ids for Piotr', () => {
    const opts = getPromptPreviewOptions(PIOTR)
    expect(opts.includeAdminOnly).toBeUndefined()
    expect([...opts.allowedPreviewIds].sort()).toEqual(expectedIds)
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
