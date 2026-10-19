/**
 * @jest-environment node
 *
 * /api/doc-translate — request validation and admin gating.
 */
const mockCreateJob = jest.fn()
const mockRunJob = jest.fn()
const mockCtx = jest.fn()
const mockAfter = jest.fn((fn) => fn())
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: (fn) => mockAfter(fn) }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn().mockResolvedValue({}), createAdminClient: () => ({ admin: true }) }))
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => mockCtx(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))
jest.mock('@/lib/doc-translate/jobs', () => ({ createJob: (...a) => mockCreateJob(...a), runJob: (...a) => mockRunJob(...a) }))

const { POST } = require('../doc-translate/route')
const PDF = '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf'
const req = (body) => ({ json: jest.fn().mockResolvedValue(body), headers: new Map() })

beforeEach(() => {
  mockCreateJob.mockReset().mockResolvedValue('job-1')
  mockRunJob.mockReset().mockResolvedValue()
  mockCtx.mockReset().mockResolvedValue({ user: { id: 'a' }, isAdmin: true })
})

describe('POST /api/doc-translate', () => {
  it('rejects anonymous users with 401', async () => {
    mockCtx.mockResolvedValue({ user: null, isAdmin: false })
    expect((await POST(req({ path: PDF, language: 'fr' }))).status).toBe(401)
    expect(mockCreateJob).not.toHaveBeenCalled()
  })

  it('rejects non-admins with 403', async () => {
    mockCtx.mockResolvedValue({ user: { id: 'b' }, isAdmin: false })
    expect((await POST(req({ path: PDF, language: 'fr' }))).status).toBe(403)
    expect(mockCreateJob).not.toHaveBeenCalled()
  })

  it('rejects an unknown path and a non-PDF file with 400', async () => {
    expect((await POST(req({ path: '/etc/passwd', language: 'fr' }))).status).toBe(400)
    expect((await POST(req({ path: '/IGI Excel/IGI_ORDERS_FILL.xlsx', language: 'fr' }))).status).toBe(400)
  })

  it('rejects an unsupported language with 400', async () => {
    expect((await POST(req({ path: PDF, language: 'xx' }))).status).toBe(400)
  })

  it('starts a job in the background and answers 202 with its id', async () => {
    const res = await POST(req({ path: PDF, language: 'fr' }))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ id: 'job-1' })
    expect(mockCreateJob).toHaveBeenCalledWith({ admin: true }, {
      userId: 'a',
      file: expect.objectContaining({ path: PDF }),
      language: expect.objectContaining({ code: 'fr' }),
    })
    expect(mockRunJob).toHaveBeenCalledWith({ admin: true }, expect.objectContaining({ id: 'job-1' }))
  })

  it('answers 500 when the job cannot be created', async () => {
    mockCreateJob.mockRejectedValue(new Error('no table'))
    expect((await POST(req({ path: PDF, language: 'fr' }))).status).toBe(500)
    expect(mockRunJob).not.toHaveBeenCalled()
  })
})
