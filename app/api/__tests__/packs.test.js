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
 *   - DELETE refuses seed packs with a 422 for non-admins.
 *   - DELETE lets admins remove seed packs (Phase 33).
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
    in(col, vals) { calls.push({ op: 'in', col, vals }); return chain },
    order(col, opts) { calls.push({ op: 'order', col, opts }); return chain },
    single() { return Promise.resolve(mockNextResult) },
    maybeSingle() { return Promise.resolve(mockNextResult) },
    then(resolve) { return Promise.resolve(mockNextResult).then(resolve) },
  }
  return chain
}

function defaultUserFrom() {
  return makeChain()
}

function defaultAdminFrom(table) {
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
}

const mockSupabase = {
  auth: { getUser: jest.fn().mockImplementation(() => Promise.resolve(mockUser)) },
  from: jest.fn().mockImplementation(defaultUserFrom),
}

const mockAdminSupabase = {
  from: jest.fn().mockImplementation(defaultAdminFrom),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabase),
  createAdminClient: jest.fn().mockReturnValue(mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))

// Pack-template generation is a side-effect of CRUD; mock it so tests stay
// hermetic and we can assert the hooks fire (and that a failure is swallowed).
const mockRegen = jest.fn().mockResolvedValue({ ok: true })
const mockDeleteTemplate = jest.fn().mockResolvedValue({ ok: true })
jest.mock('@/lib/packTemplates', () => ({
  regeneratePackTemplate: (...a) => mockRegen(...a),
  deletePackTemplate: (...a) => mockDeleteTemplate(...a),
}))

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
  // Reset implementations (not just call history) so tests that override the
  // chain (e.g. the GET-admin and DELETE cases) stay hermetic.
  mockSupabase.auth.getUser.mockReset()
  mockSupabase.auth.getUser.mockImplementation(() => Promise.resolve(mockUser))
  mockSupabase.from.mockReset()
  mockSupabase.from.mockImplementation(defaultUserFrom)
  mockAdminSupabase.from.mockReset()
  mockAdminSupabase.from.mockImplementation(defaultAdminFrom)
  mockRegen.mockClear()
  mockRegen.mockResolvedValue({ ok: true })
  mockDeleteTemplate.mockClear()
  mockDeleteTemplate.mockResolvedValue({ ok: true })
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

  it('attaches per-pack agent_ids for admins (from pack_visibility)', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'

    // User client returns the visible packs.
    mockSupabase.from.mockImplementation(() => {
      const chain = {
        from() { return chain }, select() { return chain }, eq() { return chain },
        order() { return chain },
        then(resolve) {
          return Promise.resolve({
            data: [{ id: 'p-1', scope: 'restricted' }, { id: 'p-2', scope: 'global' }],
            error: null,
          }).then(resolve)
        },
      }
      return chain
    })

    // Admin client: profiles → admin role; pack_visibility → assignment rows.
    mockAdminSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') {
        return {
          select() { return this }, eq() { return this },
          single() { return Promise.resolve({ data: { role: 'admin' }, error: null }) },
          maybeSingle() { return Promise.resolve({ data: { role: 'admin' }, error: null }) },
        }
      }
      const chain = {
        select() { return chain }, in() { return chain },
        then(resolve) {
          return Promise.resolve({ data: [{ pack_id: 'p-1', agent_id: 'a-1' }], error: null }).then(resolve)
        },
      }
      return chain
    })

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    const p1 = body.packs.find((p) => p.id === 'p-1')
    const p2 = body.packs.find((p) => p.id === 'p-2')
    expect(p1.agent_ids).toEqual(['a-1'])
    expect(p2.agent_ids).toEqual([]) // global pack: no restricted assignments
  })

  it('does NOT attach agent_ids for non-admins', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'
    mockNextResult = { data: [{ id: 'p-1', scope: 'global' }], error: null }

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.packs[0].agent_ids).toBeUndefined()
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

  it('lets an admin create a restricted pack and syncs the agent_ids', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    mockNextResult = { data: { id: 'p-new', scope: 'restricted' }, error: null }

    const res = await POST(req({ body: {
      label: 'Restricted',
      fixed_total: 1000,
      form_rows: [{ collection: 'CUTY' }],
      scope: 'restricted',
      agent_ids: ['a-1', 'a-2'],
    } }))
    expect(res.status).toBe(201)

    // The pack itself is inserted with scope = restricted.
    const packInsert = calls.find(c => c.op === 'insert' && c.values && !Array.isArray(c.values))
    expect(packInsert.values.scope).toBe('restricted')

    // pack_visibility gets the two assignment rows.
    const visInsert = calls.find(c => c.op === 'insert' && Array.isArray(c.values))
    expect(visInsert).toBeTruthy()
    expect(visInsert.values).toEqual([
      { pack_id: 'p-new', agent_id: 'a-1' },
      { pack_id: 'p-new', agent_id: 'a-2' },
    ])
  })

  it('forces private and ignores agent_ids when a non-admin requests restricted', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'
    mockNextResult = { data: { id: 'p-new', scope: 'private' }, error: null }

    const res = await POST(req({ body: {
      label: 'Sneaky',
      fixed_total: 1000,
      form_rows: [{ collection: 'CUTY' }],
      scope: 'restricted',
      agent_ids: ['a-1'],
    } }))
    expect(res.status).toBe(201)
    const packInsert = calls.find(c => c.op === 'insert' && c.values && !Array.isArray(c.values))
    expect(packInsert.values.scope).toBe('private')
    // No visibility rows inserted because the pack isn't restricted.
    const visInsert = calls.find(c => c.op === 'insert' && Array.isArray(c.values))
    expect(visInsert).toBeFalsy()
  })

  it('regenerates the pack Excel template after a successful create', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    mockNextResult = { data: { id: 'p-new', label: 'Pack X', scope: 'global' }, error: null }

    const res = await POST(req({ body: {
      label: 'Pack X', fixed_total: 1000, form_rows: [{ collection: 'CUTY' }], scope: 'global',
    } }))
    expect(res.status).toBe(201)
    expect(mockRegen).toHaveBeenCalledTimes(1)
    expect(mockRegen.mock.calls[0][1]).toEqual(expect.objectContaining({ id: 'p-new' }))
  })

  it('still returns 201 when template generation throws (best-effort)', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    mockNextResult = { data: { id: 'p-new', scope: 'global' }, error: null }
    mockRegen.mockRejectedValueOnce(new Error('storage down'))

    const res = await POST(req({ body: {
      label: 'Pack X', fixed_total: 1000, form_rows: [{ collection: 'CUTY' }], scope: 'global',
    } }))
    expect(res.status).toBe(201)
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

  it('updates label, description and form_rows for an owned pack', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockNextResult = {
      data: { id: 'p-1', label: 'Renamed', description: ['New line'] },
      error: null,
    }

    const res = await PUT(
      req({ body: {
        label: 'Renamed',
        description: ['New line'],
        fixed_total: 1200,
        form_rows: [{ collection: 'CUTY' }],
      } }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pack.label).toBe('Renamed')

    const updateCall = calls.find(c => c.op === 'update')
    expect(updateCall).toBeTruthy()
    expect(updateCall.values.label).toBe('Renamed')
    expect(updateCall.values.description).toEqual(['New line'])
    expect(updateCall.values.form_rows).toEqual([{ collection: 'CUTY' }])
    // The RLS-bearing update must run on the user-context client.
    expect(mockSupabase.from).toHaveBeenCalledWith('packs')
    // And the Excel template is regenerated from the updated pack.
    expect(mockRegen).toHaveBeenCalledTimes(1)
    expect(mockRegen.mock.calls[0][1]).toEqual(expect.objectContaining({ id: 'p-1' }))
  })

  it('lets an admin flip a pack to restricted and syncs the agent_ids', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    mockNextResult = { data: { id: 'p-1', scope: 'restricted' }, error: null }

    const res = await PUT(
      req({ body: { scope: 'restricted', agent_ids: ['a-1'] } }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(200)
    const updateCall = calls.find(c => c.op === 'update')
    expect(updateCall.values.scope).toBe('restricted')
    const visInsert = calls.find(c => c.op === 'insert' && Array.isArray(c.values))
    expect(visInsert.values).toEqual([{ pack_id: 'p-1', agent_id: 'a-1' }])
  })

  it('returns 403 when a non-admin sets agent_ids', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'

    const res = await PUT(
      req({ body: { agent_ids: ['a-1'] } }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(403)
  })

  it('updates agent_ids alone (no column change) on a restricted pack', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    // The existence/scope lookup (select *) returns the restricted pack.
    mockNextResult = { data: { id: 'p-1', scope: 'restricted' }, error: null }

    const res = await PUT(
      req({ body: { agent_ids: ['a-2'] } }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(200)
    // No column update was issued (only the visibility set changed).
    expect(calls.find(c => c.op === 'update')).toBeFalsy()
    const visInsert = calls.find(c => c.op === 'insert' && Array.isArray(c.values))
    expect(visInsert.values).toEqual([{ pack_id: 'p-1', agent_id: 'a-2' }])
  })

  it('clears the visibility set when scope moves away from restricted', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    mockNextResult = { data: { id: 'p-1', scope: 'global' }, error: null }

    const res = await PUT(
      req({ body: { scope: 'global' } }),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(200)
    // A delete on pack_visibility ran, but no new assignment rows were inserted.
    expect(calls.find(c => c.op === 'delete')).toBeTruthy()
    expect(calls.find(c => c.op === 'insert' && Array.isArray(c.values))).toBeFalsy()
  })

  it('returns 404 when RLS blocks the update (e.g. a non-admin editing a global/seed pack)', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'
    // RLS filtered the row out → Supabase .single() resolves with PGRST116.
    mockNextResult = { data: null, error: { code: 'PGRST116', message: 'no rows returned' } }

    const res = await PUT(
      req({ body: { label: 'Hijack a standard pack' } }),
      { params: Promise.resolve({ id: 'seed-1' }) },
    )
    expect(res.status).toBe(404)
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

  it('refuses to delete a seed pack with a 422 for non-admins', async () => {
    mockUser.data.user = { id: 'u-1' }
    mockProfileRole = 'agent'
    mockNextResult = { data: { id: 'p-1', is_seed: true, created_by: 'u-1' }, error: null }

    const res = await DELETE(
      req(),
      { params: Promise.resolve({ id: 'p-1' }) },
    )
    expect(res.status).toBe(422)
  })

  it('lets an admin delete a seed pack', async () => {
    mockUser.data.user = { id: 'admin-1' }
    mockProfileRole = 'admin'
    let deleted = false
    mockAdminSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') {
        return {
          select() { return this }, eq() { return this },
          single() { return Promise.resolve({ data: { role: 'admin' }, error: null }) },
          maybeSingle() { return Promise.resolve({ data: { role: 'admin' }, error: null }) },
        }
      }
      const chain = {
        select() { return chain },
        eq() { return chain },
        delete() { deleted = true; return chain },
        maybeSingle() {
          return Promise.resolve({
            data: { id: 'seed-1', is_seed: true, scope: 'global', created_by: null, label: 'Pack 1' },
            error: null,
          })
        },
        single() {
          return Promise.resolve({ data: { id: 'seed-1' }, error: null })
        },
      }
      return chain
    })

    const res = await DELETE(
      req(),
      { params: Promise.resolve({ id: 'seed-1' }) },
    )
    expect(res.status).toBe(200)
    expect(deleted).toBe(true)
    expect(mockDeleteTemplate).toHaveBeenCalledWith(expect.anything(), 'seed-1')
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
        maybeSingle() {
          return Promise.resolve({
            data: { id: 'p-1', is_seed: false, created_by: 'u-1', scope: 'private', label: 'Mine' },
            error: null,
          })
        },
        single() {
          return Promise.resolve({
            data: { id: 'p-1', is_seed: false, created_by: 'u-1' },
            error: null,
          })
        },
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
    // The pack's stored Excel template is removed too.
    expect(mockDeleteTemplate).toHaveBeenCalledWith(expect.anything(), 'p-1')
  })
})
