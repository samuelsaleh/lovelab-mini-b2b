/**
 * Tests for the necklace product line (Cuty / Multi Three / Multi Four).
 *
 * Covers:
 *   - The 3 new IGI-only necklace collections (carats, prices, retail, colours).
 *   - productType helpers + Bracelet/Necklace filtering.
 *   - Necklace size cm metadata + the product-type-aware size label.
 *   - calculateQuote with necklace lines.
 *   - Packshot aliasing (necklace ids reuse bracelet images).
 *   - Order-row validation for necklace rows.
 *   - Bracelet regressions (existing CUTY values + silk size labels unchanged).
 */

const {
  COLLECTIONS,
  calculateQuote,
  getPrice,
  getRetail,
  getAvailableCerts,
  getProductType,
  getCollectionsByType,
  getVisibleCollections,
  necklaceSizeLabel,
  sizeDisplayLabel,
  NECKLACE_SIZE_INFO,
  SIZES_NECKLACE,
  SHAPES_SHAPY_SHINE,
  CORD_COLORS,
} = require('../catalog')

const { findPackshot, getCollectionLabel } = require('../packshot-lookup')
const { validateRow, findCollection } = require('../orderRowValidation')

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
const CUBIX = COLLECTIONS.find(c => c.id === 'CUBIX')
const CUTY_NECK = COLLECTIONS.find(c => c.id === 'CUTY_NECK')
const M3_NECK = COLLECTIONS.find(c => c.id === 'M3_NECK')
const M4_NECK = COLLECTIONS.find(c => c.id === 'M4_NECK')
const SSF_NECK = COLLECTIONS.find(c => c.id === 'SSF_NECK')

// ─── Collection definitions ──────────────────────────────────────────────────

describe('necklace collections', () => {
  it('all three necklace collections exist', () => {
    expect(CUTY_NECK).toBeTruthy()
    expect(M3_NECK).toBeTruthy()
    expect(M4_NECK).toBeTruthy()
  })

  it('are all tagged productType: necklace', () => {
    expect(getProductType(CUTY_NECK)).toBe('necklace')
    expect(getProductType(M3_NECK)).toBe('necklace')
    expect(getProductType(M4_NECK)).toBe('necklace')
  })

  it('are IGI-only (no in-house cert offered)', () => {
    expect(CUTY_NECK.certificate).toBe('igi')
    expect(M3_NECK.certificate).toBe('igi')
    expect(M4_NECK.certificate).toBe('igi')
    expect(getAvailableCerts(CUTY_NECK, 0, '2026')).toEqual(['igi'])
    expect(getAvailableCerts(M3_NECK, 0, '2026')).toEqual(['igi'])
    expect(getAvailableCerts(M4_NECK, 0, '2026')).toEqual(['igi'])
  })

  it('expose the agreed carats', () => {
    expect(CUTY_NECK.carats).toEqual(['0.10', '0.20', '0.30'])
    expect(M3_NECK.carats).toEqual(['0.15', '0.30', '0.60'])
    expect(M4_NECK.carats).toEqual(['0.20', '0.40'])
  })

  it('use the grouped necklace sizes', () => {
    expect(CUTY_NECK.sizes).toEqual(SIZES_NECKLACE)
    expect(M3_NECK.sizes).toEqual(['S/M', 'L/XL'])
    expect(M4_NECK.sizes).toEqual(['S/M', 'L/XL'])
  })

  it('reuse the bracelet housing types', () => {
    expect(CUTY_NECK.housing).toBe('standard')
    expect(M3_NECK.housing).toBe('multiThree')
    expect(M4_NECK.housing).toBe('goldMetal')
  })

  it('CUTY necklace exposes the full nylon palette (no colour cap)', () => {
    // CUTY necklace is no longer restricted — it inherits the full nylon palette
    // (~21 colours), matching the CUTY bracelet.
    expect(CUTY_NECK.allowedColors).toBeUndefined()
    expect(CORD_COLORS.nylon.length).toBeGreaterThanOrEqual(20)
  })

  it('Multi Three / Four keep their agreed 6-colour palette', () => {
    const multiColors = ['Silver Grey', 'Gold', 'Bordeaux', 'Red', 'Black', 'Navy Blue']
    expect(M3_NECK.allowedColors).toEqual(multiColors)
    expect(M4_NECK.allowedColors).toEqual(multiColors)
  })
})

// ─── Prices (both pricelist years are identical for new products) ─────────────

