/**
 * @jest-environment node
 *
 * GET /api/doc-translate/[id] — admin gating and job lookup.
 */
const mockView = jest.fn()
const mockCtx = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn().mockResolvedValue({}), createAdminClient: () => ({ admin: true }) }))
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => mockCtx(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))
jest.mock('@/lib/doc-translate/jobs', () => ({ getJobView: (...a) => mockView(...a) }))

const { GET } = require('../doc-translate/[id]/route')
const ID = '11111111-2222-4333-8444-555555555555'
const call = (id) => GET({ headers: new Map() }, { params: Promise.resolve({ id }) })

beforeEach(() => {
  mockView.mockReset()
  mockCtx.mockReset().mockResolvedValue({ user: { id: 'a' }, isAdmin: true })
})

describe('GET /api/doc-translate/[id]', () => {
  it('rejects anonymous users and non-admins', async () => {
    mockCtx.mockResolvedValue({ user: null, isAdmin: false })
    expect((await call(ID)).status).toBe(401)
    mockCtx.mockResolvedValue({ user: { id: 'b' }, isAdmin: false })
    expect((await call(ID)).status).toBe(403)
    expect(mockView).not.toHaveBeenCalled()
  })

  it('404s on a malformed id or a job that is not yours', async () => {
    expect((await call('not-a-uuid')).status).toBe(404)
    mockView.mockResolvedValue(null)
    expect((await call(ID)).status).toBe(404)
  })

  it('returns the job view for the caller', async () => {
    mockView.mockResolvedValue({ id: ID, status: 'running' })
    const res = await call(ID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ID, status: 'running' })
    expect(mockView).toHaveBeenCalledWith({ admin: true }, ID, 'a')
  })
})
