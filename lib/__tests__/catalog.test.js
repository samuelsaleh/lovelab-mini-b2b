/**
 * Unit tests for lib/catalog.js
 *
 * Covers:
 *   - calculateQuote: empty input, null-carat skipping, priceOverride,
 *     out-of-range caratIdx clamping and warnings
 *   - computePackTotal: minC multiplier, unknown collection
 */

const { calculateQuote, COLLECTIONS, CORD_OPTIONS, getPrice, getDefaultCert, sizeOptionsForClosure, SIZES_SILK } = require('../catalog')

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeLine(collectionId, configs) {
  return { collectionId, colorConfigs: configs }
}

function makeConfig(overrides = {}) {
  return {
    id: 'cfg-1',
    colorName: 'White',
    caratIdx: 1,
    housing: 'Yellow',
    housingType: null,
    multiAttached: null,
    shape: null,
    size: 'M',
    cordType: null,
    thickness: null,
    qty: 1,
    priceOverride: null,
    ...overrides,
  }
}

// All prices below reflect the 2026 pricelist (the current default). The
// year-specific PDF-match assertions live in catalog-prices-{2025,2026}.test.js
// — this file pins the catalog's *default* behaviour.
//
// CUTY 2026: carats ['0.05','0.10','0.20','0.30'], IGI prices [30,40,70,100], inhouse [24,34,null,null]
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
// M3 2026: minC 2, IGI prices [65,95,175,250]
const M3 = COLLECTIONS.find(c => c.id === 'M3')
// SSPF (Shapy Sparkle Fancy) is a SILK bracelet — it never opts in to closure,
// so it's the canonical "no closure" sentinel now that the nylon bracelets
// (M3/M4/M5/MF/SSF/HOLY) all carry hasClosure.
const SSPF = COLLECTIONS.find(c => c.id === 'SSPF')

// ─── CORD_OPTIONS ───────────────────────────────────────────────────────────

describe('CORD_OPTIONS', () => {
  it('silkBraided defaults to braidedNylon first (sparkle collections show fake/thin cords)', () => {
    expect(CORD_OPTIONS.silkBraided[0]).toBe('braidedNylon')
  })
})

// ─── calculateQuote ─────────────────────────────────────────────────────────

