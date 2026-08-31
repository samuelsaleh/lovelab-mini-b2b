/**
 * Tests for the 2026 new necklace SKUs:
 *   CUBIX / Matchy Fancy / Shapy Sparkle / Holy.
 *
 * Locks in the agreed rules:
 *   - Pricing: B2B = bracelet B2B × 1.20 (exact); B2C = bracelet retail × 1.20
 *     rounded UP to the nearest €5. Identical across 2025 and 2026.
 *   - Colours: CUBIX, Matchy + Shapy Sparkle necklaces use the full 21-colour
 *     nylon palette (not silk); Holy is the same nylon palette capped to 4.
 *   - Shapy Sparkle necklace: a single product, IGI, prong, only 0.70 + 1.00 ct.
 *   - Cert: all new necklaces are IGI only.
 *   - Rollout: all are visible to everyone (not admin-only).
 *   - Packshots reuse the source bracelet images.
 */

const {
  COLLECTIONS,
  getPrice,
  getRetail,
  getProductType,
  getAvailableCerts,
  getCollectionsByType,
  getVisibleCollections,
  isAdminOnlyCollection,
  SIZES_NECKLACE,
  SHAPES_MATCHY,
  SHAPES_SHAPY_SPARKLE,
  SHAPES_HOLY,
  CORD_COLORS,
  calculateQuote,
} = require('../catalog')
const { findPackshot, getCollectionLabel } = require('../packshot-lookup')
const { findCollection } = require('../orderRowValidation')

const byId = (id) => COLLECTIONS.find((c) => c.id === id)

const CUBIX_NECK = byId('CUBIX_NECK')
const MF_NECK = byId('MF_NECK')
const SSPF_NECK = byId('SSPF_NECK')
const HOLY_NECK = byId('HOLY_NECK')

const ALL_NEW = [CUBIX_NECK, MF_NECK, SSPF_NECK, HOLY_NECK]

// ─── Existence + shared shape ────────────────────────────────────────────────

describe('new necklaces — existence and common attributes', () => {
  it('all four new SKUs exist', () => {
    for (const c of ALL_NEW) expect(c).toBeTruthy()
  })

  it('are all tagged productType: necklace and use the grouped necklace sizes', () => {
    for (const c of ALL_NEW) {
      expect(getProductType(c)).toBe('necklace')
      expect(c.sizes).toEqual(SIZES_NECKLACE)
    }
  })

  it('expose the agreed carats', () => {
    expect(CUBIX_NECK.carats).toEqual(['0.05', '0.10', '0.20'])
    expect(MF_NECK.carats).toEqual(['0.60', '1.00'])
    // Shapy Sparkle necklace exists ONLY in 0.70 + 1.00 ct.
    expect(SSPF_NECK.carats).toEqual(['0.70', '1.00'])
    expect(HOLY_NECK.carats).toEqual(['0.50', '0.70', '1.00'])
  })

  it('reuse the source bracelet housing and shapes', () => {
    expect(CUBIX_NECK.housing).toBe('goldMetal')
    expect(MF_NECK.housing).toBe('matchy')
    expect(MF_NECK.shapes).toEqual(SHAPES_MATCHY)
    // Shapy Sparkle necklace is prong-only (no bezel) with the full shape set.
    expect(SSPF_NECK.housing).toBe('sparkleProng')
    expect(SSPF_NECK.shapes).toEqual(SHAPES_SHAPY_SPARKLE)
    expect(HOLY_NECK.housing).toBe('standard')
    expect(HOLY_NECK.shapes).toEqual(SHAPES_HOLY)
  })
})

// ─── Certificates ────────────────────────────────────────────────────────────

describe('new necklaces — certificates', () => {
  it('every new necklace is IGI only', () => {
    for (const c of ALL_NEW) {
      expect(c.certificate).toBe('igi')
      expect(getAvailableCerts(c, 0, '2026')).toEqual(['igi'])
    }
  })
})

// ─── Cord / colour palettes ──────────────────────────────────────────────────

