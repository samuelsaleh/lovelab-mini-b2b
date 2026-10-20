/**
 * Diamond filters work per order line. The cases that matter: a mixed order
 * keeps only its matching lines (and a smaller total), an order with no match
 * disappears, and blanks never become picker options.
 */
import {
  diamondLinesOf, hasDiamondFilter, scopeDocToDiamond, diamondOptions, diamondSummary, modelSummary, proratedAmount,
} from '@/lib/diamondLines'

const doc = (rows, total = 999) => ({ id: 'd', total_amount: total, metadata: { formState: { rows } } })

const MIXED = doc([
  { collection: 'SHAPY SPARKLE', carat: '0.10', shape: 'Round', quantity: '6', total: '1740' },
  { collection: 'SHAPY SPARKLE', carat: '0.15', shape: 'Heart', quantity: '4', total: 1480 },
])

describe('diamondLinesOf', () => {
  test('reads quantity and total whether stored as text or numbers', () => {
    const [a, b] = diamondLinesOf(MIXED)
    expect(a).toMatchObject({ carat: '0.10', shape: 'Round', qty: 6, total: 1740 })
    expect(b).toMatchObject({ carat: '0.15', shape: 'Heart', qty: 4, total: 1480 })
  })

  test('a document with no rows has no lines', () => {
    expect(diamondLinesOf({ metadata: {} })).toEqual([])
    expect(diamondLinesOf(null)).toEqual([])
  })
})

describe('scopeDocToDiamond', () => {
  test('no filter returns the document untouched', () => {
    expect(hasDiamondFilter({ models: [], carats: [], shapes: [] })).toBe(false)
    expect(scopeDocToDiamond(MIXED, { models: [], carats: [], shapes: [] })).toBe(MIXED)
  })

  test('keeps matching lines and shrinks the total to their share', () => {
    const out = scopeDocToDiamond(MIXED, { carats: ['0.15'] })
    expect(out.metadata.formState.rows).toHaveLength(1)
    expect(out.metadata.formState.rows[0].shape).toBe('Heart')
    expect(out.total_amount).toBeCloseTo(999 * 1480 / 3220, 5)
  })

  test('carat and shape must both match on the same line', () => {
    expect(scopeDocToDiamond(MIXED, { carats: ['0.10'], shapes: ['Heart'] })).toBeNull()
  })

  test('a document without rows drops out when a filter is on', () => {
    expect(scopeDocToDiamond({ metadata: {} }, { carats: ['0.10'] })).toBeNull()
  })
})

describe('amounts', () => {
  // total_amount is the grand total (discount, shipping, VAT), not the sum of line prices.
  const WITH_VAT = doc([
    { collection: 'CUTY', carat: '0.10', shape: 'Round', quantity: '1', total: '600' },
    { collection: 'CUBIX', carat: '0.20', shape: 'Heart', quantity: '1', total: '400' },
  ], 1198.9)

  test('an order whose every line matches keeps its real total', () => {
    expect(scopeDocToDiamond(WITH_VAT, { carats: ['0.10', '0.20'] }).total_amount).toBe(1198.9)
  })

  test('a partial match gets its share of the real total', () => {
    expect(scopeDocToDiamond(WITH_VAT, { carats: ['0.10'] }).total_amount).toBeCloseTo(1198.9 * 0.6, 5)
  })

  test('blank line prices fall back to piece counts, then to line counts', () => {
    const a = { qty: 3, total: 0 }, b = { qty: 1, total: 0 }
    expect(proratedAmount(400, [a, b], [a])).toBe(300)
    expect(proratedAmount(400, [{ qty: 0, total: 0 }, { qty: 0, total: 0 }], [{ qty: 0, total: 0 }])).toBe(200)
  })

  test('the model filter matches on the catalogue label', () => {
    const out = scopeDocToDiamond(WITH_VAT, { models: ['CUBIX'] })
    expect(out.metadata.formState.rows).toHaveLength(1)
    expect(out.metadata.formState.rows[0].shape).toBe('Heart')
  })
})

describe('diamondOptions', () => {
  test('counts pieces, sorts carats numerically, skips blanks', () => {
    const opts = diamondOptions([
      MIXED,
      doc([{ collection: 'SHAPY SPARKLE', carat: '0.05', shape: '', quantity: '10', total: 100 }]),
    ])
    expect(opts.carats.map((o) => o.value)).toEqual(['0.05', '0.10', '0.15'])
    expect(opts.carats.find((o) => o.value === '0.10').count).toBe(6)
    expect(opts.shapes.map((o) => o.value)).toEqual(['Heart', 'Round'])
  })
})

describe('summaries', () => {
  test('one entry per distinct diamond and model', () => {
    const lines = diamondLinesOf(MIXED)
    expect(diamondSummary(lines)).toEqual(['0.10 ct Round', '0.15 ct Heart'])
    expect(modelSummary(lines)).toHaveLength(1)
  })
})
