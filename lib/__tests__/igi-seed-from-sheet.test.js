/**
 * IGI's spreadsheet into the seed (16 Sept 2026).
 *
 * The first seed was built by hand and its comment promised regeneration from
 * a newer file. This is that promise made real, pinned on the shapes the real
 * sheet actually has: a totals row, nine blank columns with only a total,
 * headers Excel misread as 2016, carats like 0.30000000000000004, and a
 * correction to a past day's figure.
 */
import { buildSeed, dateColumns, findTotalsRow, isSuspectDate, normaliseShape, expectedFigures } from '@/lib/igi/seedFromSheet'

// A miniature of Michael's sheet: 1-based header, rows as {col: value}.
const H = []
H[3] = 'Collection'; H[4] = '# ST'; H[5] = 'Crt'; H[6] = 'Shape'; H[7] = 'QTY'; H[8] = ''; H[9] = 'SERIAL #'
H[15] = '2026-05-05'; H[16] = '2016-06-01'; H[17] = '2026-08-26'; H[18] = '2026-09-15'
H[19] = null; H[20] = 'USED'; H[21] = 'REST'

const row = (serial, collection, stones, crt, shape, qty, cells = {}, used) => ({
  3: collection, 4: stones, 5: crt, 6: shape, 7: qty, 8: serial, 9: `${serial}2505`, ...cells, ...(used !== undefined ? { 20: used } : {}),
})

const ROWS = [
  row('LGAJ6532', 'Cuty - Cubix', 1, 0.3, 'Round', 250, { 15: 22, 17: 0, 18: 14 }, 36),
  row('LGAJ6535', 'Multi Three', 3, 0.6000000000000001, 'Round', 100, { 15: 3, 17: 14, 18: 1 }, 18),
  row('LGAJ6999', 'SHAPY SHINE', 1, 0.3, 'PEAR', 500, { 18: 2 }, 2),
  row('LGAJ6588', '', 4, 0.8, 'RD', 500, {}, undefined),   // reserved until now; IGI have produced 500
  row('LGAJ6589', '', 4, 1.2, 'RD', '', {}, undefined),    // still reserved: no quantity
  // totals row: only the odd column has a figure the rows do not
  { 15: 25, 16: 453, 17: 14, 18: 17 },
  { 15: 2471 }, // a period total — not the totals row (one date column only)
]

const PREVIOUS = {
  as_of: '2026-08-27',
  fee_eur: 1.2,
  models: [
    { serial: 'LGAJ6532', serial_full: 'LGAJ65322505', name: 'Cuty / Cubix / Sienna 1', igi_name: 'Cuty - Cubix', stones: '1', carat: 0.3, shape: 'Round', spec: null, state: 'in_use', qty_ordered: 250, sort_order: 5 },
    { serial: 'LGAJ6535', serial_full: 'LGAJ65352505', name: 'Multi 3', igi_name: 'Multi Three', stones: '3', carat: 0.6, shape: 'Round', spec: 'D/E', state: 'in_use', qty_ordered: 100, sort_order: 8 },
    { serial: 'LGAJ6588', serial_full: 'LGAJ65882607', name: '—', igi_name: '—', stones: '4', carat: 0.8, shape: 'Rd', spec: null, state: 'reserved', qty_ordered: null, sort_order: 6 },
    { serial: 'LGAJ6589', serial_full: 'LGAJ65892607', name: '—', igi_name: '—', stones: '4', carat: 1.2, shape: 'Rd', spec: null, state: 'reserved', qty_ordered: null, sort_order: 7 },
    { serial: null, serial_full: null, name: 'Full Moonlight', igi_name: null, stones: '1', carat: 0.5, shape: 'Round', spec: 'new certificate needed', state: 'awaiting_serial', qty_ordered: null, sort_order: 1000 },
  ],
  descriptions: [{ description: 'CUTY 0.30 RD', serial: 'LGAJ6532', kind: 'certificate' }],
  visits: [
    { visit_no: 1, visit_date: '2026-05-05', status: 'closed', date_suspect: false, unattributed_total: null, lines: [{ serial: 'LGAJ6532', qty: 22 }, { serial: 'LGAJ6535', qty: 3 }] },
    { visit_no: 2, visit_date: '2016-06-01', status: 'closed', date_suspect: true, unattributed_total: 453, lines: [] },
    { visit_no: 3, visit_date: '2026-08-26', status: 'closed', date_suspect: false, unattributed_total: null, lines: [{ serial: 'LGAJ6535', qty: 7 }] },
  ],
  batches: [
    { serial: 'LGAJ6532', qty: 250, batch_date: '2026-08-27', reference: 'initial order' },
    { serial: 'LGAJ6535', qty: 100, batch_date: '2026-08-27', reference: 'initial order' },
  ],
}

