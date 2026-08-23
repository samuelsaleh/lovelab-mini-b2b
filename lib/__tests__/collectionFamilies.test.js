/**
 * Collection families — the taxonomy behind the builder's selection grid.
 *
 * Sam's rule (Aug 2026, revised the same day): CUTY solo, CUBIX solo, Multi
 * 3/4/5 under MULTI, Matchy Fancy solo, Shapy Shine opens onto its shapes,
 * Shapy Sparkle (Fancy + both Rounds) opens like Multi, Holy solo, the three
 * Moonlights as one, the five Siennas as one, and "all the rest" under ICONICS.
 *
 * The load-bearing test in here is the completeness one: every bracelet in the
 * catalog must be either a declared family member or a deliberately-solo card.
 * Add a collection to catalog.js without classifying it and that test fails,
 * instead of the product quietly appearing as a stray card next to the ranges.
 */

const {
  COLLECTION_FAMILIES,
  buildGridEntries,
  familyForCollectionId,
  familyById,
  familyProductType,
} = require('@/lib/collectionFamilies')
const { COLLECTIONS, getCollectionsByType } = require('@/lib/catalog')
const { getVisibleCollections } = require('@/lib/collectionAccess')

const byId = (id) => COLLECTIONS.find((c) => c.id === id)
const ids = (entries) => entries.map((e) => e.key)

// The cards Sam wants standing on their own, bracelet side.
const SOLO_BRACELETS = ['CUTY', 'CUBIX', 'MF', 'HOLY', 'SSRD']
const SOLO_NECKLACES = [
  'CUTY_NECK', 'CUBIX_NECK', 'MF_NECK', 'SSF_NECK', 'SSPF_NECK', 'HOLY_NECK',
]

const ADMIN = { role: 'admin' }
const AGENT = { role: 'agent', email: 'someone@example.com' }
const PIOTR = { role: 'agent', email: 'piotr.kicinski84@gmail.com' }

const bracelets = (profile) =>
  getCollectionsByType(getVisibleCollections(profile), 'bracelet')
const necklaces = (profile) =>
  getCollectionsByType(getVisibleCollections(profile), 'necklace')

// ─── The taxonomy itself ─────────────────────────────────────────────────────

describe('COLLECTION_FAMILIES', () => {
  it('declares only real collection ids', () => {
    for (const family of COLLECTION_FAMILIES) {
      for (const id of family.memberIds) {
        expect({ family: family.id, id, exists: !!byId(id) })
          .toEqual({ family: family.id, id, exists: true })
      }
    }
  })

  it('never puts one collection in two families', () => {
    const seen = new Map()
    for (const family of COLLECTION_FAMILIES) {
      for (const id of family.memberIds) {
        expect({ id, alreadyIn: seen.get(id) || null })
          .toEqual({ id, alreadyIn: null })
        seen.set(id, family.id)
      }
    }
  })

  it('uses family ids that cannot collide with a collection id', () => {
    for (const family of COLLECTION_FAMILIES) {
      expect(byId(family.id)).toBeUndefined()
    }
  })

  it('holds every member of a family on the same product tab', () => {
    for (const family of COLLECTION_FAMILIES) {
      const types = new Set(family.memberIds.map((id) => byId(id).productType || 'bracelet'))
      expect({ family: family.id, types: [...types] })
        .toEqual({ family: family.id, types: [familyProductType(family, COLLECTIONS)] })
    }
  })

  it('classifies EVERY bracelet as either a family member or a deliberate solo card', () => {
    const unclassified = bracelets(ADMIN)
      .filter((c) => !familyForCollectionId(c.id) && !SOLO_BRACELETS.includes(c.id))
      .map((c) => `${c.id} (${c.label})`)
    expect(unclassified).toEqual([])
  })

  it('classifies EVERY necklace too', () => {
    const unclassified = necklaces(ADMIN)
      .filter((c) => !familyForCollectionId(c.id) && !SOLO_NECKLACES.includes(c.id))
      .map((c) => `${c.id} (${c.label})`)
    expect(unclassified).toEqual([])
  })

  it('keeps the solo bracelets out of every family', () => {
    for (const id of SOLO_BRACELETS) {
      expect({ id, family: familyForCollectionId(id) }).toEqual({ id, family: null })
    }
  })

  it('groups exactly what Sam listed', () => {
    expect(familyById('FAM_MULTI').memberIds).toEqual(['M3', 'M4', 'M5'])
    expect(familyById('FAM_MOONLIGHT').memberIds).toEqual(['MFM', 'MNO', 'MNH'])
    expect(familyById('FAM_SIENNA').memberIds).toEqual(['SI1', 'SI2P', 'SI3', 'SI4', 'SI5'])
    expect(familyById('FAM_SHAPY_SHINE').memberIds).toEqual(['SSF'])
    expect(familyById('FAM_SHAPY_SHINE').openAsShapes).toBe(true)
    expect(familyById('FAM_SHAPY_SPARKLE').memberIds).toEqual(['SSPF'])
    expect(familyById('FAM_SHAPY_SPARKLE').openAsShapes).toBe(true)
    expect(familyById('FAM_ICONICS').memberIds)
      .toEqual(['ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5'])
  })
})

