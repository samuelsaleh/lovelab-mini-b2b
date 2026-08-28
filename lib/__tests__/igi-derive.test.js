import {
  poolOf, shelfOf, askedRightNow, shelfStatus, poolStatus, shortOf,
  monthOf, sameDayLabel, visitRef, visitTotal, unattributedTotal,
  feeFor, invoiceForMonth, formatCarat, formatQty, formatEur, modelSpec,
  FEE_EUR, THIN_SPACE,
} from '../igi/derive'
import { brusselsDate, brusselsToday, formatMonth } from '../igi/dates'
import seed from '../igi/seed.json'

// Rebuild the seed as the tables would hold it, so the reconciliation below is
// testing the same arithmetic the app will run.
function loadSeed() {
  const models = seed.models.map((m, i) => ({ ...m, id: `m${i}`, shelf_min: 25, pool_min: null }))
  const bySerial = new Map(models.filter((m) => m.serial).map((m) => [m.serial, m]))
  const batches = seed.batches.map((b) => ({ model_id: bySerial.get(b.serial).id, qty: b.qty }))
  const visits = seed.visits.map((v, i) => ({ ...v, id: `v${i}` }))
  const lines = []
  seed.visits.forEach((v, i) => v.lines.forEach((l) => lines.push({
    visit_id: `v${i}`,
    model_id: bySerial.get(l.serial).id,
    qty_requested: l.qty, qty_issued: l.qty, qty_received: l.qty,
  })))
  return { models, batches, visits, lines, bySerial }
}

describe('the opening balances reconcile with IGI file, 27 August 2026', () => {
  const { models, batches, visits, lines } = loadSeed()
  const inUse = models.filter((m) => m.state === 'in_use')

  it('carries 61 models in use, 15 reserved serials and 3 waiting for a serial', () => {
    expect(inUse).toHaveLength(61)
    expect(models.filter((m) => m.state === 'reserved')).toHaveLength(15)
    expect(models.filter((m) => m.state === 'awaiting_serial')).toHaveLength(3)
  })

  it('has 62 999 certificates ordered across the models', () => {
    expect(batches.reduce((t, b) => t + b.qty, 0)).toBe(62999)
  })

  it('splits the 7 023 issued into 3 778 with a model and 3 245 without', () => {
    const attributed = lines.reduce((t, l) => t + l.qty_issued, 0)
    const unattributed = unattributedTotal(visits)
    expect(attributed).toBe(3778)
    expect(unattributed).toBe(3245)
    expect(attributed + unattributed).toBe(7023)
  })

  it('leaves 59 221 unissued at IGI', () => {
    const unissued = inUse.reduce((t, m) => t + poolOf(m.id, batches, lines), 0)
    expect(unissued).toBe(59221)
  })

  it('records 23 movements, 4 of them with a mistyped year', () => {
    expect(visits).toHaveLength(23)
    expect(visits.filter((v) => v.date_suspect)).toHaveLength(4)
  })

  it('never attributes an unattributed movement to a model', () => {
    const gapVisits = visits.filter((v) => v.unattributed_total != null)
    expect(gapVisits).toHaveLength(9)
    for (const v of gapVisits) {
      expect(lines.filter((l) => l.visit_id === v.id)).toHaveLength(0)
      // It still counts towards the total — visible, not absorbed.
      expect(visitTotal(v, lines)).toBe(v.unattributed_total)
    }
  })

  it('maps all 116 ERP descriptions and leaves nothing needing a human', () => {
    expect(seed.descriptions).toHaveLength(116)
    expect(seed.descriptions.filter((d) => d.serial)).toHaveLength(26)
    const needsHuman = seed.descriptions.filter((d) => d.kind === 'certificate' && !d.serial)
    expect(needsHuman).toEqual([])
  })

  it('links every mapped description to a model that exists', () => {
    const { bySerial } = loadSeed()
    for (const d of seed.descriptions.filter((x) => x.serial)) {
      expect(bySerial.get(d.serial)).toBeDefined()
    }
  })
})

describe('IGI stock is the sum of batches less what was issued', () => {
  const model = { id: 'a' }
  it('adds every batch and subtracts every issued line', () => {
    const batches = [{ model_id: 'a', qty: 500 }, { model_id: 'a', qty: 250 }]
    const lines = [{ model_id: 'a', qty_issued: 60 }, { model_id: 'a', qty_issued: 40 }]
    expect(poolOf('a', batches, lines)).toBe(650)
  })

  it('ignores a line IGI has not confirmed yet', () => {
    const lines = [{ model_id: 'a', qty_requested: 100, qty_issued: null }]
    expect(poolOf('a', [{ model_id: 'a', qty: 500 }], lines)).toBe(500)
  })

  it('counts what IGI actually made, not what was asked', () => {
    const lines = [{ model_id: 'a', qty_requested: 100, qty_issued: 40 }]
    expect(poolOf('a', [{ model_id: 'a', qty: 500 }], lines)).toBe(460)
  })

  it('never mixes one model into another', () => {
    const batches = [{ model_id: 'a', qty: 500 }, { model_id: 'b', qty: 900 }]
    const lines = [{ model_id: 'b', qty_issued: 100 }]
    expect(poolOf('a', batches, lines)).toBe(500)
  })
})

