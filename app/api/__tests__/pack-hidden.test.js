/**
 * @jest-environment node
 *
 * PUT /api/packs/[id]/hidden — per-user pack hiding (Phase 34).
 *
 * Hiding a pack is a personal preference, not a permission: it takes the card
 * out of the caller's own Builder strip and nobody else's. That makes the
 * user-scoping the most important thing to pin down here.
 *
 * What's covered:
 *   - 401 without a session.
 *   - 400 on a missing / non-boolean `hidden`, so a typo can never be coerced
 *     into "unhide everything".
 *   - 404 when the pack is not visible to the caller (stops id probing).
 *   - hide writes exactly one row, always stamped with the CALLER's id.
 *   - unhide deletes scoped by BOTH pack_id and user_id, so one user can never
 *     clear another user's hidden list.
 *   - two different users hiding the same pack write independent rows.
 *   - the write always goes through the RLS-bearing user client, never the
 *     service-role admin client.
 *   - 500 when the write fails, instead of reporting success.
 */

const mockUser = { data: { user: null } }

let packLookupResult = { data: null, error: null }
let hiddenWriteResult = { data: null, error: null }

const calls = []

function makeChain(table, client) {
  const ctx = { table, client, ops: [] }
  calls.push(ctx)
  const result = () => (table === 'packs' ? packLookupResult : hiddenWriteResult)
  const chain = {
    select(cols) { ctx.ops.push({ op: 'select', cols }); return chain },
    upsert(values, opts) { ctx.ops.push({ op: 'upsert', values, opts }); return chain },
    delete() { ctx.ops.push({ op: 'delete' }); return chain },
    eq(col, val) { ctx.ops.push({ op: 'eq', col, val }); return chain },
    maybeSingle() { return Promise.resolve(result()) },
    single() { return Promise.resolve(result()) },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
  }
  return chain
}

const mockSupabase = {
  auth: { getUser: jest.fn().mockImplementation(() => Promise.resolve(mockUser)) },
  from: jest.fn().mockImplementation((t) => makeChain(t, 'user')),
}
const mockAdminSupabase = {
  from: jest.fn().mockImplementation((t) => makeChain(t, 'admin')),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabase),
  createAdminClient: jest.fn().mockReturnValue(mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))

const { PUT } = require('../packs/[id]/hidden/route')

function req(body) {
  return {
    url: 'http://localhost/api/packs/p-1/hidden',
    json: body === undefined ? undefined : jest.fn().mockResolvedValue(body),
    headers: new Map(),
  }
}

function params(id) {
  return { params: Promise.resolve({ id }) }
}

function hiddenWrites() {
  return calls.filter((c) => c.table === 'pack_hidden')
}

beforeEach(() => {
  calls.length = 0
  mockUser.data.user = null
  packLookupResult = { data: { id: 'p-1' }, error: null }
  hiddenWriteResult = { data: null, error: null }
  mockSupabase.from.mockClear()
  mockAdminSupabase.from.mockClear()
})