describe('necklace prices (B2B / retail)', () => {
  for (const year of ['2025', '2026']) {
    it(`CUTY necklace ${year}`, () => {
      expect(CUTY_NECK.carats.map((_, i) => getPrice(CUTY_NECK, i, 'igi', year))).toEqual([50, 88, 125])
      expect(CUTY_NECK.carats.map((_, i) => getRetail(CUTY_NECK, i, 'igi', year))).toEqual([195, 395, 540])
    })
    it(`Multi Three necklace ${year}`, () => {
      expect(M3_NECK.carats.map((_, i) => getPrice(M3_NECK, i, 'igi', year))).toEqual([81, 119, 219])
      expect(M3_NECK.carats.map((_, i) => getRetail(M3_NECK, i, 'igi', year))).toEqual([325, 500, 1000])
    })
    it(`Multi Four necklace ${year}`, () => {
      expect(M4_NECK.carats.map((_, i) => getPrice(M4_NECK, i, 'igi', year))).toEqual([106, 138])
      expect(M4_NECK.carats.map((_, i) => getRetail(M4_NECK, i, 'igi', year))).toEqual([450, 625])
    })
  }
})

// ─── productType helpers + filtering ─────────────────────────────────────────

describe('product type filtering', () => {
  it('getProductType defaults missing field to bracelet', () => {
    expect(getProductType(CUTY)).toBe('bracelet')
    expect(getProductType(undefined)).toBe('bracelet')
  })

  it('getCollectionsByType("necklace") returns exactly the necklace collections', () => {
    const necks = getCollectionsByType(COLLECTIONS, 'necklace').map(c => c.id).sort()
    expect(necks).toEqual(['CUTY_NECK', 'M3_NECK', 'M4_NECK', 'SSF_NECK'])
  })

  it('getCollectionsByType("bracelet") excludes the necklaces but keeps CUTY', () => {
    const ids = getCollectionsByType(COLLECTIONS, 'bracelet').map(c => c.id)
    expect(ids).toContain('CUTY')
    expect(ids).not.toContain('CUTY_NECK')
    expect(ids).not.toContain('M3_NECK')
  })

  it('necklaces are visible to non-admins (not preview-gated)', () => {
    const ids = getVisibleCollections(false).map(c => c.id)
    expect(ids).toContain('CUTY_NECK')
    expect(ids).toContain('M3_NECK')
    expect(ids).toContain('M4_NECK')
  })
})

// ─── Size labels + cm metadata ───────────────────────────────────────────────

describe('necklace size labels', () => {
  it('exposes the cm metadata', () => {
    expect(NECKLACE_SIZE_INFO['S/M']).toEqual({ normalCm: 22, maxCm: 62 })
    expect(NECKLACE_SIZE_INFO['L/XL']).toEqual({ normalCm: 24, maxCm: 64 })
  })

  it('necklaceSizeLabel renders worn + max opening', () => {
    expect(necklaceSizeLabel('S/M')).toBe('S/M — 22 cm (max 62 cm)')
    expect(necklaceSizeLabel('L/XL')).toBe('L/XL — 24 cm (max 64 cm)')
    expect(necklaceSizeLabel('M')).toBe('')
  })

  it('sizeDisplayLabel adds cm for necklaces only', () => {
    expect(sizeDisplayLabel(CUTY_NECK, 'S/M')).toBe('S/M — 22 cm (max 62 cm)')
    // CUBIX is a silk bracelet that reuses the S/M label — must NOT show necklace cm.
    expect(sizeDisplayLabel(CUBIX, 'S/M')).toBe('S/M')
    expect(sizeDisplayLabel(CUTY, 'M')).toBe('M')
  })
})

// ─── calculateQuote ──────────────────────────────────────────────────────────

describe('calculateQuote with necklace lines', () => {
  it('prices a CUTY necklace line correctly', () => {
    const result = calculateQuote([
      { collectionId: 'CUTY_NECK', colorConfigs: [
        { id: 'c1', colorName: 'Black', caratIdx: 0, housing: 'Yellow', size: 'S/M', qty: 2 },
      ] },
    ])
    expect(result.lines).toHaveLength(1)
    const ln = result.lines[0]
    expect(ln.product).toBe('CUTY NECKLACE')
    expect(ln.certType).toBe('igi')
    expect(ln.unitB2B).toBe(50)
    expect(ln.lineTotal).toBe(100)
    expect(ln.retailUnit).toBe(195)
    expect(result.total).toBe(100)
  })

  it('prices a Multi Three necklace (attached) line correctly', () => {
    const result = calculateQuote([
      { collectionId: 'M3_NECK', colorConfigs: [
        { id: 'c1', colorName: 'Gold', caratIdx: 2, housing: 'YYY', multiAttached: true, size: 'L/XL', qty: 1 },
      ] },
    ])
    const ln = result.lines[0]
    expect(ln.unitB2B).toBe(219)
    expect(ln.multiAttached).toBe(true)
    expect(ln.size).toBe('L/XL')
  })
})