describe("LoveLab's shelf comes from the latest snapshot", () => {
  it('takes the most recent date, not the last row', () => {
    const snaps = [
      { model_id: 'a', snapshot_date: '2026-08-26', total_pcs: 900 },
      { model_id: 'a', snapshot_date: '2026-08-28', total_pcs: 1006 },
      { model_id: 'a', snapshot_date: '2026-08-27', total_pcs: 950 },
    ]
    expect(shelfOf('a', snaps)).toBe(1006)
  })

  it('is null, not zero, for a model no snapshot has ever carried', () => {
    // "Not mapped" and "none left" are different answers and must read differently.
    expect(shelfOf('a', [])).toBeNull()
    expect(shelfStatus({ shelf_min: 25 }, shelfOf('a', []))).toBe('unmapped')
  })
})

describe('asked right now — the only LoveLab figure IGI sees', () => {
  const visits = [
    { id: 'v1', status: 'requested' },
    { id: 'v2', status: 'issued' },
    { id: 'v3', status: 'closed' },
  ]
  const lines = [
    { visit_id: 'v1', model_id: 'a', qty_requested: 50 },
    { visit_id: 'v1', model_id: 'a', qty_requested: 20 },
    { visit_id: 'v2', model_id: 'a', qty_requested: 999 },
    { visit_id: 'v3', model_id: 'a', qty_requested: 999 },
  ]

  it('counts open requests only', () => {
    expect(askedRightNow('a', lines, visits)).toBe(70)
  })

  it('is zero when nothing is open', () => {
    expect(askedRightNow('a', lines, [{ id: 'v3', status: 'closed' }])).toBe(0)
  })
})

describe('the two alert rules', () => {
  it('tells LoveLab to go collect below their own level', () => {
    const m = { shelf_min: 100 }
    expect(shelfStatus(m, 40)).toBe('collect')
    expect(shelfStatus(m, 150)).toBe('watch')
    expect(shelfStatus(m, 500)).toBe('fine')
  })

  it('tells IGI to produce more below their own level', () => {
    const m = { pool_min: 100 }
    expect(poolStatus(m, 40)).toBe('reorder')
    expect(poolStatus(m, 150)).toBe('watch')
    expect(poolStatus(m, 500)).toBe('fine')
  })

  it('stays quiet when IGI has set no level of their own', () => {
    expect(poolStatus({ pool_min: null }, 3)).toBe('fine')
  })

  it('defaults LoveLab to 25 when none is set', () => {
    expect(shelfStatus({}, 20)).toBe('collect')
    expect(shelfStatus({}, 30)).toBe('watch')
  })
})

describe('shortage', () => {
  const visit = { id: 'v1' }
  const lines = [
    { visit_id: 'v1', model_id: 'a', qty_requested: 500 },
    { visit_id: 'v1', model_id: 'b', qty_requested: 10 },
  ]

  it('reports the gap when a request exceeds what IGI holds', () => {
    expect(shortOf(visit, lines, { a: 41, b: 900 })).toEqual([
      { model_id: 'a', asked: 500, held: 41, gap: 459 },
    ])
  })

  it('says nothing when IGI holds exactly enough', () => {
    expect(shortOf(visit, lines, { a: 500, b: 10 })).toEqual([])
  })

  it('does not guess for a model with no count yet', () => {
    expect(shortOf(visit, lines, { b: 900 })).toEqual([])
  })
})

describe('the four mistyped movement dates', () => {
  // Movement 9 reads 2016 in IGI's file; it happened between movements 8 and 11.
  const visits = [
    { visit_no: 8, visit_date: '2026-06-12', date_suspect: false },
    { visit_no: 9, visit_date: '2016-06-01', date_suspect: true },
    { visit_no: 10, visit_date: '2024-06-01', date_suspect: true },
    { visit_no: 11, visit_date: '2026-07-03', date_suspect: false },
  ]

  it('inherits the month of the last sound movement instead of believing 2016', () => {
    expect(monthOf(visits[1], visits)).toBe('June 2026')
    expect(monthOf(visits[2], visits)).toBe('June 2026')
  })

  it('leaves sound movements alone', () => {
    expect(monthOf(visits[3], visits)).toBe('July 2026')
  })

  it('keeps the date exactly as the file wrote it', () => {
    // The source is never quietly corrected — only its reporting month is inferred.
    expect(visits[1].visit_date).toBe('2016-06-01')
  })
})

