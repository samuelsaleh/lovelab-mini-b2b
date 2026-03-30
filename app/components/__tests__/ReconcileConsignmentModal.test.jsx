/**
 * Unit tests for ReconcileConsignmentModal reconciliation logic.
 *
 * We test the pure calculation helpers extracted from the component:
 *  - sold = sent - cameBack
 *  - validation rules (sold > sent, client name required, etc.)
 *  - the B2B invoice rows built from sold items
 *  - the reconciliation array shape stored in metadata
 */
import { getConsignmentRows, rowDescription } from '@/lib/consignment'

// ── Helpers mirrored from ReconcileConsignmentModal ───────────────────────

function buildReconciliation(items) {
  return items.map(item => ({
    row_no: item.row.no,
    description: rowDescription(item.row),
    sent: item.sentQty,
    came_back: item.sentQty - (item.checked ? item.soldQty : 0),
    sold: item.checked ? item.soldQty : 0,
    unit_price: Number(item.row.unitPrice) || 0,
  }))
}

function buildSoldRows(items) {
  return items
    .filter(i => i.checked && i.soldQty > 0)
    .map(i => ({
      ...i.row,
      quantity: String(i.soldQty),
      total: i.soldQty > 0 && i.row.unitPrice
        ? String(Math.round(i.soldQty * Number(i.row.unitPrice) * 100) / 100)
        : i.row.total,
    }))
}

function calcSoldValue(items) {
  return items.reduce((acc, i) => {
    if (!i.checked || i.soldQty <= 0) return acc
    return acc + i.soldQty * (Number(i.row.unitPrice) || 0)
  }, 0)
}

function validate(items, clientName) {
  for (const item of items) {
    if (item.checked && item.soldQty > item.sentQty) {
      return `Sold quantity cannot exceed sent quantity for row ${item.row.no}`
    }
    if (item.checked && item.soldQty <= 0) {
      return `Please enter a sold quantity for the checked items (or uncheck them)`
    }
  }
  const anySold = items.some(i => i.checked && i.soldQty > 0)
  if (anySold && !clientName.trim()) {
    return 'Please enter the client name for the invoice'
  }
  return null
}

// ── Test data ─────────────────────────────────────────────────────────────

const makeRow = (overrides = {}) => ({
  no: '1',
  quantity: '3',
  collection: 'Solitaire',
  carat: '0.5ct',
  shape: 'Round',
  setting: 'Prong',
  bpColor: '',
  size: '',
  material: '',
  colorCord: '',
  unitPrice: '800',
  total: '2400',
  ...overrides,
})