describe('new necklaces — cord palettes', () => {
  it('CUBIX, Matchy + Shapy Sparkle necklaces use the full nylon palette (no cap)', () => {
    for (const c of [CUBIX_NECK, MF_NECK, SSPF_NECK]) {
      expect(c.cord).toBe('nylon')
      expect(c.allowedColors).toBeUndefined()
    }
    expect(CORD_COLORS.nylon).toHaveLength(21)
  })

  it('Holy necklace is Nylon thread (not silk) capped to exactly 4 colours', () => {
    expect(HOLY_NECK.cord).toBe('nylon')
    expect(HOLY_NECK.allowedColors).toEqual(['Silver Grey', 'Black', 'Red', 'Ivory'])
    // Every capped colour must exist in the nylon palette.
    const nylonNames = CORD_COLORS.nylon.map((c) => c.n)
    for (const name of HOLY_NECK.allowedColors) {
      expect(nylonNames).toContain(name)
    }
  })
})

// ─── Prices (B2B exact ×1.20, B2C rounded up to 5) ────────────────────────────
// Identical on both lists except SSPF_NECK, which follows the Aug 2026 Shapy
// Sparkle bracelet reprice on the 2026 list (bracelet 400/600 B2B, 750/1200
// B2C, ×1.20) and keeps its launch prices on 2025.

describe('new necklaces — prices', () => {
  const EXPECTED = {
    CUBIX_NECK: { b2b: [36, 48, 84], retail: [145, 190, 410] },
    MF_NECK: { b2b: [240, 372], retail: [660, 1065] },
    SSPF_NECK: { b2b: [288, 390], retail: [660, 1020] },
    HOLY_NECK: { b2b: [312, 510, 660], retail: [780, 1200, 1590] },
  }
  const EXPECTED_2026 = {
    ...EXPECTED,
    SSPF_NECK: { b2b: [480, 720], retail: [900, 1440] },
  }

  for (const [year, expected] of [['2025', EXPECTED], ['2026', EXPECTED_2026]]) {
    for (const c of ALL_NEW) {
      const cert = c.certificate
      it(`${c.id} ${year} B2B + retail`, () => {
        expect(c.carats.map((_, i) => getPrice(c, i, cert, year))).toEqual(expected[c.id].b2b)
        expect(c.carats.map((_, i) => getRetail(c, i, cert, year))).toEqual(expected[c.id].retail)
      })
    }
  }

  // SSPF_NECK is the exception: the Aug 2026 Shapy Sparkle reprice lands on
  // the 2026 list only, so its 2025 bucket keeps the launch prices.
  it('2025 and 2026 are identical for every new necklace except SSPF_NECK', () => {
    for (const c of ALL_NEW.filter((c) => c.id !== 'SSPF_NECK')) {
      const cert = c.certificate
      expect(c.carats.map((_, i) => getPrice(c, i, cert, '2025')))
        .toEqual(c.carats.map((_, i) => getPrice(c, i, cert, '2026')))
      expect(c.carats.map((_, i) => getRetail(c, i, cert, '2025')))
        .toEqual(c.carats.map((_, i) => getRetail(c, i, cert, '2026')))
    }
  })

  it('B2B follows bracelet × 1.20 exactly (spot-check)', () => {
    const SSPF = byId('SSPF') // [240, 325]
    expect(SSPF_NECK.carats.map((_, i) => getPrice(SSPF_NECK, i, 'igi', '2026')))
      .toEqual(SSPF.carats.map((_, i) => Math.round(getPrice(SSPF, i, 'igi', '2026') * 1.2)))
  })
})

// ─── Rollout: visible to everyone (not preview-gated) ────────────────────────