// ─── Grid entries ────────────────────────────────────────────────────────────

describe('buildGridEntries — bracelet tab as an admin', () => {
  const entries = () => buildGridEntries(bracelets(ADMIN))

  it('collapses the bracelet tab to ranges plus the remaining solo cards', () => {
    expect(bracelets(ADMIN).length).toBe(25)
    expect(ids(entries())).toEqual([
      'CUTY',
      'CUBIX',
      'FAM_MULTI',
      'MF',
      'FAM_SHAPY_SHINE',
      'FAM_SHAPY_SPARKLE',
      'SSRD',
      'HOLY',
      'FAM_MOONLIGHT',
      'FAM_SIENNA',
      'FAM_ICONICS',
    ])
  })

  it('marks the ranges as families and the rest as plain collections', () => {
    const types = Object.fromEntries(entries().map((e) => [e.key, e.type]))
    expect(types).toMatchObject({
      CUTY: 'collection',
      CUBIX: 'collection',
      FAM_MULTI: 'family',
      MF: 'collection',
      FAM_SHAPY_SHINE: 'family',
      FAM_SHAPY_SPARKLE: 'family',
      SSRD: 'collection',
      HOLY: 'collection',
      FAM_MOONLIGHT: 'family',
      FAM_SIENNA: 'family',
      FAM_ICONICS: 'family',
    })
  })

  it('orders members by the family declaration, not the catalog', () => {
    const iconics = entries().find((e) => e.key === 'FAM_ICONICS')
    expect(iconics.members.map((c) => c.id))
      .toEqual(['ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5'])
    const sparkle = entries().find((e) => e.key === 'FAM_SHAPY_SPARKLE')
    expect(sparkle.members.map((c) => c.id)).toEqual(['SSPF'])
  })

  it('loses nothing — every visible collection is reachable from some entry', () => {
    const reachable = new Set()
    for (const e of entries()) {
      if (e.type === 'family') e.members.forEach((m) => reachable.add(m.id))
      else reachable.add(e.col.id)
    }
    expect([...reachable].sort()).toEqual(bracelets(ADMIN).map((c) => c.id).sort())
  })

  it('shows nothing twice', () => {
    const seen = []
    for (const e of entries()) {
      if (e.type === 'family') e.members.forEach((m) => seen.push(m.id))
      else seen.push(e.col.id)
    }
    expect(seen).toHaveLength(new Set(seen).size)
  })
})

