/**
 * Unit tests for lib/packBuild.js — summarizeFormRows
 *
 * Guarantees a pack is never empty: from the persisted form_rows we can always
 * derive a human-readable per-collection description and a per-bracelet price
 * range (budget label).
 */

const { summarizeFormRows, totalForFormRows } = require('../packBuild')

function row(overrides = {}) {
  return {
    collection: 'CUTY',
    carat: '0.05',
    shape: '',
    bpColor: 'White',
    setting: '',
    size: 'M',
    colorCord: 'Royal Blue',
    quantity: '3',
    unitPrice: '30',
    cert: 'IGI',
    closure: 'nonBraided',
    ...overrides,
  }
}

describe('summarizeFormRows', () => {
  it('returns empty results for empty / invalid input', () => {
    expect(summarizeFormRows([])).toEqual({ description: [], budgetLabel: '' })
    expect(summarizeFormRows(null)).toEqual({ description: [], budgetLabel: '' })
    expect(summarizeFormRows(undefined)).toEqual({ description: [], budgetLabel: '' })
  })

  it('summarizes a single collection with carats, housing, size and closure', () => {
    const rows = [
      row({ carat: '0.05', bpColor: 'White', unitPrice: '30' }),
      row({ carat: '0.10', bpColor: 'Yellow', unitPrice: '40' }),
    ]
    const { description, budgetLabel } = summarizeFormRows(rows)
    expect(description).toEqual([
      'CUTY — 0.05 & 0.10 ct, White / Yellow, size M, non-braided',
    ])
    expect(budgetLabel).toBe('€30 – €40/bracelet')
  })

  it('sorts carats numerically regardless of row order', () => {
    const rows = [
      row({ carat: '0.30', unitPrice: '95' }),
      row({ carat: '0.15', unitPrice: '65' }),
    ]
    const { description } = summarizeFormRows(rows)
    expect(description[0]).toMatch(/CUTY — 0\.15 & 0\.30 ct/)
  })

  it('keeps one bullet per collection, in first-seen order', () => {
    const rows = [
      row({ collection: 'CUTY', carat: '0.05', size: 'M', unitPrice: '30' }),
      row({ collection: 'MULTI THREE', carat: '0.15', bpColor: 'WWW', size: 'M', unitPrice: '65', closure: '' }),
      row({ collection: 'CUTY', carat: '0.10', size: 'M', unitPrice: '40' }),
    ]
    const { description } = summarizeFormRows(rows)
    expect(description).toHaveLength(2)
    expect(description[0]).toMatch(/^CUTY/)
    expect(description[1]).toMatch(/^MULTI THREE/)
    // CUTY aggregates both carats even though they're not adjacent.
    expect(description[0]).toMatch(/0\.05 & 0\.10 ct/)
  })

  it('omits the closure annotation when the collection mixes closures or has none', () => {
    const mixed = [
      row({ closure: 'braided', unitPrice: '30' }),
      row({ closure: 'nonBraided', carat: '0.10', unitPrice: '40' }),
    ]
    expect(summarizeFormRows(mixed).description[0]).not.toMatch(/braided/)

    const none = [row({ collection: 'MULTI THREE', bpColor: 'WWW', closure: '', unitPrice: '65' })]
    expect(summarizeFormRows(none).description[0]).not.toMatch(/braided/)
  })

  it('shows a single price (no range) when all unit prices are equal', () => {
    const rows = [row({ unitPrice: '30' }), row({ carat: '0.10', unitPrice: '30' })]
    expect(summarizeFormRows(rows).budgetLabel).toBe('€30/bracelet')
  })

  it('budget range spans the min and max across all collections', () => {
    const rows = [
      row({ collection: 'CUTY', unitPrice: '24' }),
      row({ collection: 'MULTI THREE', bpColor: 'WWW', closure: '', unitPrice: '95' }),
    ]
    expect(summarizeFormRows(rows).budgetLabel).toBe('€24 – €95/bracelet')
  })

  it('groups grouped silk sizes together (CUBIX S/M)', () => {
    const rows = [
      row({ collection: 'CUBIX', size: 'S/M', carat: '0.05', bpColor: 'White', unitPrice: '30' }),
      row({ collection: 'CUBIX', size: 'S/M', carat: '0.10', bpColor: 'Yellow', unitPrice: '40' }),
    ]
    expect(summarizeFormRows(rows).description[0]).toBe(
      'CUBIX — 0.05 & 0.10 ct, White / Yellow, size S/M, non-braided',
    )
  })

  it('stays consistent with totalForFormRows for the same rows', () => {
    const rows = [row({ quantity: '3', unitPrice: '30' }), row({ quantity: '2', unitPrice: '40' })]
    // 3*30 + 2*40 = 170
    expect(totalForFormRows(rows)).toBe(170)
    // Budget label reflects the unit-price extremes, not the total.
    expect(summarizeFormRows(rows).budgetLabel).toBe('€30 – €40/bracelet')
  })
})
