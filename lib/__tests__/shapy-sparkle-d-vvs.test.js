/**
 * Shapy Sparkle D VVS (SSRD) — rename, cert-by-size, shapes, housing, prices.
 *
 * Pins the Aug 2026 refonte: the id stays SSRD, the label drops RND, Long
 * Cushion is gone, Prong/Bezel is a real choice, and 2026/October prices
 * live under the cert that size actually ships with.
 */

const {
  COLLECTIONS,
  SHAPES_SHAPY_SPARKLE,
  SHAPES_SHAPY_SPARKLE_D_VVS,
  getAvailableCerts,
  getDefaultCert,
  getPrice,
  getRetail,
} = require('../catalog')
const { matchCollectionLabel, isKnownCollection } = require('../collectionMatch')
const { familyForCollectionId } = require('../collectionFamilies')

const SSRD = COLLECTIONS.find((c) => c.id === 'SSRD')
const SSPF = COLLECTIONS.find((c) => c.id === 'SSPF')

describe('SHAPY SPARKLE D VVS — identity', () => {
  it('keeps id SSRD and labels the collection without RND', () => {
    expect(SSRD).toBeTruthy()
    expect(SSRD.label).toBe('SHAPY SPARKLE D VVS')
  })

  it('still matches the old names used on saved quotes and packs', () => {
    expect(isKnownCollection('SHAPY SPARKLE RND D VVS')).toBe(true)
    expect(isKnownCollection('SHAPY SPARKLE ROUND(D VVS)')).toBe(true)
    expect(matchCollectionLabel('SHAPY SPARKLE RND D VVS 1.00')).toBe('SHAPY SPARKLE D VVS')
  })
})

describe('SHAPY SPARKLE D VVS — shapes and housing', () => {
  it('drops Long Cushion for D VVS only', () => {
    expect(SHAPES_SHAPY_SPARKLE_D_VVS).not.toContain('Long Cushion')
    expect(SSRD.shapes).toEqual(SHAPES_SHAPY_SPARKLE_D_VVS)
    expect(SSPF.shapes).toContain('Long Cushion')
    expect(SHAPES_SHAPY_SPARKLE).toContain('Long Cushion')
  })

  it('requires a real Prong or Bezel choice', () => {
    expect(SSRD.housing).toBe('sparkleProngBezel')
    expect(SSPF.housing).toBe('sparkleProng')
  })
})

describe('SHAPY SPARKLE D VVS — cert by size', () => {
  it('is In-house at 0.50 / 0.70 and IGI at 1.00 on 2026', () => {
    expect(getAvailableCerts(SSRD, 0, '2026')).toEqual(['inhouse'])
    expect(getAvailableCerts(SSRD, 1, '2026')).toEqual(['inhouse'])
    expect(getAvailableCerts(SSRD, 2, '2026')).toEqual(['igi'])
    expect(getDefaultCert(SSRD, 0, '2026')).toBe('inhouse')
    expect(getDefaultCert(SSRD, 2, '2026')).toBe('igi')
  })

  it('cannot price 0.50 as IGI on 2026', () => {
    expect(getPrice(SSRD, 0, 'igi', '2026')).toBe(0)
    expect(getRetail(SSRD, 0, 'igi', '2026')).toBe(0)
    expect(getPrice(SSRD, 0, 'inhouse', '2026')).toBe(200)
  })

  it('leaves 2025 IGI-only at every size', () => {
    expect(getAvailableCerts(SSRD, 0, '2025')).toEqual(['igi'])
    expect(getAvailableCerts(SSRD, 2, '2025')).toEqual(['igi'])
    expect(getPrice(SSRD, 0, 'igi', '2025')).toBe(180)
    expect(getPrice(SSRD, 1, 'igi', '2025')).toBe(200)
    expect(getPrice(SSRD, 2, 'igi', '2025')).toBe(285)
  })

  it('inherits the same 2026 prices on the October list', () => {
    expect(getPrice(SSRD, 0, 'inhouse', '2026-10')).toBe(200)
    expect(getPrice(SSRD, 1, 'inhouse', '2026-10')).toBe(300)
    expect(getPrice(SSRD, 2, 'igi', '2026-10')).toBe(400)
    expect(getRetail(SSRD, 2, 'igi', '2026-10')).toBe(1200)
  })
})

describe('SHAPY SPARKLE D VVS — family', () => {
  it('stays a solo card; Fancy is the Shapy Sparkle folder', () => {
    expect(familyForCollectionId('SSPF').id).toBe('FAM_SHAPY_SPARKLE')
    expect(familyForCollectionId('SSRD')).toBeNull()
  })
})
