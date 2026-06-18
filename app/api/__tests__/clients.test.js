/**
 * @jest-environment node
 *
 * GET/POST /api/clients — unit tests
 *
 * Guarantees:
 *   - The client directory is shared: agents (non-admins) see ALL clients,
 *     not just the ones they created. No created_by filter is applied.
 *   - Search filters are still applied on top of the shared directory.
 *   - The non-admin result set is capped at 2000 (same as admins) so large
 *     shared directories are actually browsable.
 *   - POST update by a non-admin on a client they DON'T own does not 500;
 *     it returns the existing record read-only instead of overwriting it.
 *   - POST update by the owner still persists changes normally.
 */

// ── Mock Supabase query chain ────────────────────────────────────────────────

const mockQuery = {
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  limit: jest.fn(),
  maybeSingle: jest.fn(),
  single: jest.fn(),
}

const mockAdminSupabase = {
  from: jest.fn(() => mockQuery),
}

// Regular (RLS) client used for auth.getUser + profile role lookup + insert.
let mockUser = { id: 'agent-1' }
let mockRole = 'member'

const mockRegularSupabase = {
  auth: {
    getUser: jest.fn(async () => ({ data: { user: mockUser } })),
  },
  from: jest.fn(() => mockQuery),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockRegularSupabase),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

jest.mock('@/app/api/_lib/access', () => ({
  resolveAgentIds: jest.fn(async (_c, id) => [id]),
}))

const { GET, POST } = require('../clients/route')

function makeGet(params = {}) {
  const url = new URL('http://localhost/api/clients')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new global.Request(url.toString())
}

function makePost(body) {
  return new global.Request('http://localhost/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'agent-1' }
  mockRole = 'member'

  // Re-attach chainable methods.
  ;['select', 'order', 'eq', 'in', 'or', 'ilike', 'update', 'insert'].forEach((k) => {
    mockQuery[k].mockReturnValue(mockQuery)
  })

  // profiles role lookup resolves to the current role; everything else default.
  mockRegularSupabase.from.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { role: mockRole } }) }) }),
      }
    }
    return mockQuery
  })
  mockAdminSupabase.from.mockReturnValue(mockQuery)

  mockQuery.limit.mockResolvedValue({ data: [], error: null })
  mockQuery.maybeSingle.mockResolvedValue({ data: null, error: null })
  mockQuery.single.mockResolvedValue({ data: null, error: null })
})

describe('GET /api/clients — shared directory', () => {
  test('non-admin (agent): does NOT filter by created_by', async () => {
    mockRole = 'member'
    await GET(makeGet())
    // No ownership filter should ever be applied.
    expect(mockQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything())
    expect(mockQuery.in).not.toHaveBeenCalledWith('created_by', expect.anything())
  })

  test('admin: also does NOT filter by created_by', async () => {
    mockRole = 'admin'
    await GET(makeGet())
    expect(mockQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything())
  })

  test('non-admin result set is capped at 2000 (not 50)', async () => {
    mockRole = 'member'
    await GET(makeGet())
    expect(mockQuery.limit).toHaveBeenCalledWith(2000)
  })

  test('applies a sanitized search filter across company/name/email', async () => {
    mockRole = 'member'
    await GET(makeGet({ search: 'BLD' }))
    expect(mockQuery.or).toHaveBeenCalledWith(
      'company.ilike.%BLD%,name.ilike.%BLD%,email.ilike.%BLD%'
    )
  })

  test('returns 401 when there is no authenticated user', async () => {
    mockUser = null
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })
})

describe('POST /api/clients — update on shared directory', () => {
  test('non-admin updating a client they DO own: persists and returns it', async () => {
    mockRole = 'member'
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'c-1', company: 'Owned Co', created_by: 'agent-1' },
      error: null,
    })
    const res = await POST(makePost({ id: 'c-1', company: 'Owned Co' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.client).toEqual({ id: 'c-1', company: 'Owned Co', created_by: 'agent-1' })
    expect(json.readOnly).toBeUndefined()
  })

  test('non-admin updating a client they DO NOT own: no 500, returns existing read-only', async () => {
    mockRole = 'member'
    // First maybeSingle = the update (0 rows matched ownership filter) → null.
    // Second maybeSingle = the fallback read of the existing record.
    mockQuery.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: 'c-bld', company: 'sas bld', created_by: 'admin-sunita' },
        error: null,
      })
    const res = await POST(makePost({ id: 'c-bld', company: 'sas bld' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.readOnly).toBe(true)
    expect(json.client.company).toBe('sas bld')
  })

  test('update of a non-existent id returns 404', async () => {
    mockRole = 'member'
    mockQuery.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // update matched nothing
      .mockResolvedValueOnce({ data: null, error: null }) // fallback read found nothing
    const res = await POST(makePost({ id: 'missing', company: 'Ghost Co' }))
    expect(res.status).toBe(404)
  })

  test('rejects an update/create with no company name', async () => {
    mockRole = 'member'
    const res = await POST(makePost({ id: 'c-1', company: '   ' }))
    expect(res.status).toBe(400)
  })
})
