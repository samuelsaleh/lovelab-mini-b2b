/**
 * Iconix silk bracelets — braided / non-braided closure with closure-driven sizes.
 *
 * Sam, Sep 2026: the Iconix pieces (Za-Ha, Flower Heart, Flower Marquise,
 * Riviera Four, Riviera Eight) can be ordered braided or non-braided. The
 * thread stays Thin either way; the closure decides the sizes:
 *   braided     → S, M, L
 *   non-braided → S/M, L/XL
 *
 * They default to non-braided, because every Iconix order saved before the
 * closure existed carries S/M or L/XL — the non-braided list — and must keep
 * a valid size when reopened.
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

const ICONIX_SILK = ['ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8']
const byId = (id) => COLLECTIONS.find((c) => c.id === id)

describe('Iconix silk closure', () => {
  test.each(ICONIX_SILK)('%s offers both closures, forces neither', (id) => {
    const col = byId(id)
    expect(closureOptionsFor(col)).toEqual(['braided', 'nonBraided'])
    expect(getForcedClosure(col)).toBeNull()
  })

  test.each(ICONIX_SILK)('%s: braided ships in S / M / L', (id) => {
    expect(sizeOptionsForClosure(byId(id), 'braided')).toEqual(['S', 'M', 'L'])
    expect(SIZES_ICONIX_BRAIDED).toEqual(['S', 'M', 'L'])
  })

  test.each(ICONIX_SILK)('%s: non-braided ships in the grouped silk sizes', (id) => {
    expect(sizeOptionsForClosure(byId(id), 'nonBraided')).toEqual(SIZES_SILK)
  })

  test.each(ICONIX_SILK)('%s defaults to non-braided when nobody picked', (id) => {
    const col = byId(id)
    expect(getDefaultClosure(col)).toBe('nonBraided')
    expect(resolveClosure(col, null)).toBe('nonBraided')
    expect(resolveClosure(col, '')).toBe('nonBraided')
  })

  test.each(ICONIX_SILK)('%s: an explicit braided choice beats the default', (id) => {
    expect(resolveClosure(byId(id), 'braided')).toBe('braided')
  })

  test('a row saved before the closure existed keeps its size valid', () => {
    // Old Iconix rows: size 'S/M', no closure. With the default they resolve to
    // the non-braided list, which contains 'S/M'.
    const col = byId('RIV4')
    const legacyRow = { size: 'S/M', closureType: null }
    expect(sizeOptionsForClosure(col, legacyRow.closureType)).toContain(legacyRow.size)
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
