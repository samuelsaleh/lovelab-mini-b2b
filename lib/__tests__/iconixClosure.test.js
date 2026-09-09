/**
 * Iconix silk bracelets — braided / non-braided closure with closure-driven sizes.
 *
 * Sam, Sep 2026: Za-Ha, Flower Heart and Flower Marquise can be ordered braided
 * or non-braided. The thread stays Thin either way; the closure decides the
 * sizes:
 *   braided     → S, M, L
 *   non-braided → S/M, L/XL
 *
 * They default to non-braided, because every Iconix order saved before the
 * closure existed carries S/M or L/XL — the non-braided list — and must keep
 * a valid size when reopened.
 *
 * Riviera Four and Riviera Eight are the exception: Riviera only exists
 * braided (Sam, Sep 2026). The picker is hidden, every row is pinned to
 * braided and the only sizes are S, M, L.
 */

import {
  COLLECTIONS,
  SIZES_SILK,
  SIZES_ICONIX_BRAIDED,
  sizeOptionsForClosure,
  closureOptionsFor,
  getDefaultClosure,
  getForcedClosure,
  resolveClosure,
} from '../catalog'

const ICONIX_CHOICE = ['ZAHA', 'LUVA', 'LUMA']
const RIVIERA = ['RIV4', 'RIV8']
const ICONIX_SILK = [...ICONIX_CHOICE, ...RIVIERA]
const byId = (id) => COLLECTIONS.find((c) => c.id === id)

describe('Iconix silk closure — Za-Ha and Flower choose', () => {
  test.each(ICONIX_CHOICE)('%s offers both closures, forces neither', (id) => {
    const col = byId(id)
    expect(closureOptionsFor(col)).toEqual(['braided', 'nonBraided'])
    expect(getForcedClosure(col)).toBeNull()
  })

  test.each(ICONIX_CHOICE)('%s: non-braided ships in the grouped silk sizes', (id) => {
    expect(sizeOptionsForClosure(byId(id), 'nonBraided')).toEqual(SIZES_SILK)
  })

  test.each(ICONIX_CHOICE)('%s defaults to non-braided when nobody picked', (id) => {
    const col = byId(id)
    expect(getDefaultClosure(col)).toBe('nonBraided')
    expect(resolveClosure(col, null)).toBe('nonBraided')
    expect(resolveClosure(col, '')).toBe('nonBraided')
  })

  test.each(ICONIX_CHOICE)('%s: an explicit braided choice beats the default', (id) => {
    expect(resolveClosure(byId(id), 'braided')).toBe('braided')
  })

  test('a row saved before the closure existed keeps its size valid', () => {
    // Old Iconix rows: size 'S/M', no closure. With the default they resolve to
    // the non-braided list, which contains 'S/M'.
    const col = byId('LUVA')
    const legacyRow = { size: 'S/M', closureType: null }
    expect(sizeOptionsForClosure(col, legacyRow.closureType)).toContain(legacyRow.size)
  })
})

describe('Riviera — braided only', () => {
  test.each(RIVIERA)('%s offers braided and nothing else', (id) => {
    const col = byId(id)
    expect(getForcedClosure(col)).toBe('braided')
    expect(closureOptionsFor(col)).toEqual(['braided'])
    expect(closureOptionsFor(col)).not.toContain('nonBraided')
  })

  test.each(RIVIERA)('%s is braided whatever was stored or picked', (id) => {
    const col = byId(id)
    expect(getDefaultClosure(col)).toBe('braided')
    expect(resolveClosure(col, null)).toBe('braided')
    expect(resolveClosure(col, '')).toBe('braided')
    expect(resolveClosure(col, 'nonBraided')).toBe('braided')
  })

  test.each(RIVIERA)('%s never offers the grouped silk sizes', (id) => {
    const col = byId(id)
    // Even a stale non-braided value resolves to braided, so S/M · L/XL is
    // unreachable — the sizes are always S / M / L.
    expect(sizeOptionsForClosure(col, 'nonBraided')).toEqual(['S', 'M', 'L'])
    expect(sizeOptionsForClosure(col, null)).toEqual(['S', 'M', 'L'])
  })

  test('a Riviera row saved as non-braided S/M no longer has a valid size', () => {
    // The Builder and Order Form blank that size so the agent re-picks.
    const col = byId('RIV4')
    const legacyRow = { size: 'S/M', closureType: 'nonBraided' }
    expect(sizeOptionsForClosure(col, resolveClosure(col, legacyRow.closureType))).not.toContain(legacyRow.size)
  })
})

describe('Iconix silk — shared rules', () => {
  test.each(ICONIX_SILK)('%s: braided ships in S / M / L', (id) => {
    expect(sizeOptionsForClosure(byId(id), 'braided')).toEqual(['S', 'M', 'L'])
    expect(SIZES_ICONIX_BRAIDED).toEqual(['S', 'M', 'L'])
  })

  test('the thread thickness is untouched — still Thin only', () => {
    for (const id of ICONIX_SILK) {
      expect(byId(id).thicknessOptions).toEqual(['Thin'])
      expect(byId(id).cord).toBe('silk')
    }
  })
})

describe('the default does not leak to collections that should still ask', () => {
  test.each(['CUTY', 'CUBIX', 'M3'])('%s has no default closure', (id) => {
    const col = byId(id)
    expect(getDefaultClosure(col)).toBeNull()
    expect(resolveClosure(col, null)).toBeNull()
  })

  test('CUTY braided still uses its own nylon sizes', () => {
    const col = byId('CUTY')
    expect(sizeOptionsForClosure(col, 'braided')).toEqual(col.sizes)
    expect(sizeOptionsForClosure(col, 'nonBraided')).toEqual(SIZES_SILK)
  })

  test('Shapy Shine keeps its forced braided closure', () => {
    const col = byId('SSF')
    expect(getDefaultClosure(col)).toBe('braided')
    expect(resolveClosure(col, 'nonBraided')).toBe('braided')
  })

  test.each(['SSPF', 'SSRG', 'SSRD', 'SI1'])('%s (other silk) has no closure at all', (id) => {
    const col = byId(id)
    expect(closureOptionsFor(col)).toEqual([])
    expect(sizeOptionsForClosure(col, 'braided')).toEqual(col.sizes)
  })
})
