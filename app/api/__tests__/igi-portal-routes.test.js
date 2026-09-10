/**
 * @jest-environment node
 *
 * IGI's own routes. The thing these tests protect is the boundary: only an IGI
 * account gets in, and what comes back never carries a LoveLab shelf figure.
 */

const checkRateLimit = jest.fn(() => null);
const authGetUser = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => global.__sb),
  // Present so an accidental import would still be visible in coverage — the
  // portal must never call it. lib/__tests__/igi-portal-serialize.test.js
  // asserts no file in that directory imports it at all.
  createAdminClient: jest.fn(() => { throw new Error('the IGI portal must not use the service role') }),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a) => checkRateLimit(...a) }));

const todo = require('../igi-portal/todo/route');
const stock = require('../igi-portal/stock/route');
const alerts = require('../igi-portal/alerts/route');
const batches = require('../igi-portal/batches/route');

function req(body, method = 'GET') {
  return new global.Request('http://localhost/api/igi-portal', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', spec: null, state: 'in_use', pool_min: 1000, sort_order: 3 },
  // Reserved and awaiting-serial models exist in the table. RLS hides them from
  // IGI's own client, and loadIgiWorld filters them out as well so the same
  // guarantee holds for LoveLab's preview of this side, which reads as admin.
  { id: 'm9', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Rd', spec: null, state: 'reserved', pool_min: null, sort_order: 61 },
];

/** A stand-in for the RLS-scoped client. */
function sb({ profile, tables = {}, onWrite } = {}) {
  const captured = { inserted: null, updated: null, filter: null };
  return {
    captured,
    auth: { getUser: authGetUser },
    from(table) {
      const rows = tables[table] ?? [];
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: (_c, v) => { captured.filter = v; return chain },
        in: (_c, v) => { captured.filter = v; return chain },
        maybeSingle: async () => ({ data: table === 'profiles' ? profile : rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: null }),
        insert: (payload) => { captured.inserted = payload; onWrite?.(payload); return {
          select: () => ({ single: async () => ({ data: { id: 'new', ...payload }, error: null }) }) } },
        update: (patch) => { captured.updated = patch; return {
          eq: () => ({ then: (r) => r({ data: null, error: null }) }),
          in: () => ({ select: () => ({ then: (r) => r({ data: [], error: null }) }) }) } },
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  };
}

const IGI_TABLES = {
  igi_models: MODELS,
  igi_batches: [{ id: 'b1', model_id: 'm1', qty: 1000, batch_date: '2026-08-27', reference: 'initial order' }],
  igi_visit_lines: [{ id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: null }],
  igi_visits: [{ id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'requested', date_suspect: false, unattributed_total: null }],
};

beforeEach(() => {
  checkRateLimit.mockReset().mockReturnValue(null);
  authGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'igi-1' } } });
  global.__sb = sb({ profile: { id: 'igi-1', is_igi: true }, tables: IGI_TABLES });
});

describe('only IGI reach their own screens', () => {
  test('a signed-out visitor is refused', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } });
    expect((await todo.GET(req())).status).toBe(401);
  });

  test('a LoveLab account is refused, admin or not', async () => {
    // These screens are IGI's. A LoveLab admin has their own, with more on them.
    global.__sb = sb({ profile: { id: 'u1', is_igi: false, role: 'admin' }, tables: IGI_TABLES });
    expect((await todo.GET(req())).status).toBe(403);
    expect((await stock.GET(req())).status).toBe(403);
  });

  test('an account with no profile row is refused', async () => {
    global.__sb = sb({ profile: null, tables: IGI_TABLES });
    expect((await todo.GET(req())).status).toBe(403);
  });

  test('the rate limiter stops a request before anything else', async () => {
    checkRateLimit.mockReturnValue(new Response('{}', { status: 429 }));
    expect((await todo.GET(req())).status).toBe(429);
    expect(authGetUser).not.toHaveBeenCalled();
  });
});

