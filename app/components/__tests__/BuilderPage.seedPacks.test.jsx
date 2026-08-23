/**
 * Seed pack integrity — every hardcoded pack row must be orderable today.
 *
 * The fallback packs in BuilderPage are hand-written snapshots of catalog SKUs.
 * When a product rule changes (Shapy Shine lost Long Cushion, the Pink housing
 * and the non-braided closure in Aug 2026), a stale pack row would silently
 * seed an order with a combination LoveLab no longer produces. This walks every
 * row against the live catalog rules instead of trusting the hand-written data.
 */

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))
jest.mock('@/lib/api', () => ({ sendBuilderChat: jest.fn() }))

const { PACKS } = require('../BuilderPage')
const {
  COLLECTIONS,
  closureOptionsFor,
  getShapesForCarat,
  isBezelOnly,
} = require('@/lib/catalog')

const findCol = (label) => COLLECTIONS.find(c => c.label === label)

// [packLabel, row] for every row across every pack, so a failure names the pack.
const allRows = PACKS.flatMap(p => (p.formRows || []).map(row => [p.label, row]))

describe('seed packs', () => {
  it('ship at least one row', () => {
    expect(allRows.length).toBeGreaterThan(0)
  })

  it('reference collections that still exist', () => {
    for (const [pack, row] of allRows) {
      expect(findCol(row.collection)).toBeTruthy()
      expect(pack).toBeTruthy()
    }
  })

  it('use a carat the collection still sells', () => {
    for (const [pack, row] of allRows) {
      const col = findCol(row.collection)
      expect({ pack, collection: row.collection, carat: row.carat })
        .toEqual({ pack, collection: row.collection, carat: expect.any(String) })
      expect(col.carats).toContain(row.carat)
    }
  })

  it('use a shape the collection still sells at that carat', () => {
    for (const [pack, row] of allRows) {
      if (!row.shape) continue
      const col = findCol(row.collection)
      const allowed = getShapesForCarat(col, row.carat)
      expect({ pack, row: `${row.collection} ${row.carat} ${row.shape}`, ok: allowed.includes(row.shape) })
        .toEqual({ pack, row: `${row.collection} ${row.carat} ${row.shape}`, ok: true })
    }
  })

  it('never use a prong setting where only a bezel is produced', () => {
    for (const [pack, row] of allRows) {
      const col = findCol(row.collection)
      if (!isBezelOnly(col, row.carat)) continue
      expect({ pack, row: `${row.collection} ${row.carat}`, setting: row.setting })
        .toEqual({ pack, row: `${row.collection} ${row.carat}`, setting: 'Bezel' })
    }
  })

  it('never use a housing metal the collection dropped (no Pink on Shapy Shine)', () => {
    for (const [pack, row] of allRows) {
      const col = findCol(row.collection)
      if (col.housing !== 'shapyShine') continue
      expect({ pack, row: `${row.collection} ${row.carat}`, metal: row.bpColor })
        .toEqual({ pack, row: `${row.collection} ${row.carat}`, metal: expect.stringMatching(/^(Yellow|White)$/) })
    }
  })

  it('never store a closure the collection no longer offers', () => {
    for (const [pack, row] of allRows) {
      if (!row.closure) continue
      const col = findCol(row.collection)
      const allowed = closureOptionsFor(col)
      expect({ pack, row: `${row.collection} ${row.carat}`, ok: allowed.includes(row.closure) })
        .toEqual({ pack, row: `${row.collection} ${row.carat}`, ok: true })
    }
  })
})
