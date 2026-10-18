/**
 * @jest-environment node
 *
 * /api/doc-translate — request validation and admin gating.
 */
const mockEngine = jest.fn()
const mockCtx = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn().mockResolvedValue({}) }))
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => mockCtx(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))
jest.mock('@/lib/doc-translate/engine', () => ({ translateDocument: (...a) => mockEngine(...a) }))

const { POST } = require('../doc-translate/route')
const PDF = '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf'
const req = (body) => ({ json: jest.fn().mockResolvedValue(body), headers: new Map() })

beforeEach(() => {
  mockEngine.mockReset()
  mockCtx.mockReset().mockResolvedValue({ user: { id: 'a' }, isAdmin: true })
})

describe('POST /api/doc-translate', () => {
  it('rejects anonymous users with 401', async () => {
    mockCtx.mockResolvedValue({ user: null, isAdmin: false })
    expect((await POST(req({ path: PDF, language: 'fr' }))).status).toBe(401)
    expect(mockEngine).not.toHaveBeenCalled()
  })

  it('rejects non-admins with 403', async () => {
    mockCtx.mockResolvedValue({ user: { id: 'b' }, isAdmin: false })
    expect((await POST(req({ path: PDF, language: 'fr' }))).status).toBe(403)
    expect(mockEngine).not.toHaveBeenCalled()
  })

  it('rejects an unknown path and a non-PDF file with 400', async () => {
    expect((await POST(req({ path: '/etc/passwd', language: 'fr' }))).status).toBe(400)
    expect((await POST(req({ path: '/IGI Excel/IGI_ORDERS_FILL.xlsx', language: 'fr' }))).status).toBe(400)
  })

  it('rejects an unsupported language with 400', async () => {
    expect((await POST(req({ path: PDF, language: 'xx' }))).status).toBe(400)
  })

  it('hands a valid request to the engine and returns its result', async () => {
    mockEngine.mockResolvedValue({ ok: true, downloadUrl: '/x.pdf' })
    const res = await POST(req({ path: PDF, language: 'fr' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, downloadUrl: '/x.pdf' })
    expect(mockEngine).toHaveBeenCalledWith({
      file: expect.objectContaining({ path: PDF }),
      language: expect.objectContaining({ code: 'fr' }),
    })
  })

  it('passes the engine error status through', async () => {
    mockEngine.mockResolvedValue({ ok: false, status: 501, error: 'not connected' })
    const res = await POST(req({ path: PDF, language: 'fr' }))
    expect(res.status).toBe(501)
    expect((await res.json()).error).toBe('not connected')
  })
})
