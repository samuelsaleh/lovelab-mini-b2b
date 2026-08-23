/**
 * @jest-environment node
 *
 * /api/pack-fairs and /api/packs/[id]/fairs — fair folder routes (Phase 34).
 *
 * What's covered:
 *   - GET /api/pack-fairs needs a session, and returns fairs with pack counts.
 *   - GET surfaces a clean 500 (never a stack) when the DB is unhappy.
 *   - PUT /api/packs/[id]/fairs needs a session.
 *   - PUT validates the body: event_ids must be an array of non-empty strings.
 *   - PUT 404s when the pack is not visible to the caller (RLS), so an agent
 *     cannot file somebody else's private pack.
 *   - PUT rejects an event id that is not a fair (an agent folder / partner
 *     event), so packs can never end up filed under a non-fair.
 *   - PUT SUCCEEDS for a plain agent: filing is shared and open to everyone,
 *     unlike /api/packs/reorder which is admin-only.
 *   - PUT collapses duplicates and accepts an empty array (unfile everywhere).
 *
 * Supabase is mocked with a chainable recorder. RLS itself is exercised by
 * database-migrations/verify-phase34-pack-fairs.sql, not here.
 */

const mockUser = { data: { user: null } }

// Per-table result overrides for the mocked clients. `null` result → default.
let eventsResult = { data: [], error: null }
let packLookupResult = { data: null, error: null }
let packFairsResult = { data: [], error: null }

const calls = []

function makeChain(table, resultFor) {
  const ctx = { table, ops: [] }
  calls.push(ctx)
  const chain = {
    select(cols) { ctx.ops.push({ op: 'select', cols }); return chain },
    insert(values) { ctx.ops.push({ op: 'insert', values }); return chain },
    delete() { ctx.ops.push({ op: 'delete' }); return chain },
    eq(col, val) { ctx.ops.push({ op: 'eq', col, val }); return chain },
    in(col, vals) { ctx.ops.push({ op: 'in', col, vals }); return chain },
    order(col, opts) { ctx.ops.push({ op: 'order', col, opts }); return chain },
    maybeSingle() { return Promise.resolve(resultFor(ctx)) },
    single() { return Promise.resolve(resultFor(ctx)) },
    then(resolve, reject) { return Promise.resolve(resultFor(ctx)).then(resolve, reject) },
  }
  return chain
}

function resultFor(ctx) {
  if (ctx.table === 'events') return eventsResult
  if (ctx.table === 'packs') return packLookupResult
  if (ctx.table === 'pack_fairs') return packFairsResult
  return { data: [], error: null }
}

const mockSupabase = {
  auth: { getUser: jest.fn().mockImplementation(() => Promise.resolve(mockUser)) },
  from: jest.fn().mockImplementation((t) => makeChain(t, resultFor)),
}
const mockAdminSupabase = {
  from: jest.fn().mockImplementation((t) => makeChain(t, resultFor)),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabase),
  createAdminClient: jest.fn().mockReturnValue(mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))

const { GET } = require('../pack-fairs/route')
const { PUT } = require('../packs/[id]/fairs/route')

function req(body) {
  return {
    url: 'http://localhost/api/pack-fairs',
    json: body === undefined ? undefined : jest.fn().mockResolvedValue(body),
    headers: new Map(),
  }
}

function params(id) {
  return { params: Promise.resolve({ id }) }
}

function tableCalls(table) {
  return calls.filter((c) => c.table === table)
}

beforeEach(() => {
  calls.length = 0
  mockUser.data.user = null
  eventsResult = { data: [], error: null }
  packLookupResult = { data: null, error: null }
  packFairsResult = { data: [], error: null }
  mockSupabase.from.mockClear()
  mockAdminSupabase.from.mockClear()
})

