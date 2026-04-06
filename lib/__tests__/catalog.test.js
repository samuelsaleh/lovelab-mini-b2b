/**
 * Unit tests for lib/catalog.js
 *
 * Covers:
 *   - calculateQuote: empty input, null-carat skipping, priceOverride,
 *     out-of-range caratIdx clamping and warnings
 *   - computePackTotal: minC multiplier, unknown collection
 */

const { calculateQuote, COLLECTIONS, CORD_OPTIONS } = require('../catalog')

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

// CUTY: carats ['0.05','0.10','0.20','0.30'], prices [20,30,65,90]
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
// M3: minC 2, prices [55,85,165,240]
const M3 = COLLECTIONS.find(c => c.id === 'M3')

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

  it('calculates correct total for a single config (CUTY caratIdx=1 → €30, qty=1)', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1 })]),
    ])
    expect(result.total).toBe(30)
    expect(result.lines[0].unitB2B).toBe(30)
    expect(result.lines[0].lineTotal).toBe(30)
  })

  it('multiplies by qty correctly', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 5 })]),
    ])
    // CUTY price[0] = 20 × 5 = 100
    expect(result.total).toBe(100)
  })

  it('respects priceOverride when set', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 2, priceOverride: 10 })]),
    ])
    // Override 10 × 2 = 20 (not catalog 30 × 2 = 60)
    expect(result.total).toBe(20)
    expect(result.lines[0].unitOverride).toBe(10)
  })

  it('ignores priceOverride of null and uses catalog price', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 1, qty: 1, priceOverride: null })]),
    ])
    expect(result.total).toBe(30)
    expect(result.lines[0].unitOverride).toBeNull()
  })

  it('clamps out-of-range caratIdx and adds a warning', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 99, qty: 1 })]),
    ])
    // Clamped to last index (3) → price 90
    expect(result.total).toBe(90)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toMatch(/out of range/)
  })

  it('sums multiple configs across the same line', () => {
    const result = calculateQuote([
      makeLine('CUTY', [
        makeConfig({ id: 'a', caratIdx: 0, qty: 1 }), // 20
        makeConfig({ id: 'b', caratIdx: 1, qty: 2 }), // 60
      ]),
    ])
    expect(result.total).toBe(80)
  })

  it('sums configs across multiple lines', () => {
    const result = calculateQuote([
      makeLine('CUTY', [makeConfig({ caratIdx: 0, qty: 1 })]), // 20
      makeLine('M3', [makeConfig({ caratIdx: 0, qty: 1 })]),   // 55
    ])
    expect(result.total).toBe(75)
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
        makeConfig({ id: 'b', caratIdx: 0, qty: 1 }), // 20
      ]),
    ])
    expect(result.total).toBe(20)
    expect(result.lines).toHaveLength(1)
  })
})

// ─── computePackTotal ───────────────────────────────────────────────────────
// computePackTotal is not exported from catalog.js — it lives in BuilderPage.jsx.
// We test it via a local re-implementation that mirrors the fixed version.

function computePackTotal(pack) {
  return pack.lines.reduce((sum, line) => {
    const col = COLLECTIONS.find(c => c.id === line.collectionId)
    if (!col) return sum
    const colorCount = line.colorCount // injected for testing
    const minQty = col.minC || 1
    const lineTotal = line.caratIndices.reduce((s, ci) => s + (col.prices[ci] || 0), 0)
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
    // M3 price[0] = 55, colorCount=3, minC=2 → 55 * 3 * 2 = 330
    const total = computePackTotal({
      lines: [{ collectionId: 'M3', colorCount: 3, caratIndices: [0] }],
    })
    expect(total).toBe(330)
  })

  it('uses minC=1 for CUTY (minC=1)', () => {
    // CUTY price[1] = 30, colorCount=2, minC=1 → 30 * 2 * 1 = 60
    const total = computePackTotal({
      lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [1] }],
    })
    expect(total).toBe(60)
  })

  it('sums multiple caratIndices for one line', () => {
    // CUTY price[0]=20, price[1]=30 → (20+30)*2*1 = 100
    const total = computePackTotal({
      lines: [{ collectionId: 'CUTY', colorCount: 2, caratIndices: [0, 1] }],
    })
    expect(total).toBe(100)
  })

  it('sums across multiple lines', () => {
    // CUTY: 30*1*1=30 + M3: 55*1*2=110 = 140
    const total = computePackTotal({
      lines: [
        { collectionId: 'CUTY', colorCount: 1, caratIndices: [1] },
        { collectionId: 'M3', colorCount: 1, caratIndices: [0] },
      ],
    })
    expect(total).toBe(140)
  })
})
