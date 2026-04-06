/**
 * @jest-environment node
 *
 * GET /api/documents — unit tests
 *
 * Guarantees:
 *   - Internal orders are excluded from the default query (neq order_channel, 'internal')
 *   - When order_channel=internal is passed, internal orders ARE included (no neq)
 *   - b2b orders always pass through by default
 *
 * Uses the Node test environment so that the native Request/Response globals
 * (available in Node 18+) are available to the Next.js route handler.
 */

// We test the query-building logic in isolation by checking the Supabase
// query chain that is constructed, without hitting a real database.

// ── Mock Supabase ────────────────────────────────────────────────────────────

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
}
// Resolve the query: return empty result
mockQuery.then = (cb) => Promise.resolve(cb({ data: [], error: null, count: 0 }))

const mockAdminSupabase = {
  from: jest.fn(() => mockQuery),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true }),
  getAccessibleEventIds: jest.fn().mockResolvedValue([]),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
  resolveAgentIds: jest.fn().mockResolvedValue(['admin-user']),
}))

// ── Import handler after mocks ────────────────────────────────────────────────
const { GET } = require('../documents/route')

function makeRequest(params = {}) {
  const url = new URL('http://localhost/api/documents')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new global.Request(url.toString())
}

beforeEach(() => {
  jest.clearAllMocks()
  // Re-attach chain after clear
  Object.keys(mockQuery).forEach(k => {
    if (k !== 'then') mockQuery[k].mockReturnValue(mockQuery)
  })
  mockAdminSupabase.from.mockReturnValue(mockQuery)
})

describe('GET /api/documents', () => {
  test('excludes internal, consignment, and delete_from_stock by default (not called with in clause)', async () => {
    await GET(makeRequest())
    expect(mockQuery.not).toHaveBeenCalledWith(
      'order_channel', 'in', '("internal","consignment","delete_from_stock")'
    )
  })

  test('does NOT call the exclusion filter when order_channel=internal is requested', async () => {
    await GET(makeRequest({ order_channel: 'internal' }))
    expect(mockQuery.not).not.toHaveBeenCalledWith(
      'order_channel', 'in', expect.stringContaining('internal')
    )
  })

  test('does NOT call the exclusion filter when order_channel=b2b is requested', async () => {
    await GET(makeRequest({ order_channel: 'b2b' }))
    expect(mockQuery.not).not.toHaveBeenCalledWith(
      'order_channel', 'in', expect.stringContaining('internal')
    )
  })

  test('applies eq(order_channel, internal) when explicitly requested', async () => {
    await GET(makeRequest({ order_channel: 'internal' }))
    expect(mockQuery.eq).toHaveBeenCalledWith('order_channel', 'internal')
  })

  test('applies eq(order_channel, b2b) when b2b is requested', async () => {
    await GET(makeRequest({ order_channel: 'b2b' }))
    expect(mockQuery.eq).toHaveBeenCalledWith('order_channel', 'b2b')
  })

  test('does not call eq(order_channel, ...) for the default (no filter param) query', async () => {
    await GET(makeRequest())
    // eq should NOT be called for order_channel with the default request
    const calls = mockQuery.eq.mock.calls
    const channelCalls = calls.filter(c => c[0] === 'order_channel')
    expect(channelCalls).toHaveLength(0)
  })
})