describe('calculateQuote', () => {
  it('returns zero totals for empty lines array', () => {
    const result = calculateQuote([])
    expect(result.total).toBe(0)
    expect(result.lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns zero totals when lines have no collectionId', () => {
    const result = calculateQuote([{ collectionId: null, colorConfigs: [] }])
    expect(result.total).toBe(0)
  })

  it('returns zero totals when lines have no colorConfigs', () => {
    const result = calculateQuote([makeLine('CUTY', [])])
    expect(result.total).toBe(0)
  })

  it('skips configs with null caratIdx and does not inflate the total', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: null })]),
    ])
    expect(result.total).toBe(0)
    expect(result.lines).toHaveLength(0)
  })

  it('skips configs with undefined caratIdx', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: undefined })]),
    ])
    expect(result.total).toBe(0)
  })

  it('calculates correct total for a single config (CUTY caratIdx=1 IGI → €40, qty=1)', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1 })]),
    ])
    expect(result.total).toBe(40)
    expect(result.lines[0].unitB2B).toBe(40)
    expect(result.lines[0].lineTotal).toBe(40)
  })

  it('multiplies by qty correctly', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 5 })]),
    ])
    // CUTY IGI price[0] = 30 × 5 = 150
    expect(result.total).toBe(150)
  })

  it('respects priceOverride when set', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 2, priceOverride: 10 })]),
    ])
    // Override 10 × 2 = 20 (not catalog 40 × 2 = 80)
    expect(result.total).toBe(20)
    expect(result.lines[0].unitOverride).toBe(10)
  })

  it('ignores priceOverride of null and uses catalog price', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1, priceOverride: null })]),
    ])
    expect(result.total).toBe(40)
    expect(result.lines[0].unitOverride).toBeNull()
  })

  it('clamps out-of-range caratIdx and adds a warning', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 99, qty: 1 })]),
    ])
    // Clamped to last index (3) → IGI price 100
    expect(result.total).toBe(100)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toMatch(/out of range/)
  })

  it('sums multiple configs across the same line', () => {
    const result = calculateQuote([
      makeLine('CUTY', [
        makeConfig({ id: 'a', caratIdx: 0, qty: 1 }), // 30
        makeConfig({ id: 'b', caratIdx: 1, qty: 2 }), // 80
      ]),
    ])
    expect(result.total).toBe(110)
  })

  it('sums configs across multiple lines', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 1 })]), // 30
      makeLine('M3', [makeConfig({ caratIdx: 0, qty: 1 })]),   // 65
    ])
    expect(result.total).toBe(95)
  })

  it('returns correct totalPieces', () => {
    const result = calculateQuote([
      makeLine('CUTY', [
        makeConfig({ id: 'a', caratIdx: 0, qty: 3 }),
        makeConfig({ id: 'b', caratIdx: 1, qty: 2 }),
      ]),
    ])
    expect(result.totalPieces).toBe(5)
  })

  it('ignores configs with null caratIdx when mixing with valid ones', () => {
    const result = calculateQuote([
      makeLine('CUTY', [
        makeConfig({ id: 'a', caratIdx: null }),
        makeConfig({ id: 'b', caratIdx: 0, qty: 1 }), // 30
      ]),
    ])
    expect(result.total).toBe(30)
    expect(result.lines).toHaveLength(1)
  })

  // ─── Bracelet thread closure ──────────────────────────────────────────────
  // Regression: makes sure calculateQuote forwards closureType from the
  // builder config to the output line for hasClosure collections, and
  // strips it (→ null) for everyone else (silk bracelets, necklaces) so
  // OrderForm can render N/A.

  it('forwards closureType "braided" for CUTY (hasClosure: true)', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1, closureType: 'braided' })]),
    ])
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].closureType).toBe('braided')
  })

  it('forwards closureType "nonBraided" for CUBIX (hasClosure: true)', () => {
    const result = calculateQuote([
      makeLine('CUBIX', [makeConfig({ caratIdx: 0, qty: 1, closureType: 'nonBraided' })]),
    ])
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].closureType).toBe('nonBraided')
  })

  it('forwards closureType for the newly-enabled nylon bracelets (M3/MF/SSF/HOLY)', () => {
    for (const id of ['M3', 'MF', 'SSF', 'HOLY']) {
      const result = calculateQuote([
        makeLine(id, [makeConfig({ caratIdx: 0, qty: 1, closureType: 'nonBraided' })]),
      ])
      expect(result.lines).toHaveLength(1)
      expect(result.lines[0].closureType).toBe('nonBraided')
    }
  })

  it('emits null closureType for non-closure collections (SSPF — silk) even if the config carries one', () => {
    const result = calculateQuote([
      makeLine('SSPF', [makeConfig({ caratIdx: 0, qty: 1, closureType: 'braided' })]),
    ])
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].closureType).toBeNull()
  })

  it('emits null closureType for hasClosure collections when the config has no closure picked', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 1, closureType: null })]),
    ])
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].closureType).toBeNull()
  })
})

// ─── COLLECTIONS catalog flag ─────────────────────────────────────────────
// Pinning hasClosure on the catalog itself so a refactor that drops the flag
// — silently breaking the entire closure UI / OrderForm column / validation
// pipeline — gets caught at unit-test time rather than in production.

describe('COLLECTIONS — hasClosure flag', () => {
  // Every nylon-thread bracelet opts in to the braided / non-braided closure.
  const NYLON_CLOSURE_IDS = ['CUTY', 'CUBIX', 'M3', 'M4', 'M5', 'MF', 'SSF', 'HOLY']

  it.each(NYLON_CLOSURE_IDS)('%s (nylon bracelet) opts in to the closure column', (id) => {
    const col = COLLECTIONS.find(c => c.id === id)
    expect(col).toBeTruthy()
    expect(col.hasClosure).toBe(true)
  })

  it('silk bracelets do NOT opt in to the closure column', () => {
    for (const id of ['SSPF', 'SSRG', 'SSRD', 'SI1', 'ZAHA']) {
      const col = COLLECTIONS.find(c => c.id === id)
      expect(col).toBeTruthy()
      expect(!!col.hasClosure).toBe(false)
    }
  })

  it('necklaces never opt in to the closure column', () => {
    const necklaces = COLLECTIONS.filter(c => c.productType === 'necklace')
    expect(necklaces.length).toBeGreaterThan(0)
    for (const col of necklaces) {
      expect(!!col.hasClosure).toBe(false)
    }
  })
})

// ─── computePackTotal ───────────────────────────────────────────────────────
// computePackTotal is not exported from catalog.js — it lives in BuilderPage.jsx.
// We test it via a local re-implementation that mirrors the fixed version.