describe('what comes back to IGI', () => {
  test('lists the requests waiting on them, with what they hold', async () => {
    const body = await (await todo.GET(req())).json();
    expect(body.visits).toHaveLength(1);
    expect(body.visits[0].lines[0]).toMatchObject({
      serial: 'LGAJ6530', qty_requested: 100, held: 1000, short_by: 0,
    });
  });

  test('carries the carat and shape with every serial', async () => {
    const body = await (await todo.GET(req())).json();
    expect(body.visits[0].lines[0]).toMatchObject({ carat: 0.1, shape: 'Round', stones: '1' });
  });

  test('never includes a shelf figure or a LoveLab alert level', async () => {
    const payloads = await Promise.all([
      (await todo.GET(req())).json(),
      (await stock.GET(req())).json(),
    ]);
    const json = JSON.stringify(payloads).toLowerCase();
    for (const forbidden of ['shelf', 'shelf_min', 'snapshot', 'consumption']) {
      expect(json).not.toContain(forbidden);
    }
  });

  test('shows their stock with what LoveLab is asking for right now', async () => {
    const body = await (await stock.GET(req())).json();
    // Being asked for 100 does not reduce the stock — it falls when IGI issue,
    // because that is when the certificate leaves them.
    expect(body.models[0]).toMatchObject({ pool: 1000, pool_min: 1000, asked_now: 100 });
  });

  test('the stock falls only once they have recorded what they made', async () => {
    global.__sb = sb({
      profile: { id: 'igi-1', is_igi: true },
      tables: {
        ...IGI_TABLES,
        igi_visit_lines: [{ id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: 41 }],
      },
    });
    const body = await (await stock.GET(req())).json();
    expect(body.models[0].pool).toBe(959);
  });
});

describe('IGI setting their own alert level', () => {
  test('saves it', async () => {
    const res = await alerts.PATCH(req({ model_ids: ['m1'], pool_min: 250 }, 'PATCH'));
    expect(res.status).toBe(200);
    expect(global.__sb.captured.updated).toEqual({ pool_min: 250 });
  });

  test('accepts none, meaning do not warn me', async () => {
    expect((await alerts.PATCH(req({ model_ids: ['m1'], pool_min: null }, 'PATCH'))).status).toBe(200);
  });

  test('refuses a level that is not a whole number', async () => {
    expect((await alerts.PATCH(req({ model_ids: ['m1'], pool_min: 1.5 }, 'PATCH'))).status).toBe(400);
    expect((await alerts.PATCH(req({ model_ids: ['m1'], pool_min: -1 }, 'PATCH'))).status).toBe(400);
  });

  test('never writes LoveLab\'s level, even if asked to', async () => {
    await alerts.PATCH(req({ model_ids: ['m1'], pool_min: 250, shelf_min: 1 }, 'PATCH'));
    expect(global.__sb.captured.updated).not.toHaveProperty('shelf_min');
  });
});

describe('IGI adding a batch', () => {
  test('saves it against a model', async () => {
    const res = await batches.POST(req({ model_id: 'm1', qty: 500, batch_date: '2026-09-01', reference: 'ATW/26' }, 'POST'));
    expect(res.status).toBe(201);
    expect(global.__sb.captured.inserted).toMatchObject({
      model_id: 'm1', qty: 500, batch_date: '2026-09-01', reference: 'ATW/26', created_by: 'igi-1',
    });
  });

  test('needs a model, a real quantity and a date', async () => {
    expect((await batches.POST(req({ qty: 5, batch_date: '2026-09-01' }, 'POST'))).status).toBe(400);
    expect((await batches.POST(req({ model_id: 'm1', qty: 0, batch_date: '2026-09-01' }, 'POST'))).status).toBe(400);
    expect((await batches.POST(req({ model_id: 'm1', qty: 5, batch_date: 'soon' }, 'POST'))).status).toBe(400);
  });

  test('refuses a negative batch', async () => {
    expect((await batches.POST(req({ model_id: 'm1', qty: -5, batch_date: '2026-09-01' }, 'POST'))).status).toBe(400);
  });
});
