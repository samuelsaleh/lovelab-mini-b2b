/**
 * @jest-environment node
 *
 * /api/packs and /api/packs/[id] — RLS-and-validation unit tests.
 *
 * What's covered:
 *   - GET returns 401 without a session.
 *   - GET returns the rows the user-context Supabase client surfaces (RLS is
 *     trusted to filter; we assert we use the user-context client and pass
 *     through whatever it returns).
 *   - POST returns 401 without a session.
 *   - POST rejects fixed_total < 970 with a 422 + the localised message.
 *   - POST rejects malformed form_rows with a 400.
 *   - POST forces scope = 'private' for non-admins, even when they request
 *     'global'. Admins keep 'global'.
 *   - PUT returns 403 if a non-admin tries to flip scope to 'global'.
 *   - PUT propagates the €970 floor.
 *   - DELETE refuses seed packs with a 422.
 *   - DELETE returns 404 for an unknown pack id.
 *
 * The Supabase client is mocked with a chainable query builder so we don't
 * touch the network. RLS itself is not exercised in JS — the migration's
 * policies are the system of record there. These tests pin the JS-side
 * guards that the route adds on top.
 */

const mockUser = { data: { user: null } }
let mockProfileRole = 'agent'

// A tiny chainable that returns the same shape as the Supabase JS client for
// the methods we use (.from, .select, .eq, .order, .insert, .update,
// .delete, .single, .maybeSingle). Each test sets `mockNextResult` to the
// terminal `{ data, error }` the chain should resolve to.
let mockNextResult = { data: null, error: null }
const calls = []

function makeChain() {
  const chain = {
    from(table) { calls.push({ op: 'from', table }); return chain },
    select(columns) { calls.push({ op: 'select', columns }); return chain },
    insert(values) { calls.push({ op: 'insert', values }); return chain },
    update(values) { calls.push({ op: 'update', values }); return chain },
    delete() { calls.push({ op: 'delete' }); return chain },
    eq(col, val) { calls.push({ op: 'eq', col, val }); return chain },
    order(col, opts) { calls.push({ op: 'order', col, opts }); return chain },
    single() { return Promise.resolve(mockNextResult) },
    maybeSingle() { return Promise.resolve(mockNextResult) },
    then(resolve) { return Promise.resolve(mockNextResult).then(resolve) },
  }
  return chain
}

const mockSupabase = {
  auth: { getUser: jest.fn().mockImplementation(() => Promise.resolve(mockUser)) },
  from: jest.fn().mockImplementation(() => makeChain()),
}

const mockAdminSupabase = {
  from: jest.fn().mockImplementation((table) => {
    // The /profiles role lookup uses the admin client. Return a profile
    // with the test-controlled role for that one query.
    if (table === 'profiles') {
      const chain = {
        select() { return chain },
        eq() { return chain },
        single() { return Promise.resolve({ data: { role: mockProfileRole }, error: null }) },
        maybeSingle() { return Promise.resolve({ data: { role: mockProfileRole }, error: null }) },
      }
      return chain
    }
    return makeChain()
  }),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabase),
  createAdminClient: jest.fn().mockReturnValue(mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))

const { GET, POST } = require('../packs/route')
const { PUT, DELETE } = require('../packs/[id]/route')

function req({ url = 'http://localhost/api/packs', body = null } = {}) {
  return {
    url,
    json: body == null ? undefined : jest.fn().mockResolvedValue(body),
    headers: new Map(),
  }
}

beforeEach(() => {
  calls.length = 0
  mockUser.data.user = null
  mockProfileRole = 'agent'
  mockNextResult = { data: null, error: null }
  mockSupabase.auth.getUser.mockClear()
  mockSupabase.from.mockClear()
  mockAdminSupabase.from.mockClear()
})

describe('GET /api/packs', () => {
  it('returns 401 without a session', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns the packs the user-context Supabase client surfaces (RLS-filtered)', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockNextResult = { data: [{ id: 'p-1', label: 'A', scope: 'global', is_seed: true }], error: null }

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.packs).toHaveLength(1)
    expect(body.packs[0].id).toBe('p-1')
    // The RLS-bearing query must run on the user-context client (mockSupabase).
    expect(mockSupabase.from).toHaveBeenCalledWith('packs')
  })
})

