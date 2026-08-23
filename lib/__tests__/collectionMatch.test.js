/**
 * Unit tests for lib/collectionMatch.js
 *
 * The two strictnesses matter: Quick Stats drops anything that is not an exact
 * catalogue match, while Top Products accepts a substring. These tests pin
 * that difference (it is a real source of "the panels disagree") and guard the
 * longest-match rule that stops overlapping labels stealing each other's rows.
 */

const { COLLECTIONS } = require('../catalog')
const { exactCollection, isKnownCollection, matchCollectionLabel } = require('../collectionMatch')

describe('exactCollection / isKnownCollection', () => {
  it('matches a catalogue label case-insensitively', () => {
    expect(isKnownCollection('MULTI THREE')).toBe(true)
    expect(isKnownCollection('multi three')).toBe(true)
    expect(isKnownCollection('  Multi Three  ')).toBe(true)
  })

  it('matches a catalogue id', () => {
    expect(isKnownCollection('M3')).toBe(true)
    expect(isKnownCollection('m3')).toBe(true)
    expect(exactCollection('M3').label).toBe('MULTI THREE')
  })

  it('rejects blanks and unknown names', () => {
    expect(isKnownCollection('')).toBe(false)
    expect(isKnownCollection(null)).toBe(false)
    expect(isKnownCollection(undefined)).toBe(false)
    expect(isKnownCollection('   ')).toBe(false)
    expect(isKnownCollection('SOMETHING RETIRED')).toBe(false)
  })

  it('rejects a name that only contains a catalogue label', () => {
    // This is the Quick Stats blind spot: counted by Top Products, dropped here.
    expect(isKnownCollection('MULTI THREE 0.30ct')).toBe(false)
  })

  it('recognises every collection currently in the catalogue', () => {
    for (const c of COLLECTIONS) {
      expect(isKnownCollection(c.label)).toBe(true)
      expect(isKnownCollection(c.id)).toBe(true)
    }
  })
})

describe('matchCollectionLabel', () => {
  it('returns the canonical label for an exact match', () => {
    expect(matchCollectionLabel('MULTI THREE')).toBe('MULTI THREE')
    expect(matchCollectionLabel('M3')).toBe('MULTI THREE')
  })

  it('rolls a decorated name up to its collection', () => {
    expect(matchCollectionLabel('MULTI THREE 0.30ct')).toBe('MULTI THREE')
    expect(matchCollectionLabel('Sienna One - white')).toBe('Sienna One')
  })

  it('prefers the longest matching label so overlapping names cannot steal rows', () => {
    expect(matchCollectionLabel('SHAPY SPARKLE FANCY 0.70')).toBe('SHAPY SPARKLE FANCY')
    expect(matchCollectionLabel('SHAPY SHINE FANCY extra')).toBe('SHAPY SHINE FANCY')
    expect(matchCollectionLabel('SHAPY SPARKLE D VVS 1.00')).toBe('SHAPY SPARKLE D VVS')
    expect(matchCollectionLabel('SHAPY SPARKLE RND D VVS 1.00')).toBe('SHAPY SPARKLE D VVS')
  })

  it('still matches the old D VVS names used on saved quotes', () => {
    expect(isKnownCollection('SHAPY SPARKLE RND D VVS')).toBe(true)
    expect(isKnownCollection('SHAPY SPARKLE ROUND(D VVS)')).toBe(true)
    expect(exactCollection('SHAPY SPARKLE RND D VVS').id).toBe('SSRD')
    expect(matchCollectionLabel('SHAPY SPARKLE ROUND(D VVS)')).toBe('SHAPY SPARKLE D VVS')
  })

  it('returns null when nothing matches', () => {
    expect(matchCollectionLabel('BRACELET CUSTOM')).toBeNull()
    expect(matchCollectionLabel('')).toBeNull()
    expect(matchCollectionLabel(null)).toBeNull()
  })

  it('never returns a label that is not in the catalogue', () => {
    const labels = new Set(COLLECTIONS.map((c) => c.label))
    for (const name of ['MULTI THREE 0.30ct', 'M3 extra', 'Sienna Five xl', 'HOLY (D VVS)']) {
      const match = matchCollectionLabel(name)
      if (match !== null) expect(labels.has(match)).toBe(true)
    }
  })
})