function computePackTotal(pack, pricelistYear = '2026') {
  return pack.lines.reduce((sum, line) => {
    const col = COLLECTIONS.find(c => c.id === line.collectionId)
    if (!col) return sum
    const colorCount = line.colorCount // injected for testing
    const minQty = col.minC || 1
    const cert = getDefaultCert(col)
    const lineTotal = line.caratIndices.reduce((s, ci) => s + getPrice(col, ci, cert, pricelistYear), 0)
    return sum + lineTotal * colorCount * minQty
  }, 0)
}

describe('computePackTotal', () => {
  it('returns 0 for a pack with unknown collection', () => {
    const total = computePackTotal({
      lines: [{ collectionId: 'UNKNOWN', colorCount: 5, caratIndices: [0] }],
    })
    expect(total).toBe(0)
  })

  it('returns 0 for a pack with empty lines', () => {
    expect(computePackTotal({ lines: [] })).toBe(0)
  })

  it('multiplies by minC for M3 (minC=2)', () => {
    // M3 IGI price[0] = 65, colorCount=3, minC=2 → 65 * 3 * 2 = 390
    const total = computePackTotal({
      lines: [{ collectionId: 'M3', colorCount: 3, caratIndices: [0] }],
    })
    expect(total).toBe(390)
  })

  it('uses minC=3 for CUTY', () => {
    // CUTY IGI price[1] = 40, colorCount=2, minC=3 → 40 * 2 * 3 = 240
    const total = computePackTotal({
      lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [1] }],
    })
    expect(total).toBe(240)
  })

  it('sums multiple caratIndices for one line', () => {
    // CUTY IGI price[0]=30, price[1]=40 → (30+40)*2*3 = 420
    const total = computePackTotal({
      lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [0, 1] }],
    })
    expect(total).toBe(420)
  })

  it('sums across multiple lines', () => {
    // CUTY: 40*1*3=120 + M3: 65*1*2=130 = 250
    const total = computePackTotal({
      lines: [
        { collectionId: 'CUTY', colorCount: 1, caratIndices: [1] },
        { collectionId: 'M3', colorCount: 1, caratIndices: [0] },
      ],
    })
    expect(total).toBe(250)
  })
})

describe('sizeOptionsForClosure', () => {
  const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
  const CUBIX = COLLECTIONS.find(c => c.id === 'CUBIX')
  const MF = COLLECTIONS.find(c => c.id === 'MF')
  const SSPF = COLLECTIONS.find(c => c.id === 'SSPF')

  it('returns the collection sizes for braided CUTY (individual sizes)', () => {
    expect(sizeOptionsForClosure(CUTY, 'braided')).toEqual(CUTY.sizes)
    expect(sizeOptionsForClosure(CUTY, 'braided')).toEqual(['XS', 'S', 'M', 'L', 'XL'])
  })

  it('returns the grouped silk sizes for non-braided CUTY', () => {
    expect(sizeOptionsForClosure(CUTY, 'nonBraided')).toEqual(SIZES_SILK)
    expect(sizeOptionsForClosure(CUTY, 'nonBraided')).toEqual(['S/M', 'L/XL'])
  })

  it('defaults to the collection sizes when closure is null/unset (treated as braided)', () => {
    expect(sizeOptionsForClosure(CUTY, null)).toEqual(CUTY.sizes)
    expect(sizeOptionsForClosure(CUTY, undefined)).toEqual(CUTY.sizes)
  })

  it('returns grouped silk sizes for non-braided CUBIX too', () => {
    expect(sizeOptionsForClosure(CUBIX, 'nonBraided')).toEqual(SIZES_SILK)
  })

  it('collapses a newly-enabled nylon bracelet (MATCHY FANCY) to grouped sizes when non-braided', () => {
    expect(sizeOptionsForClosure(MF, 'braided')).toEqual(MF.sizes)
    expect(sizeOptionsForClosure(MF, 'nonBraided')).toEqual(SIZES_SILK)
  })

  it('is a no-op for collections without hasClosure (SSPF — silk) regardless of closure', () => {
    expect(sizeOptionsForClosure(SSPF, 'nonBraided')).toEqual(SSPF.sizes)
    expect(sizeOptionsForClosure(SSPF, 'braided')).toEqual(SSPF.sizes)
    expect(sizeOptionsForClosure(SSPF, null)).toEqual(SSPF.sizes)
  })

  it('returns an empty array when the collection has no sizes', () => {
    expect(sizeOptionsForClosure({ hasClosure: true }, 'braided')).toEqual([])
    expect(sizeOptionsForClosure(null, 'braided')).toEqual([])
  })
})
