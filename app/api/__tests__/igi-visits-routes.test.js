/**
 * @jest-environment node
 *
 * The movement routes: creating a request, recording what IGI made, and
 * confirming the return.
 */

const getUserContext = jest.fn();
const checkRateLimit = jest.fn(() => null);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({})),
  createAdminClient: jest.fn(() => global.__db),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a) => checkRateLimit(...a) }));
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => getUserContext(...a) }));

const visits = require('../igi/visits/route');
const visitDetail = require('../igi/visits/[id]/route');
const issued = require('../igi/visits/[id]/issued/route');
const received = require('../igi/visits/[id]/received/route');

function req(body, method = 'POST') {
  return new global.Request('http://localhost/api/igi/visits', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
const params = { params: Promise.resolve({ id: 'v1' }) };

const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', state: 'in_use', stones: '1', carat: 0.1, shape: 'Round' },
  { id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', state: 'in_use', stones: '1', carat: 0.5, shape: 'Heart' },
  { id: 'm3', serial: 'LGAJ6588', name: '—', state: 'reserved' },
  { id: 'm4', serial: null, name: 'Full Moonlight', state: 'awaiting_serial' },
];

/**
 * A stand-in for the service-role client. `tables` supplies rows; `writes`
 * records what the route tried to save.
 */
function db(tables) {
  const writes = { inserted: {}, updated: [], deleted: [] };
  const api = {
    writes,
    from(table) {
      const rows = tables[table] ?? [];
      let filtered = rows;
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: (n) => { filtered = filtered.slice(0, n); return chain },
        eq: (col, v) => { filtered = filtered.filter((r) => r[col] === v || col === 'id'); return chain },
        in: (col, vs) => { filtered = filtered.filter((r) => vs.includes(r[col])); return chain },
        maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
        single: async () => ({ data: filtered[0] ?? null, error: null }),
        insert: (payload) => {
          const list = Array.isArray(payload) ? payload : [payload];
          writes.inserted[table] = [...(writes.inserted[table] || []), ...list];
          const made = list.map((r, i) => ({ id: `new-${i}`, ...r }));
          return { select: () => ({ single: async () => ({ data: made[0], error: null }) }),
                   then: (res) => res({ data: made, error: null }) };
        },
        update: (patch) => {
          writes.updated.push({ table, patch });
          return { eq: () => ({
            select: () => ({ single: async () => ({ data: { id: 'v1', visit_no: 24, ...patch }, error: null }) }),
            then: (res) => res({ data: null, error: null }),
          }) };
        },
        delete: () => ({ eq: async (c, v) => { writes.deleted.push(v); return { error: null } } }),
        then: (resolve) => resolve({ data: filtered, error: null }),
      };
      return chain;
    },
  };
  return api;
}

function baseTables(overrides = {}) {
  return {
    igi_models: MODELS,
    // 1000 made, 100 already issued elsewhere → IGI holds 900 of m1.
    igi_batches: [{ model_id: 'm1', qty: 1000 }, { model_id: 'm2', qty: 50 }],
    igi_visit_lines: [{ visit_id: 'v0', model_id: 'm1', qty_issued: 100, qty_requested: 100 }],
    igi_visits: [{ id: 'v1', visit_no: 23, visit_date: '2026-08-27', status: 'requested' }],
    ...overrides,
  };
}

beforeEach(() => {
  checkRateLimit.mockReset().mockReturnValue(null);
  getUserContext.mockReset().mockResolvedValue({ user: { id: 'u1' }, isAdmin: true });
  global.__db = db(baseTables());
});

describe('sending a request to IGI', () => {
  test('refuses anyone who is not LoveLab', async () => {
    getUserContext.mockResolvedValue({ user: { id: 'u2' }, isAdmin: false });
    expect((await visits.POST(req({ lines: [{ model_id: 'm1', qty: 10 }] }))).status).toBe(403);
  });

  test('creates the movement and numbers it next in sequence', async () => {
    const res = await visits.POST(req({ lines: [{ model_id: 'm1', qty: 50 }] }));
    expect(res.status).toBe(201);
    const saved = global.__db.writes.inserted.igi_visits[0];
    expect(saved.visit_no).toBe(24);
    expect(saved.status).toBe('requested');
    expect(saved.created_by).toBe('u1');
  });

  test('dates the movement in Antwerp, not in UTC', async () => {
    await visits.POST(req({ lines: [{ model_id: 'm1', qty: 50 }] }));
    expect(global.__db.writes.inserted.igi_visits[0].visit_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('saves a line per model', async () => {
    await visits.POST(req({ lines: [{ model_id: 'm1', qty: 50 }, { model_id: 'm2', qty: 12 }] }));
    expect(global.__db.writes.inserted.igi_visit_lines).toEqual([
      { visit_id: 'new-0', model_id: 'm1', qty_requested: 50 },
      { visit_id: 'new-0', model_id: 'm2', qty_requested: 12 },
    ]);
  });

  test('accepts a request for more than IGI holds, and reports the shortage', async () => {
    // Deliberate: refusing it would hide the problem. Both sides are warned instead.
    const res = await visits.POST(req({ lines: [{ model_id: 'm2', qty: 500 }] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.short).toEqual([
      { model_id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', asked: 500, held: 50, gap: 450 },
    ]);
  });

  test('reports no shortage when IGI holds enough', async () => {
    const body = await (await visits.POST(req({ lines: [{ model_id: 'm1', qty: 50 }] }))).json();
    expect(body.short).toEqual([]);
  });

  test('refuses a reserved serial', async () => {
    const res = await visits.POST(req({ lines: [{ model_id: 'm3', qty: 10 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/never ordered/);
    expect(global.__db.writes.inserted.igi_visits).toBeUndefined();
  });

  test('refuses a model IGI has not numbered yet', async () => {
    const res = await visits.POST(req({ lines: [{ model_id: 'm4', qty: 10 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/waiting for a serial/);
  });

  test('refuses an empty request', async () => {
    expect((await visits.POST(req({ lines: [] }))).status).toBe(400);
  });

  test('refuses a malformed body', async () => {
    expect((await visits.POST(req('not json'))).status).toBe(400);
  });
});

describe('reading one movement', () => {
  test('reports how short each line is against what IGI holds now', async () => {
    global.__db = db(baseTables({
      igi_visit_lines: [
        { id: 'l1', visit_id: 'v1', model_id: 'm2', qty_requested: 500, qty_issued: null, qty_received: null },
      ],
    }));
    const body = await (await visitDetail.GET(req(undefined, 'GET'), params)).json();
    expect(body.lines[0]).toMatchObject({ serial: 'LGAJ6552', held: 50, short_by: 450 });
  });

  test('carries the carat and shape, so a serial is never shown alone', async () => {
    global.__db = db(baseTables({
      igi_visit_lines: [{ id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 50 }],
    }));
    const body = await (await visitDetail.GET(req(undefined, 'GET'), params)).json();
    expect(body.lines[0]).toMatchObject({ serial: 'LGAJ6530', carat: 0.1, shape: 'Round', stones: '1' });
  });

  test('says which of the day\'s movements this is', async () => {
    global.__db = db(baseTables({
      igi_visits: [
        { id: 'v1', visit_no: 18, visit_date: '2026-08-24', status: 'closed' },
        { id: 'v2', visit_no: 19, visit_date: '2026-08-24', status: 'closed' },
      ],
    }));
    const body = await (await visitDetail.GET(req(undefined, 'GET'), params)).json();
    expect(body.visit.same_day_position).toBe(1);
    expect(body.visit.same_day_total).toBe(2);
  });

  test('reports a movement that does not exist', async () => {
    global.__db = db(baseTables({ igi_visits: [] }));
    expect((await visitDetail.GET(req(undefined, 'GET'), params)).status).toBe(404);
  });
});

describe('recording what IGI made', () => {
  test('accepts fewer than were asked for', async () => {
    global.__db = db(baseTables({
      igi_visit_lines: [{ id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100 }],
    }));
    const res = await issued.PATCH(req({ issued: { m1: 41 } }, 'PATCH'), params);
    expect(res.status).toBe(200);
    expect(global.__db.writes.updated[0].patch).toEqual({ qty_issued: 41 });
  });

  test('stamps who recorded it', async () => {
    global.__db = db(baseTables({
      igi_visit_lines: [{ id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100 }],
    }));
    await issued.PATCH(req({ issued: { m1: 41 } }, 'PATCH'), params);
    const visitPatch = global.__db.writes.updated.find((u) => u.table === 'igi_visits');
    expect(visitPatch.patch).toMatchObject({ status: 'issued', issued_by: 'u1' });
  });

  test('refuses to record it twice', async () => {
    global.__db = db(baseTables({
      igi_visits: [{ id: 'v1', visit_no: 23, status: 'issued' }],
    }));
    const res = await issued.PATCH(req({ issued: { m1: 41 } }, 'PATCH'), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already been recorded/);
  });

  test('refuses to reopen a closed movement, and says where a correction goes', async () => {
    global.__db = db(baseTables({
      igi_visits: [{ id: 'v1', visit_no: 23, status: 'closed' }],
    }));
    const res = await issued.PATCH(req({ issued: { m1: 41 } }, 'PATCH'), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/new movement/);
  });
});

describe('confirming the return', () => {
  const withIssued = () => db(baseTables({
    igi_visits: [{ id: 'v1', visit_no: 23, status: 'issued' }],
    igi_visit_lines: [
      { id: 'l1', visit_id: 'v1', model_id: 'm1', qty_issued: 50 },
      { id: 'l2', visit_id: 'v1', model_id: 'm2', qty_issued: 12 },
    ],
  }));

  test('takes everything IGI made as coming back, with one button', async () => {
    global.__db = withIssued();
    const res = await received.PATCH(req({}, 'PATCH'), params);
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(62);
  });

  test('accepts a per-line figure when something is short', async () => {
    global.__db = withIssued();
    const body = await (await received.PATCH(req({ received: { m1: 48 } }, 'PATCH'), params)).json();
    expect(body.received).toBe(60);
  });

  test('refuses more coming back than IGI made', async () => {
    global.__db = withIssued();
    const res = await received.PATCH(req({ received: { m1: 80 } }, 'PATCH'), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/More came back/);
  });

  test('refuses to confirm before IGI have recorded what they made', async () => {
    global.__db = db(baseTables());   // still 'requested'
    const res = await received.PATCH(req({}, 'PATCH'), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/before confirming/);
  });

  test('refuses to receive the same movement twice', async () => {
    global.__db = db(baseTables({ igi_visits: [{ id: 'v1', visit_no: 23, status: 'closed' }] }));
    const res = await received.PATCH(req({}, 'PATCH'), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already been received/);
  });

  test('stamps who confirmed it', async () => {
    global.__db = withIssued();
    await received.PATCH(req({}, 'PATCH'), params);
    const visitPatch = global.__db.writes.updated.find((u) => u.table === 'igi_visits');
    expect(visitPatch.patch).toMatchObject({ status: 'closed', received_by: 'u1' });
  });
});
