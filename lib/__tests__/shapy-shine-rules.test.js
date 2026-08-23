/**
 * Shapy Shine product rules (BVB modifications list 1.1 + 1.2, Aug 2026).
 *
 * Alberto's rules, applied to the whole Shapy Shine family — the SSF bracelet
 * AND the SSF_NECK necklace, since both carry housing: 'shapyShine':
 *
 *   - 0.10 ct is always bezel, whatever the shape (no prong at that size)
 *   - 0.10 ct only sells Pear, Marquise, Heart, Emerald, Oval (no Cushion)
 *   - braided only — the braided / non-braided choice is gone
 *   - no Pink (rose gold) housing, bezel or prong
 *   - Long Cushion is discontinued at every size
 *
 * These assertions are the contract the builder, order form and AI advisor all
 * read from, so a regression here fails loudly instead of silently offering a
 * combination LoveLab can't produce.
 */

const {
  COLLECTIONS,
  HOUSING,
  SHAPES_SHAPY_SHINE,
  SHAPES_SHAPY_SHINE_SMALL,
  calculateQuote,
  closureOptionsFor,
  getForcedClosure,
  getShapesForCarat,
  getShapesForCaratIdx,
  isBezelOnly,
  resolveClosure,
  sizeOptionsForClosure,
} = require('@/lib/catalog')

const SSF = COLLECTIONS.find(c => c.id === 'SSF')
const SSF_NECK = COLLECTIONS.find(c => c.id === 'SSF_NECK')
const SHAPY_SHINE = [SSF, SSF_NECK]
const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')
const MF = COLLECTIONS.find(c => c.id === 'MF')
const SSPF = COLLECTIONS.find(c => c.id === 'SSPF')

describe('Shapy Shine — Long Cushion is discontinued', () => {
  it('is gone from the shared Shapy Shine shape list', () => {
    expect(SHAPES_SHAPY_SHINE).not.toContain('Long Cushion')
    expect(SHAPES_SHAPY_SHINE).toEqual(['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald', 'Cushion'])
  })

  it('is gone from both the bracelet and the necklace', () => {
    for (const col of SHAPY_SHINE) {
      expect(col.shapes).not.toContain('Long Cushion')
    }
  })

  it('is still available on Shapy Sparkle (a different collection, untouched)', () => {
    expect(SSPF.shapes).toContain('Long Cushion')
  })
})

describe('Shapy Shine — no Pink housing', () => {
  it('offers Yellow and White only, bezel and prong', () => {
    expect(HOUSING.shapyShine.bezel).toEqual(['Yellow', 'White'])
    expect(HOUSING.shapyShine.prong).toEqual(['Yellow', 'White'])
    expect(HOUSING.shapyShineBezel).toEqual(['Yellow', 'White'])
    expect(HOUSING.shapyShineProng).toEqual(['Yellow', 'White'])
  })

  it('leaves Pink on the collections that still sell it (CUTY, Matchy prong)', () => {
    expect(HOUSING.standard).toContain('Pink')
    expect(HOUSING.matchyProng.map(h => h.label)).toContain('Pink')
  })
})

describe('Shapy Shine — 0.10 ct is bezel only', () => {
  it('reports bezel-only at 0.10 for the bracelet and the necklace', () => {
    for (const col of SHAPY_SHINE) {
      expect(isBezelOnly(col, '0.10')).toBe(true)
    }
  })

  it('allows prong at every larger size', () => {
    for (const col of SHAPY_SHINE) {
      expect(isBezelOnly(col, '0.30')).toBe(false)
      expect(isBezelOnly(col, '0.50')).toBe(false)
    }
  })

  it('does not restrict other bezel/prong collections (Matchy Fancy)', () => {
    expect(isBezelOnly(MF, '0.60')).toBe(false)
    expect(isBezelOnly(MF, '1.00')).toBe(false)
  })

  it('is safe with a missing collection or carat', () => {
    expect(isBezelOnly(null, '0.10')).toBe(false)
    expect(isBezelOnly(undefined, undefined)).toBe(false)
    expect(isBezelOnly(SSF, null)).toBe(false)
    expect(isBezelOnly(SSF, '')).toBe(false)
  })
})

