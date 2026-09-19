import {
  masterLabelForModel,
  pushModelsToCertificateMaster,
  syncAllModelsToCertificateMaster,
} from '../igi/syncCertificateMasters'

describe('syncCertificateMasters', () => {
  it('builds stock labels only when serial is present', () => {
    expect(masterLabelForModel({ name: 'Cuty', serial: null })).toBeNull()
    expect(masterLabelForModel({
      name: 'Cuty / Cubix / Long Moonlight',
      serial: 'LGAJ6529',
      stones: 1,
      carat: 0.05,
      shape: 'Round',
    })).toMatch(/LGAJ6529/)
  })

  it('pushes unique labels to ERP', async () => {
    const upsert = jest.fn().mockResolvedValue({ success: true, created: 3 })
    const out = await pushModelsToCertificateMaster([
      { name: 'A', serial: 'LGAJ1', stones: 1, carat: 0.05, shape: 'Round' },
      { name: 'A', serial: 'LGAJ1', stones: 1, carat: 0.05, shape: 'Round' },
      { name: 'B', serial: null },
    ], { upsert })

    expect(out.skipped).toBe(false)
    expect(out.count).toBe(1)
    expect(upsert).toHaveBeenCalledWith({
      names: [expect.stringContaining('LGAJ1')],
    })
  })

  it('skips when no numbered models', async () => {
    const upsert = jest.fn()
    const out = await pushModelsToCertificateMaster([{ name: 'X' }], { upsert })
    expect(out.skipped).toBe(true)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('loads numbered models from supabase for cron sync', async () => {
    const upsert = jest.fn().mockResolvedValue({ success: true })
    const db = {
      from: jest.fn(() => ({
        select: () => ({
          not: () => ({
            in: jest.fn().mockResolvedValue({
              data: [{ name: 'M', serial: 'LGAJ9', stones: 1, carat: 0.1, shape: 'Round' }],
              error: null,
            }),
          }),
        }),
      })),
    }

    const out = await syncAllModelsToCertificateMaster(db, { upsert })
    expect(out.count).toBe(1)
    expect(upsert).toHaveBeenCalled()
  })
})
