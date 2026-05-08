/**
 * Unit tests for the order completeness validator + hardened helpers.
 *
 * Covers:
 *   - validateRow: complete row passes
 *   - validateRow: missing each individual required field fails with that key
 *   - validateRow: conditional N/A skipping (shape, setting, bpColor, size)
 *   - validateOrder: aggregates issues with row numbers
 *   - findCollection: hardened against non-string inputs
 *   - splitHousing: hardened against non-string inputs
 */

import {
  validateRow,
  validateOrder,
  findCollection,
  splitHousing,
  getRequiredFieldsForRow,
} from '../orderRowValidation'

// ─── Test fixtures ────────────────────────────────────────────────────────

// Fully-featured silk-braided collection: requires shape + setting + bpColor +
// size + material + colorCord. Mirrors a real catalog entry like SHAPY_SHINE.
const fullCollection = {
  id: 'TEST_FULL',
  label: 'Test Full',
  cord: 'silkBraided',
  housing: 'shapyShine',
  shapes: ['Round', 'Pear'],
  sizes: ['16', '17', '18'],
}

// Nylon collection: material is auto-derived (read-only label in the form),
// so the validator must NOT require row.material here. This is the case
// that was incorrectly flagging every order with "missing material" before
// the fix.
const nylonCollection = {
  id: 'TEST_NYLON',
  label: 'Test Nylon',
  cord: 'nylon',
  housing: 'standard',
  shapes: ['Round'],
  sizes: ['16', '17'],
}

// Collection with no cord at all — colorCord can't be picked either.
const noCordCollection = {
  id: 'TEST_NOCORD',
  label: 'Test NoCord',
  housing: 'standard',
  sizes: ['16'],
}

// Collection with no shapes (shape becomes N/A)
const noShapeCollection = {
  id: 'TEST_NOSHAPE',
  label: 'Test NoShape',
  cord: 'nylon',
  housing: 'standard',
  sizes: ['16', '17'],
}

// SparkleProng housing (bpColor becomes N/A)
const sparkleProngCollection = {
  id: 'TEST_SP',
  label: 'Test SP',
  cord: 'silk',
  housing: 'sparkleProng',
  shapes: ['Round'],
  sizes: ['16', '17'],
}

// Collection without setting requirement (housing not in the setting list)
const noSettingCollection = {
  id: 'TEST_NOSETTING',
  label: 'Test NoSetting',
  cord: 'nylon',
  housing: 'standard',
  shapes: ['Round'],
  sizes: ['16', '17'],
}

// Collection with no sizes (size becomes N/A)
const noSizeCollection = {
  id: 'TEST_NOSIZE',
  label: 'Test NoSize',
  cord: 'nylon',
  housing: 'standard',
  shapes: ['Round'],
}

function completeRow(over = {}) {
  return {
    no: '1',
    quantity: '2',
    collection: 'TEST_FULL',
    cert: 'GIA',
    carat: '0.10',
    shape: 'Round',
    setting: 'Bezel YGold',
    bpColor: 'YGold',
    size: '17',
    material: 'Silk Med',
    colorCord: 'White',
    unitPrice: '120',
    total: '240',
    ...over,
  }
}

// ─── validateRow ──────────────────────────────────────────────────────────

describe('validateRow — happy path', () => {
  it('accepts a fully filled row for a fully-featured collection', () => {
    const result = validateRow(completeRow(), fullCollection)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })
})

describe('validateRow — every required field flagged when missing', () => {
  // For a fully-featured silk-braided collection EVERY field is required.
  const cases = ['quantity', 'collection', 'carat', 'unitPrice', 'material', 'colorCord', 'shape', 'setting', 'bpColor', 'size']
  cases.forEach((field) => {
    it(`flags missing ${field}`, () => {
      const row = completeRow({ [field]: '' })
      const result = validateRow(row, fullCollection)
      expect(result.ok).toBe(false)
      expect(result.missing).toContain(field)
    })
  })

  it('treats whitespace-only as empty', () => {
    const row = completeRow({ unitPrice: '   ' })
    const result = validateRow(row, fullCollection)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('unitPrice')
  })
})

describe('validateRow — N/A skipping', () => {
  it('does not require shape for a collection without shapes', () => {
    const row = completeRow({ shape: '' })
    const result = validateRow(row, noShapeCollection)
    expect(result.ok).toBe(true)
    expect(result.missing).not.toContain('shape')
  })

  it('does not require bpColor for sparkleProng housing', () => {
    const row = completeRow({ bpColor: '' })
    const result = validateRow(row, sparkleProngCollection)
    expect(result.ok).toBe(true)
    expect(result.missing).not.toContain('bpColor')
  })

  it('does not require setting when the housing does not use one', () => {
    const row = completeRow({ setting: '' })
    const result = validateRow(row, noSettingCollection)
    expect(result.ok).toBe(true)
    expect(result.missing).not.toContain('setting')
  })

  it('does not require size for a collection without sizes', () => {
    const row = completeRow({ size: '' })
    const result = validateRow(row, noSizeCollection)
    expect(result.ok).toBe(true)
    expect(result.missing).not.toContain('size')
  })

  it('does not require material for a non-silk collection (auto-derived)', () => {
    // Regression: every nylon order was previously flagged as
    // "missing material" because material is auto-derived for non-silk
    // cords and the row's `material` field stays empty by design.
    const row = completeRow({ collection: 'TEST_NYLON', material: '' })
    const result = validateRow(row, nylonCollection)
    expect(result.ok).toBe(true)
    expect(result.missing).not.toContain('material')
  })

  it('still requires material for silk and silkBraided collections', () => {
    const row = completeRow({ material: '' })
    const result = validateRow(row, fullCollection) // cord: silkBraided
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('material')
  })

  it('does not require colorCord when the collection has no cord at all', () => {
    const row = completeRow({ collection: 'TEST_NOCORD', material: '', colorCord: '', shape: '' })
    const result = validateRow(row, noCordCollection)
    expect(result.ok).toBe(true)
    expect(result.missing).not.toContain('colorCord')
    expect(result.missing).not.toContain('material')
  })

  it('still requires colorCord when the collection does have a cord palette', () => {
    const row = completeRow({ colorCord: '' })
    const result = validateRow(row, nylonCollection)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('colorCord')
  })
})

