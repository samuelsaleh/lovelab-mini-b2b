/**
 * @jest-environment node
 *
 * /api/doc-translations and /api/doc-translations/[id]/file — admin only.
 */
const mockList = jest.fn()
const mockFile = jest.fn()
const mockCtx = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn().mockResolvedValue({}), createAdminClient: () => ({ admin: true }) }))
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => mockCtx(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))
jest.mock('@/lib/doc-translate/library', () => ({ listTranslations: (...a) => mockList(...a), getTranslatedFile: (...a) => mockFile(...a) }))

const list = require('../doc-translations/route')
const file = require('../doc-translations/[id]/file/route')
const ID = '11111111-2222-4333-8444-555555555555'
const getList = () => list.GET({ headers: new Map() })
const getFile = (id = ID) => file.GET({ headers: new Map() }, { params: Promise.resolve({ id }) })

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([{ id: ID, name: 'x.pdf', path: `/api/doc-translations/${ID}/file` }])
  mockFile.mockReset().mockResolvedValue({ buffer: Buffer.from('%PDF-fake'), fileName: 'LoveLab Brand Presentation — English — French.pdf' })
  mockCtx.mockReset().mockResolvedValue({ user: { id: 'a' }, isAdmin: true })
})

describe.each([['list', getList], ['file', getFile]])('%s route access', (_n, call) => {
  it('rejects anonymous users with 401 and non-admins with 403', async () => {
    mockCtx.mockResolvedValue({ user: null, isAdmin: false })
    expect((await call()).status).toBe(401)
    mockCtx.mockResolvedValue({ user: { id: 'b' }, isAdmin: false })
    expect((await call()).status).toBe(403)
    expect(mockList).not.toHaveBeenCalled()
    expect(mockFile).not.toHaveBeenCalled()
  })
})

describe('GET /api/doc-translations', () => {
  it('returns the translated documents, never cached', async () => {
    const res = await getList()
    expect(res.status).toBe(200)
    expect((await res.json()).translations[0].id).toBe(ID)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
  it('answers 500 when storage fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockList.mockRejectedValue(new Error('boom'))
    expect((await getList()).status).toBe(500)
  })
})

describe('GET /api/doc-translations/[id]/file', () => {
  it('sends the PDF as a download with the display name', async () => {
    const res = await getFile()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('LoveLab Brand Presentation — English — French.pdf'))
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('%PDF-fake')
  })
  it('404s on an unknown translation', async () => {
    mockFile.mockResolvedValue(null)
    expect((await getFile()).status).toBe(404)
  })
})