describe('PUT /api/packs/[id]/hidden', () => {
  it('returns 401 without a session', async () => {
    const res = await PUT(req({ hidden: true }), params('p-1'))
    expect(res.status).toBe(401)
    expect(hiddenWrites()).toHaveLength(0)
  })

  it('returns 400 when hidden is missing or not a boolean', async () => {
    mockUser.data.user = { id: 'u-1' }
    expect((await PUT(req({}), params('p-1'))).status).toBe(400)
    expect((await PUT(req({ hidden: 'yes' }), params('p-1'))).status).toBe(400)
    expect((await PUT(req({ hidden: 1 }), params('p-1'))).status).toBe(400)
    expect((await PUT(req({ hidden: null }), params('p-1'))).status).toBe(400)
    expect(hiddenWrites()).toHaveLength(0)
  })

  it('returns 400 when the id param is missing', async () => {
    mockUser.data.user = { id: 'u-1' }
    const res = await PUT(req({ hidden: true }), { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the pack is not visible to the caller', async () => {
    mockUser.data.user = { id: 'u-1' }
    packLookupResult = { data: null, error: null }

    const res = await PUT(req({ hidden: true }), params('foreign-private'))
    expect(res.status).toBe(404)
    expect(hiddenWrites()).toHaveLength(0)
  })

  it('hides the pack for the calling user only', async () => {
    mockUser.data.user = { id: 'u-1' }

    const res = await PUT(req({ hidden: true }), params('p-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, hidden: true })

    const writes = hiddenWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].ops[0]).toEqual({
      op: 'upsert',
      values: { pack_id: 'p-1', user_id: 'u-1' },
      opts: { onConflict: 'pack_id,user_id' },
    })
  })

  it('unhides by deleting the row scoped to BOTH the pack and the user', async () => {
    mockUser.data.user = { id: 'u-1' }

    const res = await PUT(req({ hidden: false }), params('p-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, hidden: false })

    const writes = hiddenWrites()
    expect(writes[0].ops).toEqual([
      { op: 'delete' },
      { op: 'eq', col: 'pack_id', val: 'p-1' },
      { op: 'eq', col: 'user_id', val: 'u-1' },
    ])
  })

  it('never lets one user write into another user\u2019s hidden list', async () => {
    // Same pack, two callers → two independent rows, each stamped with its own
    // user id. A caller cannot address a foreign user_id at all: the route
    // ignores the body except for `hidden`.
    mockUser.data.user = { id: 'u-1' }
    await PUT(req({ hidden: true, user_id: 'someone-else' }), params('p-1'))
    mockUser.data.user = { id: 'u-2' }
    await PUT(req({ hidden: true }), params('p-1'))

    const writes = hiddenWrites()
    expect(writes.map((w) => w.ops[0].values)).toEqual([
      { pack_id: 'p-1', user_id: 'u-1' },
      { pack_id: 'p-1', user_id: 'u-2' },
    ])
  })

  it('writes through the RLS-bearing user client, never the service-role client', async () => {
    mockUser.data.user = { id: 'u-1' }
    await PUT(req({ hidden: true }), params('p-1'))

    expect(hiddenWrites().every((w) => w.client === 'user')).toBe(true)
    expect(mockAdminSupabase.from).not.toHaveBeenCalled()
  })

  it('returns 500 when the write fails, instead of reporting success', async () => {
    mockUser.data.user = { id: 'u-1' }
    hiddenWriteResult = { data: null, error: { message: 'rls blocked' } }

    const res = await PUT(req({ hidden: true }), params('p-1'))
    expect(res.status).toBe(500)
  })

  it('is available to admins and agents alike (personal preference, no role check)', async () => {
    mockUser.data.user = { id: 'agent-1' }
    expect((await PUT(req({ hidden: true }), params('p-1'))).status).toBe(200)
    mockUser.data.user = { id: 'admin-1' }
    expect((await PUT(req({ hidden: true }), params('p-1'))).status).toBe(200)
  })
})

// ─── Before the migration is applied ────────────────────────────────────────
//
// pack_hidden does not exist until Phase 34 runs. The route must say so with a
// recognisable code, because the Builder rolls the card back either way and a
// generic 500 gave the user no clue why hiding "didn't stick".

describe('PUT /api/packs/[id]/hidden — pack_hidden missing', () => {
  it('returns 503 with PACK_FOLDERS_NOT_INSTALLED, not a generic 500', async () => {
    mockUser.data.user = { id: 'u-1' }
    hiddenWriteResult = {
      data: null,
      error: { message: "Could not find the table 'public.pack_hidden' in the schema cache", code: 'PGRST205' },
    }

    const res = await PUT(req({ hidden: true }), params('p-1'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('PACK_FOLDERS_NOT_INSTALLED')
    expect(body.error).toMatch(/not set up in this database yet/i)
  })

  it('still returns 500 for a genuine write failure', async () => {
    mockUser.data.user = { id: 'u-1' }
    hiddenWriteResult = {
      data: null,
      error: { message: 'permission denied for table pack_hidden', code: '42501' },
    }

    const res = await PUT(req({ hidden: true }), params('p-1'))
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBeUndefined()
  })
})
