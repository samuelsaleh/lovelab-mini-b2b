/**
 * @jest-environment node
 *
 * Invited agents must see their own Inova count (2), not the admin total (5).
 */

const INOVA = 'inova-id'
const BASTIAN = 'bastian-id'
const ALBERTO = 'alberto-id'

let countResultRows = []

function buildDocumentsCountMock() {
  const chain = {}
  const ret = () => chain
  chain.select = jest.fn(ret)
  chain.in = jest.fn(ret)
  chain.is = jest.fn(ret)
  chain.not = jest.fn(() => Promise.resolve({ data: countResultRows, error: null }))
  return chain
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'events') {
      return {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            { id: INOVA, name: 'INOVA FRANKFURT', type: 'fair', created_by: ALBERTO },
          ],
          error: null,
        }),
      }
    }
    if (table === 'documents') return buildDocumentsCountMock()
    if (table === 'event_access') {
      return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [{ event_id: INOVA, permission: 'edit' }],
          error: null,
        }),
      }
    }
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        is: jest.fn().mockResolvedValue({ data: [], error: null }),
      }
    }
    throw new Error('unexpected table: ' + table)
  }),
}

const accessMocks = {
  getUserContext: jest.fn(),
  resolveAgentIds: jest.fn().mockResolvedValue([BASTIAN]),
  getActiveOrgMemberships: jest.fn().mockResolvedValue([]),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))
jest.mock('@/app/api/_lib/access', () => accessMocks)

const { GET } = require('../events/route')

beforeEach(() => {
  countResultRows = [
    { event_id: INOVA, created_by: BASTIAN, agent_id: BASTIAN },
    { event_id: INOVA, created_by: BASTIAN, agent_id: BASTIAN },
    { event_id: INOVA, created_by: ALBERTO, agent_id: null },
    { event_id: INOVA, created_by: ALBERTO, agent_id: null },
    { event_id: INOVA, created_by: ALBERTO, agent_id: null },
  ]
})

describe('/api/events GET — invited agent doc_count', () => {
  test('agent count is own/credited only (2), not the fair total (5)', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: BASTIAN },
      isAdmin: false,
      isAssistant: false,
    })

    const res = await GET(new global.Request('http://localhost/api/events'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.events).toHaveLength(1)
    expect(body.events[0].doc_count).toBe(2)
  })

  test('assistant count is the whole fair (5)', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: 'asst-1' },
      isAdmin: false,
      isAssistant: true,
    })

    const res = await GET(new global.Request('http://localhost/api/events'))
    const body = await res.json()
    expect(body.events[0].doc_count).toBe(5)
  })

  test('admin count is the whole fair (5)', async () => {
    accessMocks.getUserContext.mockResolvedValue({
      user: { id: 'admin-1' },
      isAdmin: true,
      isAssistant: false,
    })

    const res = await GET(new global.Request('http://localhost/api/events'))
    const body = await res.json()
    expect(body.events[0].doc_count).toBe(5)
  })
})
