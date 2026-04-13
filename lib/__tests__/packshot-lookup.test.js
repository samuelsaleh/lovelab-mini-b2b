import { findPackshot, getCollectionImages, getCollectionFilters, getAllCollectionIds, getCollectionLabel } from '../packshot-lookup'

describe('findPackshot', () => {
  test('returns null for unknown collection', () => {
    expect(findPackshot('UNKNOWN_COLL')).toBeNull()
  })

  test('returns a URL for a known collection with no filters', () => {
    const url = findPackshot('CUTY')
    expect(url).toBeTruthy()
    expect(url).toMatch(/^\/Packshot/)
  })

  test('filters by housing', () => {
    const url = findPackshot('CUTY', { housing: 'WG' })
    if (url) {
      const images = getCollectionImages('CUTY', { housing: 'WG' })
      expect(images.some(img => img.url === url)).toBe(true)
    }
  })

  test('filters by housing using alias (White -> WG)', () => {
    const urlAlias = findPackshot('CUBIX', { housing: 'White' })
    const urlDirect = findPackshot('CUBIX', { housing: 'WG' })
    expect(urlAlias).toEqual(urlDirect)
  })

  test('filters by color (exact match)', () => {
    const url = findPackshot('CUTY', { housing: 'RG', color: 'Black' })
    if (url) {
      expect(url).toMatch(/Black/i)
    }
  })

  test('falls back to first image when color not found', () => {
    const url = findPackshot('CUTY', { housing: 'RG', color: 'NonexistentColor12345' })
    expect(url).toBeTruthy()
    const allRG = getCollectionImages('CUTY', { housing: 'RG' })
    if (allRG.length > 0) {
      expect(url).toEqual(allRG[0].url)
    }
  })

  test('Multi collections only contain allowed colors', () => {
    const ALLOWED = ['Red', 'Bordeaux', 'Gold', 'Silver Grey', 'Black', 'Navy Blue']
    for (const colId of ['M3', 'M4', 'M5']) {
      const images = getCollectionImages(colId)
      for (const img of images) {
        if (img.color) {
          expect(ALLOWED).toContain(img.color)
        }
      }
    }
  })

  test('shape parameter narrows results for Matchy/Shapy', () => {
    const heartUrl = findPackshot('MF', { shape: 'Heart' })
    const emeraldUrl = findPackshot('MF', { shape: 'Emerald' })
    if (heartUrl && emeraldUrl) {
      expect(heartUrl).not.toEqual(emeraldUrl)
    }
  })

  test('subgroup parameter narrows M3 results', () => {
    const attached = findPackshot('M3', { subgroup: 'Attached' })
    const detached = findPackshot('M3', { subgroup: 'Detached' })
    if (attached && detached) {
      expect(attached).not.toEqual(detached)
    }
  })
})

describe('getCollectionImages', () => {
  test('returns array for known collection', () => {
    const images = getCollectionImages('CUTY')
    expect(Array.isArray(images)).toBe(true)
    expect(images.length).toBeGreaterThan(0)
  })

  test('returns empty array for unknown collection', () => {
    expect(getCollectionImages('NOPE')).toEqual([])
  })

  test('filters by housing', () => {
    const wg = getCollectionImages('CUTY', { housing: 'WG' })
    wg.forEach(img => expect(img.housing).toBe('WG'))
  })
})

describe('getCollectionFilters', () => {
  test('returns housings, shapes, subgroups', () => {
    const filters = getCollectionFilters('MF')
    expect(filters.housings.length).toBeGreaterThan(0)
    expect(filters.shapes.length).toBeGreaterThan(0)
  })

  test('returns empty for unknown collection', () => {
    const filters = getCollectionFilters('NOPE')
    expect(filters.housings).toEqual([])
    expect(filters.shapes).toEqual([])
    expect(filters.subgroups).toEqual([])
  })
})

describe('getAllCollectionIds', () => {
  test('includes known collections', () => {
    const ids = getAllCollectionIds()
    expect(ids).toContain('CUTY')
    expect(ids).toContain('CUBIX')
  })
})

describe('getCollectionLabel', () => {
  test('returns label for known ID', () => {
    expect(getCollectionLabel('CUTY')).toBe('CUTY')
    expect(getCollectionLabel('M3')).toBe('MULTI THREE')
  })

  test('returns ID itself for unknown', () => {
    expect(getCollectionLabel('UNKNOWN')).toBe('UNKNOWN')
  })
})