const build = (over = {}) => buildSeed({ header: H, rows: ROWS, previous: PREVIOUS, fee: 1.2, source: 'models_2.xlsx', ...over })

describe('reading the sheet', () => {
  it('finds the run of date columns and stops before USED', () => {
    expect(dateColumns(H)).toEqual([15, 16, 17, 18])
  })

  it('finds the totals row, and not a period total that sits under one column', () => {
    expect(findTotalsRow(ROWS, [15, 16, 17, 18])).toEqual({ 15: 25, 16: 453, 17: 14, 18: 17 })
  })

  it('treats a header from the wrong year as suspect', () => {
    expect(isSuspectDate('2016-06-01', '2026')).toBe(true)
    expect(isSuspectDate('2026-09-15', '2026')).toBe(false)
  })

  it('reads RD, ROUND and Round as one shape', () => {
    expect(['RD', 'ROUND', 'Round', 'round'].map(normaliseShape)).toEqual(['Round', 'Round', 'Round', 'Round'])
    expect(normaliseShape('PEAR')).toBe('Pear')
  })
})

describe('movements', () => {
  it('makes one movement per date column, numbered in order', () => {
    const { seed } = build()
    expect(seed.visits.map((v) => [v.visit_no, v.visit_date])).toEqual([
      [1, '2026-05-05'], [2, '2016-06-01'], [3, '2026-08-26'], [4, '2026-09-15'],
    ])
    expect(seed.as_of).toBe('2026-09-15')
  })

  it('records a blank column with only a total as a movement with no lines', () => {
    const { seed } = build()
    const june = seed.visits[1]
    expect(june.unattributed_total).toBe(453)
    expect(june.lines).toEqual([])
    expect(june.date_suspect).toBe(true)
  })

  it('takes a corrected past figure from the sheet, not from the old seed', () => {
    const { seed } = build()
    expect(seed.visits[2].lines).toEqual([{ serial: 'LGAJ6535', qty: 14 }])
  })

  it('ignores a zero, and never invents a total when the rows carry the figures', () => {
    const { seed } = build()
    expect(seed.visits[0].lines).toEqual([{ serial: 'LGAJ6532', qty: 22 }, { serial: 'LGAJ6535', qty: 3 }])
    expect(seed.visits[0].unattributed_total).toBeNull()
  })

  it('says so when the totals row and the rows disagree', () => {
    // The rows add up to 25 on 5 May; make the totals row claim 30.
    const rows = ROWS.map((r) => (r[16] === 453 ? { ...r, 15: 30 } : r))
    const { warnings } = build({ rows })
    expect(warnings).toContain('2026-05-05: the totals row says 30, the rows add up to 25')
  })

  it('is quiet when the totals row agrees with the rows', () => {
    const { warnings } = build()
    expect(warnings.filter((w) => w.includes('totals row'))).toEqual([])
  })
})