describe('GET /api/pack-fairs', () => {
  it('returns 401 without a session', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns every fair with the number of packs filed under it', async () => {
    mockUser.data.user = { id: 'u-1' }
    eventsResult = {
      data: [
        { id: 'f-1', name: 'Ambiente Frankfurt', start_date: '2026-02-06', end_date: '2026-02-10' },
        { id: 'f-2', name: 'Les Journées d\u2019Achats Paris', start_date: null, end_date: null },
      ],
      error: null,
    }
    packFairsResult = { data: [{ event_id: 'f-1' }, { event_id: 'f-1' }], error: null }

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fairs).toEqual([
      expect.objectContaining({ id: 'f-1', name: 'Ambiente Frankfurt', pack_count: 2 }),
      expect.objectContaining({ id: 'f-2', pack_count: 0 }),
    ])
  })

  it('returns 500 (not a stack trace) when the fair query fails', async () => {
    mockUser.data.user = { id: 'u-1' }
    eventsResult = { data: null, error: { message: 'db down' } }

    const res = await GET(req())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to load fairs')
  })

  it('is available to a plain agent — folder names are shared', async () => {
    mockUser.data.user = { id: 'agent-1' }
    eventsResult = { data: [{ id: 'f-1', name: 'F' }], error: null }

    const res = await GET(req())
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/packs/[id]/fairs', () => {
  it('returns 401 without a session', async () => {
    const res = await PUT(req({ event_ids: ['f-1'] }), params('p-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when event_ids is missing or not an array', async () => {
    mockUser.data.user = { id: 'u-1' }
    expect((await PUT(req({}), params('p-1'))).status).toBe(400)
    expect((await PUT(req({ event_ids: 'f-1' }), params('p-1'))).status).toBe(400)
    expect((await PUT(req({ event_ids: {} }), params('p-1'))).status).toBe(400)
  })

  it('returns 400 when event_ids contains a non-string or empty entry', async () => {
    mockUser.data.user = { id: 'u-1' }
    const res = await PUT(req({ event_ids: ['f-1', ''] }), params('p-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/non-empty strings/)
  })

  it('returns 404 when the pack is not visible to the caller (RLS)', async () => {
    mockUser.data.user = { id: 'u-1' }
    packLookupResult = { data: null, error: null }

    const res = await PUT(req({ event_ids: ['f-1'] }), params('foreign-private'))
    expect(res.status).toBe(404)
    // Nothing was written.
    expect(tableCalls('pack_fairs')).toHaveLength(0)
  })

  it('rejects an event id that is not a fair, and writes nothing', async () => {
    mockUser.data.user = { id: 'u-1' }
    packLookupResult = { data: { id: 'p-1' }, error: null }
    // The fair lookup finds only f-1, so the agent folder is rejected.
    eventsResult = { data: [{ id: 'f-1' }], error: null }

    const res = await PUT(req({ event_ids: ['f-1', 'agent-folder-1'] }), params('p-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/agent-folder-1/)
    expect(tableCalls('pack_fairs')).toHaveLength(0)
  })

  it('lets a plain agent file a pack — filing is shared, not admin-only', async () => {
    mockUser.data.user = { id: 'agent-1' }
    packLookupResult = { data: { id: 'p-1' }, error: null }
    eventsResult = { data: [{ id: 'f-1' }], error: null }

    const res = await PUT(req({ event_ids: ['f-1'] }), params('p-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, event_ids: ['f-1'] })

    // Replace-set: delete the old rows, insert the new one, stamped with who
    // filed it.
    const writes = tableCalls('pack_fairs')
    expect(writes[0].ops[0]).toEqual({ op: 'delete' })
    expect(writes[1].ops[0].values).toEqual([
      { pack_id: 'p-1', event_id: 'f-1', added_by: 'agent-1' },
    ])
  })

  it('files one pack into several fairs at once', async () => {
    mockUser.data.user = { id: 'u-1' }
    packLookupResult = { data: { id: 'p-1' }, error: null }
    eventsResult = { data: [{ id: 'f-1' }, { id: 'f-2' }], error: null }

    const res = await PUT(req({ event_ids: ['f-1', 'f-2'] }), params('p-1'))
    expect(res.status).toBe(200)
    const insert = tableCalls('pack_fairs')[1].ops[0]
    expect(insert.values.map((r) => r.event_id)).toEqual(['f-1', 'f-2'])
  })

  it('collapses duplicate ids so the UI can send a merged list', async () => {
    mockUser.data.user = { id: 'u-1' }
    packLookupResult = { data: { id: 'p-1' }, error: null }
    eventsResult = { data: [{ id: 'f-1' }], error: null }

    const res = await PUT(req({ event_ids: ['f-1', 'f-1'] }), params('p-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event_ids).toEqual(['f-1'])
    expect(tableCalls('pack_fairs')[1].ops[0].values).toHaveLength(1)
  })

  it('unfiles the pack everywhere on an empty array, with no fair validation', async () => {
    mockUser.data.user = { id: 'u-1' }
    packLookupResult = { data: { id: 'p-1' }, error: null }

    const res = await PUT(req({ event_ids: [] }), params('p-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event_ids).toEqual([])
    // Delete only — nothing inserted, and no events lookup was needed.
    const writes = tableCalls('pack_fairs')
    expect(writes).toHaveLength(1)
    expect(writes[0].ops[0]).toEqual({ op: 'delete' })
    expect(tableCalls('events')).toHaveLength(0)
  })

  it('returns 400 when the id param is missing', async () => {
    mockUser.data.user = { id: 'u-1' }
    const res = await PUT(req({ event_ids: [] }), { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the write fails, instead of reporting success', async () => {
    mockUser.data.user = { id: 'u-1' }
    packLookupResult = { data: { id: 'p-1' }, error: null }
    eventsResult = { data: [{ id: 'f-1' }], error: null }
    packFairsResult = { data: null, error: { message: 'rls blocked' } }

    const res = await PUT(req({ event_ids: ['f-1'] }), params('p-1'))
    expect(res.status).toBe(500)
  })
})