const makeItem = (row, opts = {}) => ({
  row,
  sentQty: Number(row.quantity) || 1,
  soldQty: opts.soldQty ?? 0,
  checked: opts.checked ?? false,
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ReconcileConsignmentModal — reconciliation logic', () => {
  describe('buildReconciliation', () => {
    it('pre-fills all as came_back when nothing checked', () => {
      const items = [makeItem(makeRow({ quantity: '3' }))]
      const [r] = buildReconciliation(items)
      expect(r.sent).toBe(3)
      expect(r.came_back).toBe(3)
      expect(r.sold).toBe(0)
    })

    it('computes sold correctly when row is checked', () => {
      const items = [makeItem(makeRow({ quantity: '3' }), { checked: true, soldQty: 1 })]
      const [r] = buildReconciliation(items)
      expect(r.sent).toBe(3)
      expect(r.came_back).toBe(2)
      expect(r.sold).toBe(1)
    })

    it('handles fully sold row (none came back)', () => {
      const items = [makeItem(makeRow({ quantity: '2' }), { checked: true, soldQty: 2 })]
      const [r] = buildReconciliation(items)
      expect(r.sent).toBe(2)
      expect(r.came_back).toBe(0)
      expect(r.sold).toBe(2)
    })

    it('stores the correct unit_price', () => {
      const items = [makeItem(makeRow({ unitPrice: '1200' }))]
      const [r] = buildReconciliation(items)
      expect(r.unit_price).toBe(1200)
    })

    it('handles multiple rows independently', () => {
      const items = [
        makeItem(makeRow({ no: '1', quantity: '3' }), { checked: true, soldQty: 1 }),
        makeItem(makeRow({ no: '2', quantity: '1' }), { checked: false }),
      ]
      const [r1, r2] = buildReconciliation(items)
      expect(r1.sold).toBe(1)
      expect(r2.sold).toBe(0)
      expect(r2.came_back).toBe(1)
    })
  })

  describe('buildSoldRows', () => {
    it('returns empty array when no items sold', () => {
      const items = [makeItem(makeRow())]
      expect(buildSoldRows(items)).toEqual([])
    })

    it('returns only sold items with updated quantity', () => {
      const items = [
        makeItem(makeRow({ no: '1', quantity: '3' }), { checked: true, soldQty: 2 }),
        makeItem(makeRow({ no: '2', quantity: '1' }), { checked: false }),
      ]
      const rows = buildSoldRows(items)
      expect(rows).toHaveLength(1)
      expect(rows[0].no).toBe('1')
      expect(rows[0].quantity).toBe('2')
    })

    it('recalculates total based on soldQty × unitPrice', () => {
      const items = [makeItem(makeRow({ quantity: '3', unitPrice: '800' }), { checked: true, soldQty: 2 })]
      const [row] = buildSoldRows(items)
      expect(row.total).toBe('1600')
    })
  })

  describe('calcSoldValue', () => {
    it('returns 0 when nothing sold', () => {
      const items = [makeItem(makeRow({ quantity: '2', unitPrice: '800' }))]
      expect(calcSoldValue(items)).toBe(0)
    })

    it('calculates total sold value correctly', () => {
      const items = [
        makeItem(makeRow({ quantity: '3', unitPrice: '800' }), { checked: true, soldQty: 2 }),
        makeItem(makeRow({ quantity: '1', unitPrice: '1200' }), { checked: true, soldQty: 1 }),
      ]
      expect(calcSoldValue(items)).toBe(2 * 800 + 1 * 1200) // 2800
    })

    it('ignores unchecked items even if soldQty is set', () => {
      const items = [makeItem(makeRow({ quantity: '3', unitPrice: '800' }), { checked: false, soldQty: 2 })]
      expect(calcSoldValue(items)).toBe(0)
    })
  })

  describe('validate', () => {
    it('returns null when all came back (nothing checked)', () => {
      const items = [makeItem(makeRow({ quantity: '3' }))]
      expect(validate(items, '')).toBeNull()
    })

    it('rejects when soldQty > sentQty', () => {
      const items = [makeItem(makeRow({ quantity: '2', no: '1' }), { checked: true, soldQty: 5 })]
      expect(validate(items, 'John')).toMatch(/cannot exceed/)
    })

    it('rejects when row is checked but soldQty is 0', () => {
      const items = [makeItem(makeRow({ quantity: '2' }), { checked: true, soldQty: 0 })]
      expect(validate(items, 'John')).toMatch(/sold quantity/)
    })

    it('rejects when items sold but client name is empty', () => {
      const items = [makeItem(makeRow({ quantity: '2' }), { checked: true, soldQty: 1 })]
      expect(validate(items, '')).toMatch(/client name/)
    })

    it('returns null when items sold and client name is provided', () => {
      const items = [makeItem(makeRow({ quantity: '2' }), { checked: true, soldQty: 1 })]
      expect(validate(items, 'Jane Smith')).toBeNull()
    })
  })

  describe('getConsignmentRows (from lib/consignment)', () => {
    it('returns empty array for order without formState', () => {
      expect(getConsignmentRows({})).toEqual([])
      expect(getConsignmentRows({ metadata: {} })).toEqual([])
    })

    it('filters out empty rows', () => {
      const order = {
        metadata: {
          formState: {
            rows: [
              { collection: 'Ring', quantity: '2' },
              { collection: '', quantity: '' },
            ],
          },
        },
      }
      expect(getConsignmentRows(order)).toHaveLength(1)
    })

    it('returns all non-empty rows', () => {
      const order = {
        metadata: {
          formState: {
            rows: [
              { collection: 'Ring', quantity: '2' },
              { collection: 'Bracelet', quantity: '1' },
            ],
          },
        },
      }
      expect(getConsignmentRows(order)).toHaveLength(2)
    })
  })

  describe('rowDescription (from lib/consignment)', () => {
    it('joins non-empty parts', () => {
      const row = { collection: 'Solitaire', carat: '0.5ct', shape: 'Round', setting: '', material: '' }
      const desc = rowDescription(row)
      expect(desc).toBe('Solitaire 0.5ct Round')
    })

    it('falls back to Item #no when no fields', () => {
      const row = { no: '3', collection: '', carat: '', shape: '', setting: '', material: '' }
      const desc = rowDescription(row)
      expect(desc).toMatch(/Item #3/)
    })
  })
})
