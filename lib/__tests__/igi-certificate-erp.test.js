import { stockLabel, serialFromDescription, formatCarat } from '../igi/stockLabel'
import { buildReceiptItems, receiptReference } from '../igi/pushReceipt'
import { syncCertificateOuts } from '../igi/syncCertificateOuts'
import { syncCertificateIns, isB2bOriginatedIn, deleteMissing } from '../igi/syncCertificateIns'

describe('stockLabel', () => {
  it('matches LoveLab / B2B stock row for LGAJ6529', () => {
    expect(stockLabel({
      name: 'Cuty / Cubix / Long Moonlight',
      serial: 'LGAJ6529',
      stones: '1',
      carat: 0.05,
      shape: 'Round',
    })).toBe('Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round')
  })

  it('includes fancy colour spec', () => {
    expect(stockLabel({
      name: 'Cuty Fancy Color',
      serial: 'LGAJ6576',
      stones: '1',
      carat: 0.05,
      shape: 'Round',
      spec: 'Fancy Vivid Yellow',
    })).toBe('Cuty Fancy Color · LGAJ6576 · 1 × 0,05 Round · Fancy Vivid Yellow')
  })

  it('omits em-dash placeholder names', () => {
    expect(stockLabel({
      name: '—',
      serial: 'LGAJ6588',
      stones: '4',
      carat: 0.8,
      shape: 'Rd',
    })).toBe('LGAJ6588 · 4 × 0,8 Rd')
  })

  it('formats carat with a comma', () => {
    expect(formatCarat(0.1)).toBe('0,1')
    expect(formatCarat(1)).toBe('1')
  })
})

describe('serialFromDescription', () => {
  it('extracts the IGI serial from a LoveLab master label', () => {
    expect(serialFromDescription(
      'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round',
    )).toBe('LGAJ6529')
  })

  it('returns null when no serial is present', () => {
    expect(serialFromDescription('Full Moonlight · 1 × 0,5 Round · new certificate needed')).toBeNull()
  })
})

describe('buildReceiptItems', () => {
  it('builds ERP lines from received quantities', () => {
    const models = new Map([
      ['m1', { id: 'm1', name: 'Cuty-Cubix', serial: 'LGAJ6530', stones: '1', carat: 0.1, shape: 'Round' }],
    ])
    const items = buildReceiptItems(
      [{ model_id: 'm1', qty_received: 12 }, { model_id: 'm1', qty_received: 0 }],
      models,
    )
    expect(items).toEqual([
      { description: 'Cuty-Cubix · LGAJ6530 · 1 × 0,1 Round', pcs: 12, model_id: 'm1' },
    ])
  })

  it('builds a stable receipt reference per visit', () => {
    expect(receiptReference({ id: 'abc-123' })).toBe('visit:abc-123')
  })
})

describe('isB2bOriginatedIn', () => {
  it('detects visit: external refs', () => {
    expect(isB2bOriginatedIn('visit:abc')).toBe(true)
    expect(isB2bOriginatedIn(null)).toBe(false)
    expect(isB2bOriginatedIn('manual-1')).toBe(false)
  })
})

function makeSyncDb(table, { models = [], localIds = [], idKey = 'erp_out_id' } = {}) {
  const writes = { upserts: [], deletes: [] }
  const api = {
    from(name) {
      if (name === table) {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: localIds.length
                    ? { [idKey]: Math.max(...localIds) }
                    : null,
                  error: null,
                }),
              }),
            }),
            then: (resolve) => resolve({
              data: localIds.map((id) => ({ [idKey]: id })),
              error: null,
            }),
          }),
          upsert: async (rows) => {
            writes.upserts.push(...rows)
            return { error: null }
          },
          delete: () => ({
            in: async (_col, ids) => {
              writes.deletes.push(...ids)
              return { error: null }
            },
          }),
        }
      }
      if (name === 'igi_models') {
        return {
          select: () => ({
            in: async () => ({ data: models, error: null }),
          }),
        }
      }
      throw new Error(`unexpected ${name}`)
    },
  }
  return { api, writes }
}