describe('models', () => {
  it('keeps LoveLab’s names, specs, states and order by serial', () => {
    const { seed } = build()
    const m = seed.models.find((x) => x.serial === 'LGAJ6535')
    expect(m.name).toBe('Multi 3')
    expect(m.spec).toBe('D/E')
    expect(m.sort_order).toBe(8)
    expect(m.state).toBe('in_use')
  })

  it('takes the quantity ordered from the sheet, and warns when it moved', () => {
    const { seed, warnings } = build({ rows: ROWS.map((r) => (r[8] === 'LGAJ6532' ? { ...r, 7: 700 } : r)) })
    expect(seed.models.find((x) => x.serial === 'LGAJ6532').qty_ordered).toBe(700)
    expect(warnings).toContain('LGAJ6532 Cuty / Cubix / Sienna 1: quantity ordered 250 → 700')
  })

  it('rounds the carat Excel could not write', () => {
    const { seed } = build()
    expect(seed.models.find((x) => x.serial === 'LGAJ6535').carat).toBe(0.6)
  })

  it('names a serial it has never seen from the sheet, with the shape for Shapy Shine, and flags it', () => {
    const { seed, warnings } = build()
    const fresh = seed.models.find((x) => x.serial === 'LGAJ6999')
    expect(fresh.name).toBe('Shapy Shine Pear')
    expect(fresh.igi_name).toBe('SHAPY SHINE')
    expect(fresh.state).toBe('in_use')
    expect(fresh.sort_order).toBe(9)
    expect(warnings.some((w) => w.startsWith('LGAJ6999: new in the sheet'))).toBe(true)
  })

  it('carries the models still waiting for a serial, which have no row', () => {
    const { seed } = build()
    expect(seed.models.filter((m) => !m.serial)).toEqual([PREVIOUS.models[4]])
  })

  it('puts a reserved serial in use the day IGI’s file gives it a quantity', () => {
    const { seed, warnings } = build()
    const produced = seed.models.find((x) => x.serial === 'LGAJ6588')
    expect(produced.state).toBe('in_use')
    expect(produced.qty_ordered).toBe(500)
    expect(produced.name).toBe('—') // still unnamed: that is for a person
    expect(warnings).toContain('LGAJ6588 —: reserved serial now carries 500 — produced by IGI, now in use. Name it on the Models screen.')
  })

  it('leaves a reserved serial reserved while the sheet gives it nothing', () => {
    const { seed } = build()
    const still = seed.models.find((x) => x.serial === 'LGAJ6589')
    expect(still.state).toBe('reserved')
    expect(still.qty_ordered).toBeNull()
  })

  it('warns about a serial that disappeared from the sheet', () => {
    const { warnings } = build({ rows: ROWS.filter((r) => r[8] !== 'LGAJ6535') })
    expect(warnings).toContain('LGAJ6535 Multi 3: in the previous seed but not in the sheet — kept out')
  })
})

describe('the sheet’s own arithmetic', () => {
  it('checks USED against the columns and says when they differ', () => {
    const { warnings } = build({ rows: ROWS.map((r) => (r[8] === 'LGAJ6532' ? { ...r, 20: 40 } : r)) })
    expect(warnings).toContain('LGAJ6532: USED says 40, the columns add up to 36')
  })

  it('is quiet when they agree', () => {
    const { warnings } = build()
    expect(warnings.filter((w) => w.includes('USED says'))).toEqual([])
  })
})

describe('batches, descriptions and the figures', () => {
  it('opens one batch per model in use, on the date the previous seed used', () => {
    const { seed } = build()
    expect(seed.batches).toEqual([
      { serial: 'LGAJ6532', qty: 250, batch_date: '2026-08-27', reference: 'initial order' },
      { serial: 'LGAJ6535', qty: 100, batch_date: '2026-08-27', reference: 'initial order' },
      { serial: 'LGAJ6999', qty: 500, batch_date: '2026-09-15', reference: 'initial order' },
      { serial: 'LGAJ6588', qty: 500, batch_date: '2026-09-15', reference: 'initial order' },
    ])
  })

  it('carries the description mapping untouched — it comes from the shelf, not the sheet', () => {
    const { seed } = build()
    expect(seed.descriptions).toEqual(PREVIOUS.descriptions)
    expect(seed.descriptions).not.toBe(PREVIOUS.descriptions)
  })

  it('computes what the importer must land on', () => {
    const { seed } = build()
    expect(expectedFigures(seed)).toEqual({
      'models in use': 4,
      'reserved serials': 1,
      'models awaiting a serial': 1,
      'certificates ordered': 1350,
      'issued with a model': 22 + 3 + 14 + 14 + 1 + 2,
      'issued with no model': 453,
      'issued in total': 56 + 453,
      'unissued at IGI': 1350 - 56,
      movements: 4,
      'descriptions classified': 1,
      'descriptions linked to a model': 1,
    })
  })

  it('keeps the fee and says where the figures came from', () => {
    const { seed } = build()
    expect(seed.fee_eur).toBe(1.2)
    expect(seed._comment).toContain('taken from models_2.xlsx as of 2026-09-15')
    expect(seed._comment).toContain('scripts/build-igi-seed.mjs')
  })
})
