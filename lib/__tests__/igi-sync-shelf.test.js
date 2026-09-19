import { syncShelfSnapshot } from '../igi/syncShelf'

/**
 * Stand-in for the service-role client used by the certificate-stock shelf job.
 */
function makeSupabase({ models = [], descriptions = [] } = {}) {
  const writes = { snapshots: [], descriptions: [] }

  const api = {
    from(table) {
      if (table === 'igi_models') {
        return {
          select: () => ({
            not: async () => ({ data: models, error: null }),
          }),
        }
      }
      if (table === 'igi_descriptions') {
        return {
          select: async () => ({ data: descriptions, error: null }),
          upsert: async (rows) => { writes.descriptions.push(...rows); return { error: null } },
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

function feed(data, count) {
  return async () => ({
    success: true, branch_id: 10, country_stock: 'BELGIUM',
    count: count ?? data.length, data,
  })
}

const MODELS = [
  { id: 'm-6529', serial: 'LGAJ6529', name: 'Cuty / Cubix / Long Moonlight' },
  { id: 'm-6530', serial: 'LGAJ6530', name: 'Cuty / Cubix / Sienna 1' },
]

describe('certificate-stock shelf read', () => {
  it('matches lines to models by LGAJ serial', async () => {
    const { api, writes } = makeSupabase({ models: MODELS })
    const summary = await syncShelfSnapshot(api, {
      today: '2026-09-19',
      fetchStock: feed([
        { description: 'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round', total_pcs: 101 },
        { description: 'Cuty / Cubix / Sienna 1 · LGAJ6530 · 1 × 0,1 Round', total_pcs: 500 },
      ]),
    })
    expect(summary.source).toBe('certificate-stock')
    expect(summary.matched).toBe(2)
    expect(writes.snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ model_id: 'm-6529', total_pcs: 101 }),
      expect.objectContaining({ model_id: 'm-6530', total_pcs: 500 }),
    ]))
  })

  it('does not attach packing-style labels without a serial', async () => {
    const { api, writes } = makeSupabase({ models: MODELS })
    await syncShelfSnapshot(api, {
      today: '2026-09-19',
      fetchStock: feed([{ description: 'IGI 0.05 CERTIFICATE', total_pcs: 727 }]),
    })
    expect(writes.snapshots[0].model_id).toBeNull()
    expect(writes.snapshots[0].total_pcs).toBe(727)
  })

  it('flags truncation when count disagrees with lines', async () => {
    const { api } = makeSupabase({ models: MODELS })
    const summary = await syncShelfSnapshot(api, {
      today: '2026-09-19',
      fetchStock: feed([{ description: 'X · LGAJ6529 · 1 × 0,05 Round', total_pcs: 1 }], 99),
    })
    expect(summary.truncated).toBe(true)
  })
})
