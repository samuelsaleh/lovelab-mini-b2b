/**
 * @jest-environment node
 *
 * The LoveLab side of the certificate module.
 *
 * These screens show both LoveLab's shelf and what IGI holds, so they are
 * LoveLab-only. The tests below care most about that boundary and about the
 * rules that keep a wrong number from being written.
 */

const getUserContext = jest.fn();
const checkRateLimit = jest.fn(() => null);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({})),
  createAdminClient: jest.fn(() => global.__db),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a) => checkRateLimit(...a) }));
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => getUserContext(...a) }));

const overview = require('../igi/overview/route');
const descriptions = require('../igi/descriptions/route');
const alerts = require('../igi/alerts/route');

function req(body) {
  return new global.Request('http://localhost/api/igi', {
    method: body ? 'PATCH' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

/** A stand-in for the service-role client covering the calls these routes make. */
function db(tables, { updateResult } = {}) {
  const captured = { update: null, filter: null };
  const api = {
    from(table) {
      const rows = tables[table] ?? [];
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        not: () => chain,
        eq: (_c, v) => { captured.filter = v; return chain },
        in: (_c, v) => { captured.filter = v; return chain },
        maybeSingle: async () => ({ data: updateResult ?? rows[0] ?? null, error: null }),
        update: (patch) => { captured.update = patch; return chain },
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
    captured,
  };
  return api;
}

const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', state: 'in_use', qty_ordered: 12250, shelf_min: 25, pool_min: null, carat: 0.1, shape: 'Round', stones: '1' },
  { id: 'm2', serial: 'LGAJ6588', name: '—', state: 'reserved', qty_ordered: null, shelf_min: 25, pool_min: null },
];

function fullDb() {
  return db({
    igi_models: MODELS,
    igi_batches: [{ model_id: 'm1', qty: 12250 }],
    igi_visit_lines: [{ visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: 100, qty_received: 100 }],
    igi_visits: [
      { id: 'v1', visit_no: 1, visit_date: '2026-05-05', status: 'closed', unattributed_total: null, date_suspect: false },
      { id: 'v2', visit_no: 9, visit_date: '2016-06-01', status: 'closed', unattributed_total: 453, date_suspect: true },
    ],
    igi_shelf_snapshots: [{ snapshot_date: '2026-08-28', description: 'IGI 0.10 CERTIFICATE', total_pcs: 1006, model_id: 'm1' }],
    igi_descriptions: [{ description: 'IGI 0.10 CERTIFICATE', model_id: 'm1', kind: 'certificate', last_seen_at: null }],
  });
}

beforeEach(() => {
  checkRateLimit.mockReset().mockReturnValue(null);
  getUserContext.mockReset().mockResolvedValue({ user: { id: 'u1' }, isAdmin: true });
  global.__db = fullDb();
});

describe('only LoveLab may read the certificate overview', () => {
  test('a signed-out visitor is refused', async () => {
    getUserContext.mockResolvedValue({ user: null, isAdmin: false });
    const res = await overview.GET(req());
    expect(res.status).toBe(401);
  });

  test('a signed-in non-admin is refused', async () => {
    // The overview carries LoveLab's shelf, which is their sales rate.
    getUserContext.mockResolvedValue({ user: { id: 'u2' }, isAdmin: false });
    const res = await overview.GET(req());
    expect(res.status).toBe(403);
  });

  test('the rate limiter can stop a request before any authorization', async () => {
    const limited = new Response('{}', { status: 429 });
    checkRateLimit.mockReturnValue(limited);
    const res = await overview.GET(req());
    expect(res.status).toBe(429);
    expect(getUserContext).not.toHaveBeenCalled();
  });
});

describe('the overview derives both sides', () => {
  test('reports what IGI holds and what sits on our shelf', async () => {
    const body = await (await overview.GET(req())).json();
    const model = body.models.find((m) => m.id === 'm1');
    expect(model.pool).toBe(12150);   // 12 250 ordered less 100 issued
    expect(model.shelf).toBe(1006);
  });

  test('keeps the unattributed certificates as their own figure', async () => {
    const body = await (await overview.GET(req())).json();
    expect(body.totals.unattributed).toBe(453);
    // and never attributed to a model
    expect(body.models.every((m) => m.pool !== 453)).toBe(true);
  });

  test('leaves a reserved serial out of the operational totals', async () => {
    const body = await (await overview.GET(req())).json();
    expect(body.totals.models_in_use).toBe(1);
    expect(body.totals.reserved).toBe(1);
    expect(body.totals.ordered).toBe(12250);
    expect(body.models.find((m) => m.id === 'm2').pool).toBeNull();
  });

  test('says when the shelf was last read', async () => {
    const body = await (await overview.GET(req())).json();
    expect(body.shelf.last_read).toBe('2026-08-28');
  });
});

describe('linking a description to a model', () => {
  test('refuses a non-admin', async () => {
    getUserContext.mockResolvedValue({ user: { id: 'u2' }, isAdmin: false });
    expect((await descriptions.PATCH(req({ description: 'X', model_id: 'm1' }))).status).toBe(403);
  });

  test('requires a description', async () => {
    expect((await descriptions.PATCH(req({ model_id: 'm1' }))).status).toBe(400);
    expect((await descriptions.PATCH(req({ description: '  ' }))).status).toBe(400);
  });

  test('rejects an unknown classification', async () => {
    const res = await descriptions.PATCH(req({ description: 'X', kind: 'whatever' }));
    expect(res.status).toBe(400);
  });

  test('refuses to link a line that is not a certificate', async () => {
    // Packing material and LoveLab's in-house certificates have no IGI model.
    const res = await descriptions.PATCH(req({ description: 'ENVELOP PINK IGI', model_id: 'm1', kind: 'packaging' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/certificate/i);
  });

  test('clears a stale link when a line is reclassified', async () => {
    global.__db = db({ igi_descriptions: [] }, { updateResult: { id: 'd1', description: 'X', model_id: null, kind: 'in_house' } });
    const res = await descriptions.PATCH(req({ description: 'X', kind: 'in_house' }));
    expect(res.status).toBe(200);
    expect(global.__db.captured.update.model_id).toBeNull();
  });

  test('records who made the link', async () => {
    global.__db = db({ igi_descriptions: [] }, { updateResult: { id: 'd1', description: 'X', model_id: 'm1', kind: 'certificate' } });
    await descriptions.PATCH(req({ description: 'X', model_id: 'm1' }));
    expect(global.__db.captured.update.linked_by).toBe('u1');
  });

  test('reports a description that does not exist', async () => {
    global.__db = db({ igi_descriptions: [] }, { updateResult: null });
    expect((await descriptions.PATCH(req({ description: 'nope', model_id: 'm1' }))).status).toBe(404);
  });

  test('rejects a malformed body', async () => {
    expect((await descriptions.PATCH(req('not json'))).status).toBe(400);
  });
});

describe('setting the shelf alert level', () => {
  test('refuses a non-admin', async () => {
    getUserContext.mockResolvedValue({ user: { id: 'u2' }, isAdmin: false });
    expect((await alerts.PATCH(req({ model_ids: ['m1'], shelf_min: 50 }))).status).toBe(403);
  });

  test('sets one model', async () => {
    global.__db = db({ igi_models: [{ id: 'm1', shelf_min: 50 }] });
    const res = await alerts.PATCH(req({ model_ids: ['m1'], shelf_min: 50 }));
    expect(res.status).toBe(200);
    expect(global.__db.captured.update.shelf_min).toBe(50);
  });

  test('sets every model shown at once', async () => {
    global.__db = db({ igi_models: [] });
    await alerts.PATCH(req({ model_ids: ['m1', 'm2', 'm3'], shelf_min: 100 }));
    expect(global.__db.captured.filter).toEqual(['m1', 'm2', 'm3']);
  });

  test('needs at least one model', async () => {
    expect((await alerts.PATCH(req({ model_ids: [], shelf_min: 50 }))).status).toBe(400);
  });

  test('rejects a level that is not a whole number', async () => {
    expect((await alerts.PATCH(req({ model_ids: ['m1'], shelf_min: 12.5 }))).status).toBe(400);
    expect((await alerts.PATCH(req({ model_ids: ['m1'], shelf_min: -1 }))).status).toBe(400);
    expect((await alerts.PATCH(req({ model_ids: ['m1'], shelf_min: '50' }))).status).toBe(400);
  });

  test('accepts zero, which means never warn me', async () => {
    global.__db = db({ igi_models: [] });
    expect((await alerts.PATCH(req({ model_ids: ['m1'], shelf_min: 0 }))).status).toBe(200);
  });

  test('will not update an unbounded number of models', async () => {
    const many = Array.from({ length: 201 }, (_, i) => `m${i}`);
    expect((await alerts.PATCH(req({ model_ids: many, shelf_min: 50 }))).status).toBe(400);
  });

  test('does not let LoveLab write IGI\'s own alert level', async () => {
    // pool_min belongs to IGI. Two alert rules, one owner each.
    global.__db = db({ igi_models: [] });
    await alerts.PATCH(req({ model_ids: ['m1'], shelf_min: 50, pool_min: 999 }));
    expect(global.__db.captured.update).not.toHaveProperty('pool_min');
  });
});