describe('syncCertificateOuts', () => {
  it('full reconcile upserts ERP outs and deletes missing local rows', async () => {
    const { api, writes } = makeSyncDb('igi_certificate_out_sync', {
      models: [{ id: 'm1', serial: 'LGAJ6529', name: 'Cuty / Cubix / Long Moonlight' }],
      localIds: [10, 99],
      idKey: 'erp_out_id',
    })

    const summary = await syncCertificateOuts(api, {
      fetchOuts: async ({ since_id }) => {
        if (since_id > 0) return { success: true, data: [] }
        return {
          success: true,
          data: [
            {
              id: 10,
              invoice_no: '5',
              date: '2026-09-18',
              party: 'SHOP',
              description: 'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round',
              pcs: 2,
              remark: '',
              source: 'manual',
              external_ref: null,
            },
          ],
        }
      },
    })

    expect(summary.mode).toBe('full')
    expect(summary.fetched).toBe(1)
    expect(summary.matched).toBe(1)
    expect(summary.deleted).toBe(1)
    expect(writes.deletes).toContain(99)
    expect(writes.upserts[0]).toMatchObject({
      erp_out_id: 10,
      model_id: 'm1',
      serial: 'LGAJ6529',
      pcs: 2,
    })
  })

  it('reports unmatched descriptions', async () => {
    const { api } = makeSyncDb('igi_certificate_out_sync', { models: [], idKey: 'erp_out_id' })
    const summary = await syncCertificateOuts(api, {
      fetchOuts: async () => ({
        success: true,
        data: [{ id: 1, description: 'Unknown Thing · LGAJ9999 · 1 × 0,1 Round', pcs: 1 }],
      }),
    })
    expect(summary.matched).toBe(0)
    expect(summary.unmatched).toHaveLength(1)
  })

  it('incremental mode still works for tests', async () => {
    const { api, writes } = makeSyncDb('igi_certificate_out_sync', {
      localIds: [10],
      models: [{ id: 'm1', serial: 'LGAJ6529', name: 'Cuty' }],
      idKey: 'erp_out_id',
    })
    const summary = await syncCertificateOuts(api, {
      full: false,
      fetchOuts: async () => ({
        success: true,
        data: [{
          id: 11,
          description: 'Cuty · LGAJ6529 · 1 × 0,05 Round',
          pcs: 3,
        }],
      }),
    })
    expect(summary.mode).toBe('incremental')
    expect(summary.deleted).toBe(0)
    expect(writes.upserts[0].erp_out_id).toBe(11)
  })
})

describe('syncCertificateIns', () => {
  it('full reconcile upserts ins and drops deleted ERP rows', async () => {
    const { api, writes } = makeSyncDb('igi_certificate_in_sync', {
      models: [{ id: 'm1', serial: 'LGAJ6529', name: 'Cuty / Cubix / Long Moonlight' }],
      localIds: [5, 6, 50],
      idKey: 'erp_in_id',
    })

    const summary = await syncCertificateIns(api, {
      fetchIns: async ({ since_id }) => {
        if (since_id > 0) return { success: true, data: [] }
        return {
          success: true,
          data: [
            {
              id: 5,
              invoice_no: '2',
              date: '2026-09-18',
              party: 'IGI',
              description: 'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round',
              pcs: 2,
              source: 'manual',
              external_ref: null,
            },
            {
              id: 6,
              description: 'Cuty / Cubix / Long Moonlight · LGAJ6529 · 1 × 0,05 Round',
              pcs: 2,
              source: 'api',
              external_ref: 'visit:abc',
            },
          ],
        }
      },
    })

    expect(summary.mode).toBe('full')
    expect(summary.fetched).toBe(2)
    expect(summary.from_b2b).toBe(1)
    expect(summary.matched).toBe(2)
    expect(summary.deleted).toBe(1)
    expect(writes.deletes).toContain(50)
  })
})

describe('deleteMissing', () => {
  it('removes local ids not in the remote set', async () => {
    const { api, writes } = makeSyncDb('igi_certificate_in_sync', {
      localIds: [1, 2, 3],
      idKey: 'erp_in_id',
    })
    const n = await deleteMissing(api, 'igi_certificate_in_sync', 'erp_in_id', [1, 3])
    expect(n).toBe(1)
    expect(writes.deletes).toEqual([2])
  })
})