describe('new necklaces — visible to everyone', () => {
  it('no new necklace is flagged admin-only', () => {
    for (const c of ALL_NEW) expect(isAdminOnlyCollection(c.id)).toBe(false)
  })

  it('both admins and non-admins see every new necklace', () => {
    const nonAdmin = getVisibleCollections(false).map((c) => c.id)
    const admin = getVisibleCollections(true).map((c) => c.id)
    for (const c of ALL_NEW) {
      expect(nonAdmin).toContain(c.id)
      expect(admin).toContain(c.id)
    }
  })

  it('appear under the necklace product-type filter', () => {
    const necks = getCollectionsByType(COLLECTIONS, 'necklace').map((c) => c.id)
    for (const c of ALL_NEW) expect(necks).toContain(c.id)
  })
})

// ─── Packshots + label resolution ────────────────────────────────────────────

describe('new necklaces — packshots and labels', () => {
  it('use dedicated supplied necklace packshots where available', () => {
    expect(findPackshot('CUBIX_NECK', { color: 'Black' })).toContain('/Packshot%20Folder/Necklaces/')
    expect(findPackshot('MF_NECK', { color: 'Black', shape: 'Heart' })).toContain('/Packshot%20Folder/Necklaces/')
  })

  it('uses dedicated Shapy Sparkle packshots where supplied and keeps fallbacks for missing shapes', () => {
    expect(findPackshot('SSPF_NECK', { color: 'Black', shape: 'Round' })).toContain('/Packshot%20Folder/Necklaces/')
    expect(findPackshot('SSPF_NECK', { color: 'Black', shape: 'Cushion' })).toEqual(findPackshot('SSPF', { color: 'Black', shape: 'Cushion' }))
    expect(findPackshot('HOLY_NECK', { color: 'Red' })).toEqual(findPackshot('HOLY', { color: 'Red' }))
  })

  it('expose readable labels', () => {
    expect(getCollectionLabel('CUBIX_NECK')).toBe('CUBIX NECKLACE')
    expect(getCollectionLabel('MF_NECK')).toBe('MATCHY FANCY NECKLACE')
    expect(getCollectionLabel('SSPF_NECK')).toBe('SHAPY SPARKLE NECKLACE')
    expect(getCollectionLabel('HOLY_NECK')).toBe('HOLY NECKLACE')
  })

  it('resolve their labels without colliding with the bracelet', () => {
    expect(findCollection('CUBIX NECKLACE')?.id).toBe('CUBIX_NECK')
    expect(findCollection('CUBIX')?.id).toBe('CUBIX')
    expect(findCollection('HOLY NECKLACE')?.id).toBe('HOLY_NECK')
    expect(findCollection('HOLY (D VVS)')?.id).toBe('HOLY')
  })
})

// ─── calculateQuote ──────────────────────────────────────────────────────────

describe('new necklaces — calculateQuote', () => {
  it('prices a Holy necklace line (with shape) correctly', () => {
    const result = calculateQuote([
      { collectionId: 'HOLY_NECK', colorConfigs: [
        { id: 'c1', colorName: 'Red', caratIdx: 0, housing: 'Yellow', shape: 'Cross', size: 'S/M', qty: 2 },
      ] },
    ])
    expect(result.lines).toHaveLength(1)
    const ln = result.lines[0]
    expect(ln.product).toBe('HOLY NECKLACE')
    expect(ln.shape).toBe('Cross')
    expect(ln.unitB2B).toBe(312)
    expect(ln.retailUnit).toBe(780)
    expect(ln.lineTotal).toBe(624)
  })

  it('prices a Shapy Sparkle necklace line (IGI, with shape) correctly', () => {
    const result = calculateQuote([
      { collectionId: 'SSPF_NECK', colorConfigs: [
        { id: 'c1', colorName: 'Black', caratIdx: 0, shape: 'Round', size: 'L/XL', qty: 1 },
      ] },
    ])
    const ln = result.lines[0]
    expect(ln.product).toBe('SHAPY SPARKLE NECKLACE')
    expect(ln.certType).toBe('igi')
    expect(ln.shape).toBe('Round')
    expect(ln.unitB2B).toBe(480)
    expect(ln.retailUnit).toBe(900)
  })
})