describe('buildGridEntries — necklace tab', () => {
  it('groups the three Multi necklaces and leaves the others alone', () => {
    expect(ids(buildGridEntries(necklaces(ADMIN)))).toEqual([
      'CUTY_NECK',
      'FAM_MULTI_NECK',
      'SSF_NECK',
      'CUBIX_NECK',
      'MF_NECK',
      'SSPF_NECK',
      'HOLY_NECK',
    ])
  })
})

describe('buildGridEntries — access filtering', () => {
  it('drops Moonlight and Sienna entirely for an agent who cannot sell them', () => {
    const keys = ids(buildGridEntries(bracelets(AGENT)))
    expect(keys).not.toContain('FAM_MOONLIGHT')
    expect(keys).not.toContain('FAM_SIENNA')
    // Iconics survives on the six Iconix previews. Sparkle is its own folder
    // and is visible to every agent (not admin-only).
    expect(keys).toContain('FAM_ICONICS')
    expect(keys).toContain('FAM_SHAPY_SPARKLE')
    expect(keys).toContain('FAM_SHAPY_SHINE')
  })

  it('leaves Za-Ha out of the Iconics folder for an agent, but keeps it for an admin', () => {
    const forAgent = buildGridEntries(bracelets(AGENT)).find((e) => e.key === 'FAM_ICONICS')
    expect(forAgent.members.map((c) => c.id)).not.toContain('ZAHA')
    const forAdmin = buildGridEntries(bracelets(ADMIN)).find((e) => e.key === 'FAM_ICONICS')
    expect(forAdmin.members.map((c) => c.id)).toContain('ZAHA')
  })

  it('gives Piotr the Moonlight and Sienna folders, since he is granted them', () => {
    const keys = ids(buildGridEntries(bracelets(PIOTR)))
    expect(keys).toContain('FAM_MOONLIGHT')
    expect(keys).toContain('FAM_SIENNA')
  })

  it('flattens a family down to one visible member into a plain card', () => {
    // A folder holding a single product is a pointless detour.
    const onlyOneMulti = COLLECTIONS.filter((c) => ['CUTY', 'M4'].includes(c.id))
    const entries = buildGridEntries(onlyOneMulti)
    expect(entries.map((e) => ({ key: e.key, type: e.type }))).toEqual([
      { key: 'CUTY', type: 'collection' },
      { key: 'M4', type: 'collection' },
    ])
  })

  it('keeps a one-member openAsShapes family as a folder when it has several shapes', () => {
    const onlyShine = COLLECTIONS.filter((c) => c.id === 'SSF')
    const entries = buildGridEntries(onlyShine)
    expect(entries.map((e) => ({ key: e.key, type: e.type }))).toEqual([
      { key: 'FAM_SHAPY_SHINE', type: 'family' },
    ])
  })

  it('emits no entry at all for a family with nothing visible', () => {
    expect(ids(buildGridEntries(COLLECTIONS.filter((c) => c.id === 'CUTY')))).toEqual(['CUTY'])
  })

  it('survives an empty or missing list', () => {
    expect(buildGridEntries([])).toEqual([])
    expect(buildGridEntries(undefined)).toEqual([])
  })
})

describe('familyForCollectionId', () => {
  it('maps a member back to its family', () => {
    expect(familyForCollectionId('SI3').id).toBe('FAM_SIENNA')
    expect(familyForCollectionId('MNH').id).toBe('FAM_MOONLIGHT')
    expect(familyForCollectionId('SSPF').id).toBe('FAM_SHAPY_SPARKLE')
    expect(familyForCollectionId('SSF').id).toBe('FAM_SHAPY_SHINE')
    expect(familyForCollectionId('M5_NECK').id).toBe('FAM_MULTI_NECK')
  })

  it('returns null for a solo collection and for nonsense', () => {
    expect(familyForCollectionId('CUTY')).toBeNull()
    expect(familyForCollectionId('SSRD')).toBeNull()
    expect(familyForCollectionId('NOPE')).toBeNull()
    expect(familyForCollectionId(undefined)).toBeNull()
  })
})