// ─── Packshot aliasing ───────────────────────────────────────────────────────

describe('necklace packshots', () => {
  it('necklace ids reuse the bracelet images', () => {
    expect(findPackshot('CUTY_NECK', { color: 'Black' })).toEqual(findPackshot('CUTY', { color: 'Black' }))
    expect(findPackshot('M3_NECK', { color: 'Gold' })).toEqual(findPackshot('M3', { color: 'Gold' }))
    expect(findPackshot('M4_NECK', { color: 'Red' })).toEqual(findPackshot('M4', { color: 'Red' }))
  })

  it('exposes readable labels', () => {
    expect(getCollectionLabel('CUTY_NECK')).toBe('CUTY NECKLACE')
    expect(getCollectionLabel('M3_NECK')).toBe('MULTI THREE NECKLACE')
    expect(getCollectionLabel('M4_NECK')).toBe('MULTI FOUR NECKLACE')
  })
})

// ─── Order-row validation ────────────────────────────────────────────────────

describe('necklace order-row validation', () => {
  it('resolves necklace labels to the right collection', () => {
    expect(findCollection('CUTY NECKLACE')?.id).toBe('CUTY_NECK')
    expect(findCollection('MULTI THREE NECKLACE')?.id).toBe('M3_NECK')
    // Bracelet labels still resolve to the bracelet, not the necklace.
    expect(findCollection('CUTY')?.id).toBe('CUTY')
    expect(findCollection('MULTI THREE')?.id).toBe('M3')
  })

  it('accepts a complete CUTY necklace row', () => {
    const col = findCollection('CUTY NECKLACE')
    const row = { quantity: '5', collection: 'CUTY NECKLACE', carat: '0.10', unitPrice: '50', bpColor: 'Yellow', size: 'S/M', colorCord: 'Black' }
    expect(validateRow(row, col).ok).toBe(true)
  })

  it('flags a CUTY necklace row missing size', () => {
    const col = findCollection('CUTY NECKLACE')
    const row = { quantity: '5', collection: 'CUTY NECKLACE', carat: '0.10', unitPrice: '50', bpColor: 'Yellow', colorCord: 'Black' }
    const res = validateRow(row, col)
    expect(res.ok).toBe(false)
    expect(res.missing).toContain('size')
  })

  it('requires setting (attached/detached) + housing for Multi Three necklace', () => {
    const col = findCollection('MULTI THREE NECKLACE')
    const incomplete = { quantity: '2', collection: 'MULTI THREE NECKLACE', carat: '0.15', unitPrice: '81', size: 'S/M', colorCord: 'Gold' }
    const res = validateRow(incomplete, col)
    expect(res.ok).toBe(false)
    expect(res.missing).toEqual(expect.arrayContaining(['setting', 'bpColor']))

    const complete = { ...incomplete, setting: 'F', bpColor: 'YYY' }
    expect(validateRow(complete, col).ok).toBe(true)
  })
})

// ─── Bracelet regressions ────────────────────────────────────────────────────

describe('bracelet regressions (unchanged)', () => {
  it('CUTY bracelet keeps its carats, both certs, and 2026 prices', () => {
    expect(CUTY.carats).toEqual(['0.05', '0.10', '0.20', '0.30'])
    expect(CUTY.certificate).toBe('both')
    expect(CUTY.carats.map((_, i) => getPrice(CUTY, i, 'igi', '2026'))).toEqual([30, 40, 70, 100])
    expect(getProductType(CUTY)).toBe('bracelet')
  })
})

// ─── Shapy Shine necklace ─────────────────────────────────────────────────────