describe('Shapy Shine — shapes available per carat', () => {
  it('sells only the five small-stone shapes at 0.10 ct', () => {
    for (const col of SHAPY_SHINE) {
      const shapes = getShapesForCarat(col, '0.10')
      expect(shapes).toEqual(['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald'])
      expect(shapes).not.toContain('Cushion')
      expect(shapes).not.toContain('Long Cushion')
    }
  })

  it('sells every shape at 0.30 and 0.50 ct', () => {
    for (const col of SHAPY_SHINE) {
      for (const carat of ['0.30', '0.50']) {
        expect(getShapesForCarat(col, carat)).toEqual(SHAPES_SHAPY_SHINE)
      }
    }
  })

  it('keeps the documented five-shape list in sync with the filter', () => {
    expect(SHAPES_SHAPY_SHINE_SMALL).toEqual(['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald'])
    // Every small-carat shape must actually exist in the collection list,
    // otherwise the 0.10 picker would silently lose an option.
    for (const shape of SHAPES_SHAPY_SHINE_SMALL) {
      expect(SHAPES_SHAPY_SHINE).toContain(shape)
    }
  })

  it('leaves other collections unrestricted at every carat', () => {
    for (const carat of MF.carats) {
      expect(getShapesForCarat(MF, carat)).toEqual(MF.shapes)
    }
    // Shapy Sparkle happens to sell 0.50 / 0.70 / 1.00 — the 0.10 rule is
    // scoped to housing: 'shapyShine' and must not leak across.
    expect(getShapesForCarat(SSPF, '0.70')).toEqual(SSPF.shapes)
  })

  it('returns an empty list for collections without shapes', () => {
    expect(getShapesForCarat(CUTY, '0.10')).toEqual([])
    expect(getShapesForCarat(null, '0.10')).toEqual([])
  })

  describe('by carat index (what the builder rows actually store)', () => {
    it('maps index 0 to the 0.10 rules and 1/2 to the full list', () => {
      expect(SSF.carats).toEqual(['0.10', '0.30', '0.50'])
      expect(getShapesForCaratIdx(SSF, 0)).toEqual(SHAPES_SHAPY_SHINE_SMALL)
      expect(getShapesForCaratIdx(SSF, 1)).toEqual(SHAPES_SHAPY_SHINE)
      expect(getShapesForCaratIdx(SSF, 2)).toEqual(SHAPES_SHAPY_SHINE)
    })

    it('falls back to the full list before a carat is picked', () => {
      expect(getShapesForCaratIdx(SSF, null)).toEqual(SHAPES_SHAPY_SHINE)
      expect(getShapesForCaratIdx(SSF, undefined)).toEqual(SHAPES_SHAPY_SHINE)
    })

    it('survives an out-of-range index without throwing', () => {
      expect(getShapesForCaratIdx(SSF, 99)).toEqual(SHAPES_SHAPY_SHINE)
      expect(getShapesForCaratIdx(null, 0)).toEqual([])
    })
  })
})

describe('Shapy Shine — braided only', () => {
  it('forces braided on the bracelet', () => {
    expect(SSF.hasClosure).toBe(true)
    expect(SSF.forcedClosure).toBe('braided')
    expect(getForcedClosure(SSF)).toBe('braided')
    expect(closureOptionsFor(SSF)).toEqual(['braided'])
  })

  it('leaves the real choice on the other nylon bracelets', () => {
    expect(getForcedClosure(CUTY)).toBeNull()
    expect(closureOptionsFor(CUTY)).toEqual(['braided', 'nonBraided'])
    expect(getForcedClosure(MF)).toBeNull()
  })

  it('reports no closure at all for silk bracelets and necklaces', () => {
    expect(getForcedClosure(SSPF)).toBeNull()
    expect(closureOptionsFor(SSPF)).toEqual([])
    expect(getForcedClosure(SSF_NECK)).toBeNull()
    expect(closureOptionsFor(SSF_NECK)).toEqual([])
  })

  it('normalises any stored closure back to braided', () => {
    expect(resolveClosure(SSF, 'nonBraided')).toBe('braided')
    expect(resolveClosure(SSF, null)).toBe('braided')
    expect(resolveClosure(SSF, undefined)).toBe('braided')
  })

  it('leaves a freely-chosen closure alone', () => {
    expect(resolveClosure(CUTY, 'nonBraided')).toBe('nonBraided')
    expect(resolveClosure(CUTY, null)).toBeNull()
    expect(resolveClosure(SSPF, 'braided')).toBeNull()
    expect(resolveClosure(null, 'braided')).toBeNull()
  })

  it('keeps the full XS–XL size range (braided sizes, never the grouped pair)', () => {
    expect(sizeOptionsForClosure(SSF, 'braided')).toEqual(['XS', 'S', 'M', 'L', 'XL'])
    // Even if a stale row still says non-braided, the forced value is what the
    // quote emits — so the sizes it can be ordered in stay the nylon range.
    expect(sizeOptionsForClosure(SSF, resolveClosure(SSF, 'nonBraided'))).toEqual(['XS', 'S', 'M', 'L', 'XL'])
  })
})

describe('Shapy Shine — quotes built from old saved rows', () => {
  const makeLine = (collectionId, cfg) => ({
    collectionId,
    colorConfigs: [{ colorName: 'Black', caratIdx: 0, qty: 1, ...cfg }],
  })

  it('quotes a Long Cushion / Pink / non-braided legacy row without crashing', () => {
    const result = calculateQuote([
      makeLine('SSF', { shape: 'Long Cushion', housing: 'Prong Pink', closureType: 'nonBraided' }),
    ])
    expect(result.lines).toHaveLength(1)
    // The stored shape and housing are a historical snapshot and stay as-is so
    // the old document keeps reading correctly; only the closure is normalised.
    expect(result.lines[0].shape).toBe('Long Cushion')
    expect(result.lines[0].housing).toBe('Prong Pink')
    expect(result.lines[0].closureType).toBe('braided')
    expect(result.warnings).toEqual([])
  })

  it('still prices the 0.10 / 0.30 / 0.50 sizes normally', () => {
    const result = calculateQuote([
      makeLine('SSF', { caratIdx: 0, shape: 'Pear', housing: 'Bezel Yellow' }),
    ])
    expect(result.lines[0].carat).toBe('0.10')
    expect(result.lines[0].unitB2B).toBe(55)
    expect(result.warnings).toEqual([])
  })
})
