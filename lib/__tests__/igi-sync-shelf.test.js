import { syncShelfSnapshot } from '../igi/syncShelf'

/**
 * A stand-in for the service-role client, recording what the job writes.
 * Only the four calls syncShelfSnapshot makes are modelled.
 */
function makeSupabase(descriptions) {
  const writes = { snapshots: [], newDescriptions: [], lastSeen: [] }

  const api = {
    from(table) {
      if (table === 'igi_descriptions') {
        return {
          select: async () => ({ data: descriptions, error: null }),
          upsert: async (rows) => { writes.newDescriptions.push(...rows); return { error: null } },
          update: () => ({
            in: async (_col, values) => { writes.lastSeen.push(...values); return { error: null } },
          }),
        }
      }
      if (table === 'igi_shelf_snapshots') {
        return {
          upsert: async (rows) => { writes.snapshots.push(...rows); return { error: null } },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { api, writes }
}

const MAPPED = [
  { description: 'IGI 0.10 CERTIFICATE', model_id: 'm-6530', kind: 'certificate' },
  { description: 'IGI MULTIFIVE0.25', model_id: 'm-6539', kind: 'certificate' },
  { description: 'IGI MULTIFIVE 0.50', model_id: 'm-6540', kind: 'certificate' },
  { description: 'ENVELOP PINK IGI', model_id: null, kind: 'packaging' },
  { description: 'INHOUSE CERTIFICATE  CUTY 0,10 WHITE', model_id: null, kind: 'in_house' },
  { description: 'BUTTER PAPER- LL NOTES FRENCH', model_id: null, kind: 'ignore' },
]

function feed(data, count) {
  return async () => ({
    success: true, branch_id: 10, country_stock: 'BELGIUM',
    count: count ?? data.length, data,
  })
}

const run = (descriptions, data, count) => {
  const { api, writes } = makeSupabase(descriptions)
  return syncShelfSnapshot(api, { today: '2026-08-28', fetchStock: feed(data, count) })
    .then((summary) => ({ summary, writes }))
}

describe('the nightly shelf read', () => {
  it('stores a dated snapshot for every line the ERP returns', async () => {
    const { summary, writes } = await run(MAPPED, [
      { description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 },
      { description: 'BUTTER PAPER- LL NOTES FRENCH', total_pcs: 1902 },
    ])
    expect(summary.lines_read).toBe(2)
    expect(writes.snapshots).toHaveLength(2)
    expect(writes.snapshots.every((s) => s.snapshot_date === '2026-08-28')).toBe(true)
  })

  it('attaches the model to a description a human has linked', async () => {
    const { writes } = await run(MAPPED, [{ description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 }])
    expect(writes.snapshots[0]).toMatchObject({ model_id: 'm-6530', total_pcs: 1006 })
  })

  it('matches on the exact string, so the two naming conventions stay apart', async () => {
    // The live feed really does hold both of these. A matcher that normalised
    // the space away could attach 0,25 stock to the 0,50 model, and nobody
    // would notice for weeks.
    const { writes } = await run(MAPPED, [
      { description: 'IGI MULTIFIVE0.25', total_pcs: 77 },
      { description: 'IGI MULTIFIVE 0.50', total_pcs: 46 },
    ])
    const byModel = Object.fromEntries(writes.snapshots.map((s) => [s.model_id, s.total_pcs]))
    expect(byModel['m-6539']).toBe(77)
    expect(byModel['m-6540']).toBe(46)
  })

  it('records an unknown description for a human instead of guessing a model', async () => {
    const { summary, writes } = await run(MAPPED, [
      { description: 'IGI BRAND NEW 0.15', total_pcs: 12 },
    ])
    expect(summary.new_descriptions).toEqual(['IGI BRAND NEW 0.15'])
    expect(writes.newDescriptions[0]).toMatchObject({
      description: 'IGI BRAND NEW 0.15', model_id: null, kind: 'certificate',
    })
    // Stored anyway, so the piece count is not lost while it waits to be linked.
    expect(writes.snapshots[0]).toMatchObject({ model_id: null, total_pcs: 12 })
  })

  it('parks a new non-IGI line rather than adding it to the linking queue', async () => {
    const { writes } = await run(MAPPED, [{ description: 'GIFT BOX SMALL', total_pcs: 500 }])
    expect(writes.newDescriptions[0].kind).toBe('ignore')
  })

  it('never writes a zero for a mapped description that stopped appearing', async () => {
    // An upstream rename would otherwise read as the entire shelf being packed
    // in one night, and fire a false "go collect".
    const { summary, writes } = await run(MAPPED, [
      { description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 },
    ])
    expect(summary.vanished_descriptions).toEqual(
      expect.arrayContaining(['IGI MULTIFIVE0.25', 'IGI MULTIFIVE 0.50']),
    )
    expect(writes.snapshots.map((s) => s.description)).toEqual(['IGI 0.10 CERTIFICATE'])
    expect(writes.snapshots.some((s) => s.total_pcs === 0)).toBe(false)
  })

  it('does not report an unmapped description as vanished', async () => {
    // Packaging and in-house lines have no model, so their absence is not a rename.
    const { summary } = await run(MAPPED, [
      { description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 },
      { description: 'IGI MULTIFIVE0.25', total_pcs: 77 },
      { description: 'IGI MULTIFIVE 0.50', total_pcs: 46 },
    ])
    expect(summary.vanished_descriptions).toEqual([])
  })

  it('counts only certificate lines towards the shelf total', async () => {
    const { summary } = await run(MAPPED, [
      { description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 },
      { description: 'ENVELOP PINK IGI', total_pcs: 2893 },
      { description: 'INHOUSE CERTIFICATE  CUTY 0,10 WHITE', total_pcs: 2001 },
      { description: 'BUTTER PAPER- LL NOTES FRENCH', total_pcs: 1902 },
    ])
    expect(summary.certificates_on_shelf).toBe(1006)
    expect(summary.matched).toBe(1)
  })

  it('flags a payload that returned fewer lines than it claimed', async () => {
    const { summary } = await run(MAPPED, [
      { description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 },
    ], 116)
    expect(summary.truncated).toBe(true)
  })

  it('is safe to run twice on the same day', async () => {
    const first = await run(MAPPED, [{ description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 }])
    const second = await run(MAPPED, [{ description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 }])
    // Same key both times, so the upsert overwrites rather than doubling.
    expect(first.writes.snapshots[0].snapshot_date)
      .toBe(second.writes.snapshots[0].snapshot_date)
    expect(second.writes.snapshots).toHaveLength(1)
  })

  it('skips a line with an unusable piece count instead of writing NaN', async () => {
    const { writes } = await run(MAPPED, [
      { description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006 },
      { description: 'IGI BROKEN', total_pcs: null },
    ])
    expect(writes.snapshots).toHaveLength(1)
  })

  it('lets a failed read through so the caller can leave yesterday standing', async () => {
    const { api } = makeSupabase(MAPPED)
    await expect(syncShelfSnapshot(api, {
      today: '2026-08-28',
      fetchStock: async () => { throw new Error('packing-stock returned HTTP 502') },
    })).rejects.toThrow('502')
  })
})

/**
 * The same job run against a real capture of GET /api/packing-stock, taken on
 * 28 August 2026, with the mapping table exactly as the seed loads it.
 *
 * This is the check that matters: it proves the mapping covers what the ERP
 * actually returns, rather than what we assumed it returns.
 */
describe('against the real packing-stock payload', () => {
  const payload = require('./fixtures/packing-stock-2026-08-28.json')
  const seed = require('../igi/seed.json')

  const descriptions = seed.descriptions.map((d) => ({
    description: d.description,
    model_id: d.serial ? `model:${d.serial}` : null,
    kind: d.kind,
  }))

  async function runLive() {
    const { api, writes } = makeSupabase(descriptions)
    const summary = await syncShelfSnapshot(api, {
      today: '2026-08-28',
      fetchStock: async () => payload,
    })
    return { summary, writes }
  }

  it('reads all 116 lines the ERP returns for branch 10', async () => {
    const { summary, writes } = await runLive()
    expect(payload.branch_id).toBe(10)
    expect(summary.lines_read).toBe(116)
    expect(writes.snapshots).toHaveLength(116)
  })

  it('matches 26 certificate lines totalling 3 504 pieces on the shelf', async () => {
    const { summary } = await runLive()
    expect(summary.matched).toBe(26)
    expect(summary.certificates_on_shelf).toBe(3504)
  })

  it('leaves nothing needing a human and reports nothing as vanished', async () => {
    const { summary } = await runLive()
    expect(summary.new_descriptions).toEqual([])
    expect(summary.vanished_descriptions).toEqual([])
  })

  it('keeps the envelopes and the in-house certificates out of the shelf total', async () => {
    const { writes } = await runLive()
    const kindOf = new Map(seed.descriptions.map((d) => [d.description, d.kind]))
    const bucket = (k) => writes.snapshots.filter((s) => kindOf.get(s.description) === k)

    // Three packing lines merely carry IGI in the name; nineteen are LoveLab's
    // own certificates, a separate product line that is out of scope here.
    expect(bucket('packaging')).toHaveLength(3)
    expect(bucket('in_house')).toHaveLength(19)
    expect(bucket('certificate')).toHaveLength(26)
    expect(bucket('ignore')).toHaveLength(68)

    // None of the three non-certificate kinds may carry a model.
    const notCertificates = [...bucket('packaging'), ...bucket('in_house'), ...bucket('ignore')]
    expect(notCertificates.every((s) => s.model_id === null)).toBe(true)
  })

  it('keeps the two spellings of MULTIFIVE attached to different models', async () => {
    const { writes } = await runLive()
    const a = writes.snapshots.find((s) => s.description === 'IGI MULTIFIVE0.25')
    const b = writes.snapshots.find((s) => s.description === 'IGI MULTIFIVE 0.50')
    expect(a.model_id).toBe('model:LGAJ6539')
    expect(b.model_id).toBe('model:LGAJ6540')
    expect(a.total_pcs).toBe(77)
    expect(b.total_pcs).toBe(46)
  })
})