describe('two movements on the same day', () => {
  const visits = [
    { visit_no: 18, visit_date: '2026-08-24' },
    { visit_no: 19, visit_date: '2026-08-24' },
    { visit_no: 22, visit_date: '2026-08-26' },
  ]

  it('numbers them so neither is mistaken for the other', () => {
    expect(sameDayLabel(visits[0], visits)).toBe('1 of 2')
    expect(sameDayLabel(visits[1], visits)).toBe('2 of 2')
  })

  it('says nothing when a day had only one', () => {
    expect(sameDayLabel(visits[2], visits)).toBe('')
  })

  it('gives each its own reference', () => {
    expect(visitRef(visits[0])).toBe('V-018')
    expect(visitRef(visits[1])).toBe('V-019')
  })
})

describe('invoicing at €1,20 a certificate', () => {
  it('charges the agreed fee', () => {
    expect(FEE_EUR).toBe(1.2)
    expect(feeFor(1000)).toBe(1200)
    expect(feeFor(207)).toBe(248.4)
  })

  it('bills a month model by model and keeps the gap on its own line', () => {
    const visits = [
      { id: 'v1', visit_date: '2026-08-24', status: 'closed', unattributed_total: null },
      { id: 'v2', visit_date: '2026-08-25', status: 'closed', unattributed_total: 100 },
      { id: 'v3', visit_date: '2026-07-03', status: 'closed', unattributed_total: null },
    ]
    const lines = [
      { visit_id: 'v1', model_id: 'a', qty_issued: 60, qty_received: 60 },
      { visit_id: 'v1', model_id: 'b', qty_issued: 40, qty_received: 40 },
      { visit_id: 'v3', model_id: 'a', qty_issued: 999, qty_received: 999 },
    ]
    const inv = invoiceForMonth('2026-08', visits, lines)
    expect(inv.rows).toEqual([
      { model_id: 'a', qty: 60, eur: 72 },
      { model_id: 'b', qty: 40, eur: 48 },
    ])
    expect(inv.unattributed).toBe(100)
    expect(inv.qty).toBe(200)
    expect(inv.eur).toBe(240)
  })
})

describe('a serial never appears without its carat and shape', () => {
  it('spells out stones, carat and shape', () => {
    expect(modelSpec({ stones: '1', carat: 0.1, shape: 'Round' })).toBe('1 st · 0,10 ct · Round')
  })

  it('handles the multi-stone settings that are not plain numbers', () => {
    expect(modelSpec({ stones: '6+1', carat: 1.5, shape: 'Round' })).toBe('6+1 st · 1,50 ct · Round')
  })

  it('distinguishes the two serials that are easily confused', () => {
    // LGAJ6529 and LGAJ6530 differ only in carat, which is why it must be shown.
    expect(modelSpec({ stones: '1', carat: 0.05, shape: 'Round' }))
      .not.toBe(modelSpec({ stones: '1', carat: 0.1, shape: 'Round' }))
  })
})

describe('formatting', () => {
  it('writes carats with a comma', () => {
    expect(formatCarat(0.05)).toBe('0,05')
    expect(formatCarat(1)).toBe('1,00')
    expect(formatCarat(null)).toBe('—')
  })

  it('groups thousands with the separator a Belgian invoice uses', () => {
    expect(THIN_SPACE).toBe('\u202f')   // narrow no-break space, not a plain space
    expect(formatQty(59221)).toBe(`59${THIN_SPACE}221`)
    expect(formatQty(3504)).toBe(`3${THIN_SPACE}504`)
    expect(formatQty(999)).toBe('999')
    expect(formatQty(null)).toBe('—')
  })

  it('writes euros the way the invoice does', () => {
    expect(formatEur(1207.2)).toBe(`€ 1${THIN_SPACE}207,20`)
    expect(formatEur(0)).toBe('€ 0,00')
  })
})

describe('business dates are Antwerp dates, not UTC', () => {
  it('does not roll over early on a summer evening', () => {
    // 21:30 UTC is 23:30 in Brussels — still the same day.
    expect(brusselsDate('2026-08-27T21:30:00Z')).toBe('2026-08-27')
  })

  it('rolls over when Antwerp does', () => {
    expect(brusselsDate('2026-08-27T22:30:00Z')).toBe('2026-08-28')
  })

  it('rolls over an hour later in winter', () => {
    expect(brusselsDate('2026-01-27T22:30:00Z')).toBe('2026-01-27')
    expect(brusselsDate('2026-01-27T23:30:00Z')).toBe('2026-01-28')
  })

  it('returns a plain YYYY-MM-DD', () => {
    expect(brusselsToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('names the month for the invoice header', () => {
    expect(formatMonth('2026-06-16')).toBe('June 2026')
  })
})
