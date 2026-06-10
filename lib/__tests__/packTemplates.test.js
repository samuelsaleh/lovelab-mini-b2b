/**
 * lib/packTemplates.js — storage wrapper + helpers.
 *
 * generatePackExcelBuffer is mocked so these tests stay fast and focus on the
 * storage/listing/self-heal logic rather than ExcelJS internals (covered in
 * packExcel.test.js).
 */

const mockGenerate = jest.fn().mockResolvedValue(Buffer.from('xlsx-bytes'))
jest.mock('@/lib/packExcel', () => ({
  generatePackExcelBuffer: (...args) => mockGenerate(...args),
}))

import {
  packTemplateFileName,
  packTemplateObjectKey,
  packTemplateDownloadPath,
  packTemplateIdFromPath,
  regeneratePackTemplate,
  deletePackTemplate,
  resolvePackTemplate,
  listPackTemplates,
} from '@/lib/packTemplates'

const UUID = 'a3f9c0de-1111-2222-3333-444455556666'

function makeAdmin({ fromResult = { data: null, error: null }, downloadResult = { data: null, error: { message: 'Object not found' } } } = {}) {
  const storageApi = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    remove: jest.fn().mockResolvedValue({ error: null }),
    download: jest.fn().mockResolvedValue(downloadResult),
  }
  const fromChain = {
    select() { return fromChain },
    eq() { return fromChain },
    in() { return fromChain },
    order() { return fromChain },
    maybeSingle() { return Promise.resolve(fromResult) },
    then(resolve) { return Promise.resolve(fromResult).then(resolve) },
  }
  return {
    storage: { from: jest.fn(() => storageApi) },
    from: jest.fn(() => fromChain),
    _storageApi: storageApi,
  }
}

beforeEach(() => {
  mockGenerate.mockClear()
  mockGenerate.mockResolvedValue(Buffer.from('xlsx-bytes'))
})

describe('pure helpers', () => {
  it('packTemplateFileName slugs the label safely', () => {
    expect(packTemplateFileName('Pack 1')).toBe('LoveLab_Order_Template_Pack_1.xlsx')
    expect(packTemplateFileName('PACK 6-RB-SYN')).toBe('LoveLab_Order_Template_PACK_6-RB-SYN.xlsx')
    expect(packTemplateFileName('')).toBe('LoveLab_Order_Template_Pack.xlsx')
  })

  it('object key + download path are id-based and reversible', () => {
    expect(packTemplateObjectKey(UUID)).toBe(`${UUID}.xlsx`)
    expect(packTemplateDownloadPath(UUID)).toBe(`/api/pack-templates/${UUID}/download`)
    expect(packTemplateIdFromPath(`/api/pack-templates/${UUID}/download`)).toBe(UUID)
    expect(packTemplateIdFromPath('/LoveLab Excel Packs/whatever.xlsx')).toBeNull()
    expect(packTemplateIdFromPath('/api/pack-templates/not-a-uuid/download')).toBeNull()
    expect(packTemplateIdFromPath(null)).toBeNull()
  })
})

describe('regeneratePackTemplate', () => {
  it('uploads {id}.xlsx with upsert + xlsx content-type', async () => {
    const admin = makeAdmin()
    await regeneratePackTemplate(admin, { id: UUID, label: 'Pack 1', form_rows: [] })

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(admin.storage.from).toHaveBeenCalledWith('pack-templates')
    const [key, buffer, opts] = admin._storageApi.upload.mock.calls[0]
    expect(key).toBe(`${UUID}.xlsx`)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(opts.upsert).toBe(true)
    expect(opts.contentType).toMatch(/spreadsheetml/)
  })

  it('throws when the upload fails', async () => {
    const admin = makeAdmin()
    admin._storageApi.upload.mockResolvedValueOnce({ error: { message: 'boom' } })
    await expect(regeneratePackTemplate(admin, { id: UUID, label: 'X', form_rows: [] })).rejects.toThrow(/boom/)
  })
})

describe('deletePackTemplate', () => {
  it('removes the {id}.xlsx object', async () => {
    const admin = makeAdmin()
    await deletePackTemplate(admin, UUID)
    expect(admin._storageApi.remove).toHaveBeenCalledWith([`${UUID}.xlsx`])
  })
})

describe('resolvePackTemplate (self-heal)', () => {
  it('returns null when the pack does not exist', async () => {
    const admin = makeAdmin({ fromResult: { data: null, error: null } })
    expect(await resolvePackTemplate(admin, UUID)).toBeNull()
  })

  it('regenerates + uploads when the stored object is missing', async () => {
    const admin = makeAdmin({
      fromResult: { data: { id: UUID, label: 'Pack 1', form_rows: [] }, error: null },
      downloadResult: { data: null, error: { message: 'Object not found' } },
    })
    const res = await resolvePackTemplate(admin, UUID)
    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(admin._storageApi.upload).toHaveBeenCalled() // best-effort cache write
    expect(res.fileName).toBe('LoveLab_Order_Template_Pack_1.xlsx')
    expect(res.buffer.toString()).toBe('xlsx-bytes')
  })

  it('returns the stored bytes without regenerating on a cache hit', async () => {
    const admin = makeAdmin({
      fromResult: { data: { id: UUID, label: 'Pack 2', form_rows: [] }, error: null },
      downloadResult: { data: { arrayBuffer: async () => Buffer.from('cached-xlsx') }, error: null },
    })
    const res = await resolvePackTemplate(admin, UUID)
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(res.fileName).toBe('LoveLab_Order_Template_Pack_2.xlsx')
    expect(res.buffer.toString()).toBe('cached-xlsx')
  })
})

describe('listPackTemplates', () => {
  it('maps global + restricted (and seed) packs to {id, label, fileName}', async () => {
    const admin = makeAdmin({
      fromResult: {
        data: [
          { id: 'p1', label: 'Pack 1', scope: 'global', is_seed: true },
          { id: 'p5', label: 'PACK 5-SYN-ADD-RB', scope: 'restricted', is_seed: true },
          { id: 'p6', label: 'PACK 6-RB-SYN', scope: 'restricted', is_seed: true },
        ],
        error: null,
      },
    })
    const out = await listPackTemplates(admin)
    // Restricted packs must appear in the admin Packs folder, not just global.
    expect(out).toEqual([
      { id: 'p1', label: 'Pack 1', fileName: 'LoveLab_Order_Template_Pack_1.xlsx' },
      { id: 'p5', label: 'PACK 5-SYN-ADD-RB', fileName: 'LoveLab_Order_Template_PACK_5-SYN-ADD-RB.xlsx' },
      { id: 'p6', label: 'PACK 6-RB-SYN', fileName: 'LoveLab_Order_Template_PACK_6-RB-SYN.xlsx' },
    ])
  })

  it('queries non-private scopes only (excludes agents private packs)', async () => {
    const admin = makeAdmin({ fromResult: { data: [], error: null } })
    const inSpy = jest.fn(() => admin.from())
    // Re-wire the chain's .in to capture its arguments.
    admin.from = jest.fn(() => ({
      select() { return this },
      in: inSpy,
      eq() { return this },
      order() { return this },
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve) },
    }))
    // inSpy must return a chain with order()/then() so the call resolves.
    inSpy.mockImplementation(() => ({
      order() { return this },
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve) },
    }))

    await listPackTemplates(admin)
    expect(inSpy).toHaveBeenCalledWith('scope', ['global', 'restricted'])
  })
})
