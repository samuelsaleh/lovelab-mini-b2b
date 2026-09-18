import { stockLabel, serialFromDescription, formatCarat } from '../igi/stockLabel'
import { buildReceiptItems, receiptReference } from '../igi/pushReceipt'
import { syncCertificateOuts } from '../igi/syncCertificateOuts'

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

describe('syncCertificateOuts', () => {
  function makeDb({ lastId = null, models = [] } = {}) {
    const writes = { upserts: [] }
    const api = {
      from(table) {
        if (table === 'igi_certificate_out_sync') {
          return {
            select: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: lastId == null ? null : { erp_out_id: lastId },
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: async (rows) => {
              writes.upserts.push(...rows)
              return { error: null }
            },
          }
        }
        if (table === 'igi_models') {
          return {
            select: () => ({
              in: async () => ({ data: models, error: null }),
            }),
          }
        }
        throw new Error(`unexpected ${table}`)
      },
    }
    return { api, writes }
  }

  it('upserts new ERP outs and matches by serial', async () => {
    const { api, writes } = makeDb({
      lastId: 10,
      models: [{ id: 'm1', serial: 'LGAJ6529', name: 'Cuty / Cubix / Long Moonlight' }],
    })

    const summary = await syncCertificateOuts(api, {
      fetchOuts: async () => ({
        success: true,
        data: [
          {
            id: 11,
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
      }),
    })

    expect(summary.fetched).toBe(1)
    expect(summary.matched).toBe(1)
    expect(writes.upserts[0]).toMatchObject({
      erp_out_id: 11,
      model_id: 'm1',
      serial: 'LGAJ6529',
      pcs: 2,
    })
  })

  it('reports unmatched descriptions', async () => {
    const { api } = makeDb({ models: [] })
    const summary = await syncCertificateOuts(api, {
      fetchOuts: async () => ({
        success: true,
        data: [{ id: 1, description: 'Unknown Thing · LGAJ9999 · 1 × 0,1 Round', pcs: 1 }],
      }),
    })
    expect(summary.matched).toBe(0)
    expect(summary.unmatched).toHaveLength(1)
  })
})