describe('validateRow — collection not yet picked', () => {
  it('only flags the always-required basics when collection is null', () => {
    const row = completeRow({ collection: '', shape: '', size: '' })
    const result = validateRow(row, null)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('collection')
    // shape / size shouldn't be flagged — we don't yet know if the collection
    // will require them.
    expect(result.missing).not.toContain('shape')
    expect(result.missing).not.toContain('size')
  })
})

// ─── validateOrder ────────────────────────────────────────────────────────

describe('validateOrder', () => {
  it('returns ok when every filled row is complete', () => {
    const find = (name) => (name === 'TEST_FULL' ? fullCollection : null)
    const result = validateOrder([completeRow(), completeRow({ no: '2' })], find)
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('aggregates missing fields per row with the right row numbers', () => {
    const find = (name) => (name === 'TEST_FULL' ? fullCollection : null)
    const rows = [
      completeRow({ no: '1' }),
      completeRow({ no: '2', carat: '', size: '' }),
      completeRow({ no: '3', unitPrice: '' }),
    ]
    const result = validateOrder(rows, find)
    expect(result.ok).toBe(false)
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0]).toEqual({ rowNo: '2', missing: expect.arrayContaining(['carat', 'size']) })
    expect(result.issues[1]).toEqual({ rowNo: '3', missing: ['unitPrice'] })
  })

  it('uses the default findCollection when none is provided', () => {
    // Empty row-set should always be ok regardless of resolver.
    expect(validateOrder([]).ok).toBe(true)
  })
})

// ─── findCollection — hardened ────────────────────────────────────────────

describe('findCollection — defensive coercions', () => {
  it('returns null for null / undefined / empty inputs', () => {
    expect(findCollection(null)).toBeNull()
    expect(findCollection(undefined)).toBeNull()
    expect(findCollection('')).toBeNull()
  })

  it('does not throw on non-string inputs', () => {
    expect(() => findCollection(123)).not.toThrow()
    expect(() => findCollection({})).not.toThrow()
    expect(() => findCollection([])).not.toThrow()
    expect(() => findCollection(true)).not.toThrow()
    // None of these resolve to a real collection, but the important thing
    // is they don't crash the form.
    expect(findCollection(123)).toBeNull()
  })

  it('still resolves a real collection name', () => {
    // We rely on real catalog data here — pick the first collection so the
    // test stays robust to catalog edits.
    const { COLLECTIONS } = require('../catalog')
    const first = COLLECTIONS[0]
    expect(first).toBeDefined()
    const found = findCollection(first.id)
    expect(found?.id).toBe(first.id)
  })
})

// ─── splitHousing — hardened ──────────────────────────────────────────────

describe('splitHousing — defensive coercions', () => {
  it('returns empty for empty / nullish input', () => {
    expect(splitHousing(null)).toEqual({ setting: '', color: '' })
    expect(splitHousing(undefined)).toEqual({ setting: '', color: '' })
    expect(splitHousing('')).toEqual({ setting: '', color: '' })
  })

  it('does not throw on non-string inputs', () => {
    expect(() => splitHousing(0)).not.toThrow()
    expect(() => splitHousing({})).not.toThrow()
    expect(() => splitHousing([])).not.toThrow()
    expect(() => splitHousing(true)).not.toThrow()
  })

  it('correctly parses Bezel/Prong prefixes', () => {
    expect(splitHousing('Bezel YGold')).toEqual({ setting: 'Bezel', color: 'YGold' })
    expect(splitHousing('Prong WGold')).toEqual({ setting: 'Prong', color: 'WGold' })
    expect(splitHousing('Prong')).toEqual({ setting: 'Prong', color: '' })
  })

  it('falls through to color-only when no recognised prefix', () => {
    expect(splitHousing('YGold')).toEqual({ setting: '', color: 'YGold' })
  })
})

// ─── getRequiredFieldsForRow — sanity ─────────────────────────────────────

describe('getRequiredFieldsForRow', () => {
  it('returns the smallest required set when collection is missing optional dimensions', () => {
    const fields = getRequiredFieldsForRow(noShapeCollection)
    expect(fields).not.toContain('shape')
    expect(fields).not.toContain('material') // nylon → no material
    expect(fields).toContain('size')
    expect(fields).toContain('colorCord') // nylon still has a cord palette
    expect(fields).toContain('quantity')
  })

  it('returns the full set for a silk-braided full collection', () => {
    const fields = getRequiredFieldsForRow(fullCollection)
    expect(fields).toEqual(expect.arrayContaining([
      'quantity', 'collection', 'carat', 'unitPrice',
      'material', 'colorCord', 'shape', 'setting', 'bpColor', 'size',
    ]))
  })

  it('omits material AND colorCord for a collection with no cord at all', () => {
    const fields = getRequiredFieldsForRow(noCordCollection)
    expect(fields).not.toContain('material')
    expect(fields).not.toContain('colorCord')
  })
})
