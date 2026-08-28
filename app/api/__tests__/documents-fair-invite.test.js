/**
 * @jest-environment node
 *
 * Fair invite visibility: an invited agent sees only own / credited orders.
 * Assistants and admins still see the whole fair.
 */

const INOVA = 'inova-id'
const BASTIAN = 'bastian-id'
const ALBERTO_DOC = 'alberto-doc'

const mockQuery = {
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
}
mockQuery.then = (cb) => Promise.resolve(cb({ data: [], error: null, count: 0 }))

const mockAdminSupabase = { from: jest.fn(() => mockQuery) }

const accessMocks = {
  getUserContext: jest.fn(),
  getAccessibleEventIds: jest.fn().mockResolvedValue([INOVA]),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
  resolveAgentIds: jest.fn().mockResolvedValue([BASTIAN]),
  getActiveOrgMemberships: jest.fn().mockResolvedValue([]),
  getOrgTeamScope: jest.fn().mockResolvedValue({ memberIds: [BASTIAN], eventIds: [] }),
  resolveAgentFolderEventId: jest.fn(),
  canAccessDocument: jest.fn(),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))
jest.mock('@/app/api/_lib/access', () => accessMocks)
jest.mock('@/lib/agentIdColumn', () => ({
  documentsHaveAgentIdColumn: jest.fn().mockResolvedValue(true),
  normalizeAgentId: jest.fn(),
}))

const { GET } = require('../documents/route')

function makeRequest(params = {}) {
  const url = new URL('http://localhost/api/documents')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new global.Request(url.toString())
}

function resetQuery() {
  Object.keys(mockQuery).forEach((k) => {
    if (k !== 'then') mockQuery[k].mockReturnValue(mockQuery)
  })
  mockQuery.limit.mockResolvedValue({ data: [], error: null })
  mockAdminSupabase.from.mockReturnValue(mockQuery)
}

beforeEach(() => {
  jest.clearAllMocks()
  resetQuery()
  accessMocks.getAccessibleEventIds.mockResolvedValue([INOVA])
  accessMocks.requireEventPermission.mockResolvedValue({ allowed: true })
  accessMocks.resolveAgentIds.mockResolvedValue([BASTIAN])
  accessMocks.getActiveOrgMemberships.mockResolvedValue([])
})

describe('GET /api/documents — fair invite scoping', () => {
  test('invited agent list filter is own/credited, not event_id IN shared fairs', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: BASTIAN },
      isAdmin: false,
      isAssistant: false,
    })

    await GET(makeRequest())

    expect(mockQuery.or).toHaveBeenCalledWith(
      `created_by.in.(${BASTIAN}),agent_id.in.(${BASTIAN})`,
    )
    const orArgs = mockQuery.or.mock.calls.map((c) => c[0]).join(' ')
    expect(orArgs).not.toMatch(/event_id\.in/)
  })

  test('folder click still requires event permission and keeps the own/credited filter', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: BASTIAN },
      isAdmin: false,
      isAssistant: false,
    })

    await GET(makeRequest({ event_id: INOVA }))

    expect(accessMocks.requireEventPermission).toHaveBeenCalledWith(
      mockAdminSupabase, INOVA, BASTIAN, 'read', false,
    )
    expect(mockQuery.or).toHaveBeenCalledWith(
      `created_by.in.(${BASTIAN}),agent_id.in.(${BASTIAN})`,
    )
    expect(mockQuery.eq).toHaveBeenCalledWith('event_id', INOVA)
  })

  test('uninvited agent gets an empty folder, not Alberto\'s orders', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: BASTIAN },
      isAdmin: false,
      isAssistant: false,
    })
    accessMocks.requireEventPermission.mockResolvedValue({ allowed: false })

    const res = await GET(makeRequest({ event_id: INOVA }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.documents).toEqual([])
    expect(mockQuery.eq).not.toHaveBeenCalledWith('event_id', INOVA)
  })

  test('assistant list filter still unlocks every order in granted fairs', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: 'asst-1' },
      isAdmin: false,
      isAssistant: true,
    })
    accessMocks.resolveAgentIds.mockResolvedValue(['asst-1'])

    await GET(makeRequest())

    expect(mockQuery.or).toHaveBeenCalledWith(
      `created_by.in.(asst-1),event_id.in.(${INOVA})`,
    )
  })

  test('admin is not scoped by the agent own/credited filter', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: 'admin-1' },
      isAdmin: true,
      isAssistant: false,
    })

    await GET(makeRequest({ event_id: INOVA }))

    expect(mockQuery.or).not.toHaveBeenCalled()
    expect(mockQuery.eq).toHaveBeenCalledWith('event_id', INOVA)
  })
})

describe('GET /api/documents/:id — event_access is not enough for agents', () => {
  const { GET: GET_ONE, DELETE } = require('../documents/[id]/route')
  const DOC_ID = '11111111-1111-4111-8111-111111111111'

  function singleDocClient(doc) {
    return {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: doc, error: null }),
        update: jest.fn().mockReturnThis(),
      })),
    }
  }

  test('GET returns 403 when canAccessDocument denies Alberto\'s order', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: BASTIAN },
      isAdmin: false,
      isAssistant: false,
    })
    accessMocks.canAccessDocument.mockResolvedValue({ allowed: false })
    const { createAdminClient } = require('@/lib/supabase/server')
    createAdminClient.mockReturnValue(singleDocClient({
      id: DOC_ID,
      created_by: 'alberto',
      event_id: INOVA,
      agent_id: null,
    }))

    const res = await GET_ONE(
      new global.Request(`http://localhost/api/documents/${DOC_ID}`),
      { params: Promise.resolve({ id: DOC_ID }) },
    )
    expect(res.status).toBe(403)
    expect(accessMocks.canAccessDocument).toHaveBeenCalled()
  })

  test('DELETE returns 403 when canAccessDocument denies Alberto\'s order', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: BASTIAN },
      isAdmin: false,
      isAssistant: false,
    })
    accessMocks.canAccessDocument.mockResolvedValue({ allowed: false })
    const { createAdminClient } = require('@/lib/supabase/server')
    createAdminClient.mockReturnValue(singleDocClient({
      id: ALBERTO_DOC,
      created_by: 'alberto',
      event_id: INOVA,
      agent_id: null,
    }))

    const res = await DELETE(
      new global.Request(`http://localhost/api/documents/${DOC_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: DOC_ID }) },
    )
    expect(res.status).toBe(403)
  })
})
