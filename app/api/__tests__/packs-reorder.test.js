/**
 * @jest-environment node
 *
 * POST /api/packs/reorder — admin-only permanent reordering of the Builder pack strip.
 */

const mockUser = { data: { user: null } }
let mockProfileRole = 'agent'
const updates = []

function makeUpdateChain() {
  const chain = {
    update(values) { updates.push(values); return chain },
    eq() { return chain },
    select() { return chain },
    maybeSingle() { return Promise.resolve({ data: { id: 'ok' }, error: null }) },
    single() { return Promise.resolve({ data: { id: 'ok' }, error: null }) },
  }
  return chain
}

const mockSupabase = {
  auth: { getUser: jest.fn().mockImplementation(() => Promise.resolve(mockUser)) },
  from: jest.fn(() => makeUpdateChain()),
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select() { return this },
        eq() { return this },
        single() { return Promise.resolve({ data: { role: mockProfileRole }, error: null }) },
      }
    }
    return makeUpdateChain()
  }),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabase),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

const { POST } = require('../packs/reorder/route')

function req(body) {
  return {
    url: 'http://localhost/api/packs/reorder',
    json: jest.fn().mockResolvedValue(body),
    headers: new Map(),
  }
}

beforeEach(() => {
  updates.length = 0
  mockUser.data.user = null
  mockProfileRole = 'agent'
  mockSupabase.auth.getUser.mockImplementation(() => Promise.resolve(mockUser))
  mockAdminSupabase.from.mockClear()
})

describe('POST /api/packs/reorder', () => {
  it('returns 401 without a session', async () => {
    const res = await POST(req({ ordered_ids: ['a'] }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-admin', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'
    const res = await POST(req({ ordered_ids: ['a', 'b'] }))
    expect(res.status).toBe(403)
  })

  it('rejects an empty ordered_ids list', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    const res = await POST(req({ ordered_ids: [] }))
    expect(res.status).toBe(400)
  })

  it('writes sort_order 0..n-1 for an admin', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    const res = await POST(req({ ordered_ids: ['p-a', 'p-b', 'p-c'] }))
    expect(res.status).toBe(200)
    expect(updates).toEqual([
      { sort_order: 0 },
      { sort_order: 1 },
      { sort_order: 2 },
    ])
  })

  it('deduplicates ids while preserving first-seen order', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    await POST(req({ ordered_ids: ['p-a', 'p-b', 'p-a', 'p-c'] }))
    expect(updates).toEqual([
      { sort_order: 0 },
      { sort_order: 1 },
      { sort_order: 2 },
    ])
  })
})