describe('POST /api/packs', () => {
  it('returns 401 without a session', async () => {
    const res = await POST(req({ body: { label: 'X', fixed_total: 1000, form_rows: [{ collection: 'CUTY' }] } }))
    expect(res.status).toBe(401)
  })

  it('rejects fixed_total < 970 with a 422 and the localised message', async () => {
    mockUser.data.user = { id: 'u-1' }
    const res = await POST(req({ body: {
      label: 'Cheap',
      fixed_total: 969,
      form_rows: [{ collection: 'CUTY' }],
      scope: 'private',
    } }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/970/)
  })

  it('rejects malformed form_rows with a 400', async () => {
    mockUser.data.user = { id: 'u-1' }
    const res = await POST(req({ body: {
      label: 'Bad',
      fixed_total: 1000,
      form_rows: [],
      scope: 'private',
    } }))
    expect(res.status).toBe(400)
  })

  it('forces scope = "private" for non-admins, even when they request "global"', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'
    mockNextResult = { data: { id: 'p-new', scope: 'private' }, error: null }

    const res = await POST(req({ body: {
      label: 'Mine',
      fixed_total: 1000,
      form_rows: [{ collection: 'CUTY' }],
      scope: 'global', // agent tries to publish globally
    } }))
    expect(res.status).toBe(201)
    // Find the insert call and verify the scope was overridden to private.
    const insertCall = calls.find(c => c.op === 'insert')
    expect(insertCall).toBeTruthy()
    expect(insertCall.values.scope).toBe('private')
    expect(insertCall.values.created_by).toBe('u-1')
  })

  it('keeps scope = "global" for admins', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    mockNextResult = { data: { id: 'p-new', scope: 'global' }, error: null }

    const res = await POST(req({ body: {
      label: 'Pack X',
      fixed_total: 1000,
      form_rows: [{ collection: 'CUTY' }],
      scope: 'global',
    } }))
    expect(res.status).toBe(201)
    const insertCall = calls.find(c => c.op === 'insert')
    expect(insertCall.values.scope).toBe('global')
  })
})

describe('PUT /api/packs/[id]', () => {
  it('returns 403 when an agent tries to flip a pack to global', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'

    const res = await PUT(
      req({ body: { scope: 'global' } }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(403)
  })

  it('rejects fixed_total < 970 on update with a 422', async () => {
    mockUser.data.user = { id: 'u-1' }

    const res = await PUT(
      req({ body: { fixed_total: 800 } }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(422)
  })

  it('returns 400 when no updates are provided', async () => {
    mockUser.data.user = { id: 'u-1' }

    const res = await PUT(
      req({ body: {} }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/packs/[id]', () => {
  it('returns 404 when the pack does not exist', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockNextResult = { data: null, error: null }

    const res = await DELETE(
      req(),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
  })

  it('refuses to delete a seed pack with a 422', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockNextResult = { data: { id: 'p-1', is_seed: true }, error: null }

    const res = await DELETE(
      req(),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(422)
  })

  it('returns 200 when an owner deletes their own non-seed pack', async () => {
    mockUser.data.user = { id: 'u-1' }
    // First call (admin lookup) returns a non-seed pack; second call (the
    // delete itself) returns a row, which means RLS allowed it.
    let stage = 0
    mockAdminSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') {
        return {
          select() { return this }, eq() { return this },
          single() { return Promise.resolve({ data: { role: 'agent' }, error: null }) },
          maybeSingle() { return Promise.resolve({ data: { role: 'agent' }, error: null }) },
        }
      }
      // packs lookup for is_seed check
      const chain = {
        select() { return chain }, eq() { return chain },
        maybeSingle() { return Promise.resolve({ data: { id: 'p-1', is_seed: false }, error: null }) },
        single() { return Promise.resolve({ data: { id: 'p-1', is_seed: false }, error: null }) },
      }
      return chain
    })
    mockSupabase.from.mockImplementation(() => {
      const chain = {
        from() { return chain }, select() { return chain }, eq() { return chain },
        delete() { return chain },
        single() {
          stage += 1
          // Delete success: returns the deleted row
          return Promise.resolve({ data: { id: 'p-1' }, error: null })
        },
      }
      return chain
    })

    const res = await DELETE(
      req(),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(200)
    expect(stage).toBeGreaterThan(0)
  })
})