describe('Shapy Shine necklace collection', () => {
  it('exists, is a necklace, and is IGI-only', () => {
    expect(SSF_NECK).toBeTruthy()
    expect(getProductType(SSF_NECK)).toBe('necklace')
    expect(SSF_NECK.certificate).toBe('igi')
    expect(getAvailableCerts(SSF_NECK, 0, '2026')).toEqual(['igi'])
  })

  it('has the right label, carats, sizes, cord and Shapy Shine housing', () => {
    expect(SSF_NECK.label).toBe('SHAPY SHINE NECKLACE')
    expect(SSF_NECK.carats).toEqual(['0.10', '0.30', '0.50'])
    expect(SSF_NECK.sizes).toEqual(SIZES_NECKLACE)
    // Same bezel/prong + metal housing as the SSF bracelet. The shape is locked
    // from the selection grid (shape cards), not picked in the config.
    expect(SSF_NECK.housing).toBe('shapyShine')
    expect(SSF_NECK.cord).toBe('shine')
  })

  it('exposes all 7 Shapy Shine shapes', () => {
    expect(SSF_NECK.shapes).toEqual(SHAPES_SHAPY_SHINE)
    expect(SSF_NECK.shapes).toHaveLength(7)
  })

  it('exposes the full Shine palette (no colour cap)', () => {
    // No longer restricted — inherits the full Shine palette (~21 colours),
    // matching the Shapy Shine Fancy bracelet.
    expect(SSF_NECK.allowedColors).toBeUndefined()
    expect(CORD_COLORS.shine.length).toBeGreaterThanOrEqual(20)
  })

  it('prices at SSF +20% (B2B exact, retail rounded up to 5), identical both years', () => {
    for (const year of ['2025', '2026']) {
      expect(SSF_NECK.carats.map((_, i) => getPrice(SSF_NECK, i, 'igi', year))).toEqual([66, 120, 186])
      expect(SSF_NECK.carats.map((_, i) => getRetail(SSF_NECK, i, 'igi', year))).toEqual([220, 400, 540])
    }
  })

  it('appears under the necklace filter and is visible to non-admins', () => {
    const necks = getCollectionsByType(COLLECTIONS, 'necklace').map(c => c.id)
    expect(necks).toContain('SSF_NECK')
    expect(getVisibleCollections(false).map(c => c.id)).toContain('SSF_NECK')
  })

  it('reuses the SSF bracelet packshots and exposes a readable label', () => {
    expect(findPackshot('SSF_NECK', { color: 'Black' })).toEqual(findPackshot('SSF', { color: 'Black' }))
    expect(getCollectionLabel('SSF_NECK')).toBe('SHAPY SHINE NECKLACE')
  })

  it('resolves its label without colliding with SHAPY SHINE FANCY', () => {
    expect(findCollection('SHAPY SHINE NECKLACE')?.id).toBe('SSF_NECK')
    expect(findCollection('SHAPY SHINE FANCY')?.id).toBe('SSF')
  })

  it('prices a Shapy Shine necklace line with a shape correctly', () => {
    const result = calculateQuote([
      { collectionId: 'SSF_NECK', colorConfigs: [
        { id: 'c1', colorName: 'Red', caratIdx: 0, shape: 'Marquise', size: 'S/M', qty: 2 },
      ] },
    ])
    expect(result.lines).toHaveLength(1)
    const ln = result.lines[0]
    expect(ln.product).toBe('SHAPY SHINE NECKLACE')
    expect(ln.certType).toBe('igi')
    expect(ln.shape).toBe('Marquise')
    expect(ln.unitB2B).toBe(66)
    expect(ln.retailUnit).toBe(220)
    expect(ln.lineTotal).toBe(132)
  })

  it('requires shape, bezel/prong setting and metal colour on the order row', () => {
    const col = findCollection('SHAPY SHINE NECKLACE')
    // Complete row mirrors the SSF bracelet: shape + setting (bezel/prong) +
    // bpColor (metal) + size + cord colour.
    const complete = { quantity: '2', collection: 'SHAPY SHINE NECKLACE', carat: '0.10', unitPrice: '66', shape: 'Heart', setting: 'Bezel', bpColor: 'Yellow', size: 'S/M', colorCord: 'Red' }
    expect(validateRow(complete, col).ok).toBe(true)

    // Missing shape flags the row.
    expect(validateRow({ ...complete, shape: '' }, col).missing).toContain('shape')
    // Bezel/prong + metal colour are now required (same as the bracelet).
    expect(validateRow({ ...complete, setting: '' }, col).missing).toContain('setting')
    expect(validateRow({ ...complete, bpColor: '' }, col).missing).toContain('bpColor')
  })
})
