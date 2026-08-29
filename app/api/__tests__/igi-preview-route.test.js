/**
 * @jest-environment node
 *
 * LoveLab's preview of IGI's four screens.
 *
 * These exercise the real handler rather than a mock of it, because the whole
 * value of the preview is that it answers what IGI's own routes answer — and
 * "it renders" is not the same claim as "it renders the same thing".
 */

const checkRateLimit = jest.fn(() => null);
const authGetUser = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => global.__sb),
  createAdminClient: jest.fn(() => global.__admin),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a) => checkRateLimit(...a) }));

const previewTodo = require('../igi/preview/todo/route');
const previewStock = require('../igi/preview/stock/route');
const previewHistory = require('../igi/preview/history/route');
const previewInvoices = require('../igi/preview/invoices/route');
const previewBatches = require('../igi/preview/batches/route');
const previewAlerts = require('../igi/preview/alerts/route');
const previewProduce = require('../igi/preview/todo/[visitId]/produce/route');

const PREVIEW = {
  todo: previewTodo, stock: previewStock,
  history: previewHistory, invoices: previewInvoices,
};
const portalTodo = require('../igi-portal/todo/route');
const portalStock = require('../igi-portal/stock/route');
const portalHistory = require('../igi-portal/history/route');
const portalInvoices = require('../igi-portal/invoices/route');

const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', spec: null, state: 'in_use', pool_min: 1000, sort_order: 3 },
  { id: 'm9', serial: 'LGAJ6588', name: '—', stones: '4', carat: 0.8, shape: 'Rd', spec: null, state: 'reserved', pool_min: null, sort_order: 61 },
];

const TABLES = {
  igi_models: MODELS,
  igi_batches: [{ id: 'b1', model_id: 'm1', qty: 1000, batch_date: '2026-08-27', reference: 'initial order' }],
  igi_visit_lines: [
    { id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: null },
    { id: 'l2', visit_id: 'v2', model_id: 'm1', qty_requested: 40, qty_issued: 40 },
  ],
  igi_visits: [
    { id: 'v1', visit_no: 24, visit_date: '2026-08-28', status: 'requested', date_suspect: false, unattributed_total: null },
    { id: 'v2', visit_no: 23, visit_date: '2026-08-20', status: 'closed', date_suspect: false, unattributed_total: null },
  ],
};

function sb({ profile }) {
  return {
    auth: { getUser: authGetUser },
    from(table) {
      const rows = TABLES[table] ?? [];
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === 'profiles' ? profile : rows[0] ?? null, error: null }),
        single: async () => ({ data: table === 'profiles' ? profile : rows[0] ?? null, error: null }),
        update: () => ({
          eq: async () => ({ data: null, error: null }),
          in: () => ({ select: async () => ({ data: [], error: null }) }),
        }),
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  };
}

const req = (body, method = 'GET') => new global.Request('http://localhost/api/igi/preview', {
  method,
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(() => {
  checkRateLimit.mockReset().mockReturnValue(null);
  authGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'sam' } } });
  global.__sb = sb({ profile: { id: 'sam', role: 'admin' } });
  global.__admin = sb({ profile: { id: 'sam', role: 'admin' } });
});

const SCREENS = ['todo', 'stock', 'history', 'invoices'];

describe('every IGI screen has a working preview', () => {
  it.each(SCREENS)('%s answers', async (screen) => {
    const res = await PREVIEW[screen].GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.any(Object));
  });

  it('answers exactly what IGI’s own route answers', async () => {
    // The point of the preview. If these ever diverge, Sam is looking at
    // something that is not what IGI have on screen, which is worse than
    // having no preview at all.
    global.__sb = sb({ profile: { id: 'igi-1', is_igi: true } });
    const theirs = await Promise.all([
      portalTodo.GET(req()), portalStock.GET(req()),
      portalHistory.GET(req()), portalInvoices.GET(req()),
    ].map(async (p) => (await p).json()));

    global.__sb = sb({ profile: { id: 'sam', role: 'admin' } });
    const ours = await Promise.all(
      SCREENS.map(async (s) => (await PREVIEW[s].GET(req())).json()),
    );

    expect(ours).toEqual(theirs);
  })

  it('hides the reserved serials, which RLS is not there to do for an admin', async () => {
    const body = await (await previewStock.GET(req())).json();
    expect(body.models.map((m) => m.serial)).toEqual(['LGAJ6530']);
  });

  it('refuses anyone who is not a LoveLab admin', async () => {
    global.__sb = sb({ profile: { id: 'igi-1', role: 'user', is_igi: true } });
    global.__admin = sb({ profile: { id: 'igi-1', role: 'user', is_igi: true } });
    for (const screen of SCREENS) {
      expect((await PREVIEW[screen].GET(req())).status).toBe(403);
    }
  });
});

describe('and can drive their half, under his own name', () => {
  // The row records who acted. That is what keeps "each company enters its own
  // half" true once IGI are live, without leaving their half untestable before.
  it('records a batch, stamped with the admin who made it', async () => {
    let inserted = null;
    global.__admin = { ...sb({ profile: { id: 'sam', role: 'admin' } }), from: (t) => ({
      insert: (payload) => { inserted = payload; return {
        select: () => ({ single: async () => ({ data: { id: 'b9', ...payload }, error: null }) }) } },
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'sam', role: 'admin' }, error: null }) }) }),
    }) };
    const res = await previewBatches.POST(
      req({ model_id: 'm1', qty: 500, batch_date: '2026-08-29' }, 'POST'));

    expect(res.status).toBe(201);
    expect(inserted).toMatchObject({ model_id: 'm1', qty: 500, created_by: 'sam' });
  });

  it('refuses a batch with no quantity, in the same words IGI would see', async () => {
    const res = await previewBatches.POST(req({ model_id: 'm1', batch_date: '2026-08-29' }, 'POST'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/how many did you make/i);
  });

  it('sets IGI’s alert level', async () => {
    let patched = null;
    global.__admin = { ...sb({ profile: { id: 'sam', role: 'admin' } }), from: (t) => ({
      update: (p) => { patched = p; return { in: () => ({ select: async () => ({ data: [], error: null }) }) } },
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'sam', role: 'admin' }, error: null }) }) }),
    }) };
    const res = await previewAlerts.PATCH(req({ model_ids: ['m1'], pool_min: 250 }, 'PATCH'));
    expect(res.status).toBe(200);
    expect(patched).toEqual({ pool_min: 250 });
  });

  it('records production against the admin, and only on a movement waiting on IGI', async () => {
    const res = await previewProduce.PATCH(
      req({ made: { m1: 60 } }, 'PATCH'),
      { params: Promise.resolve({ visitId: 'v1' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ visit_no: 24, made: expect.any(Number) });
  });

  it('refuses to write for anyone who is not a LoveLab admin', async () => {
    global.__sb = sb({ profile: { id: 'igi-1', role: 'user', is_igi: true } });
    global.__admin = sb({ profile: { id: 'igi-1', role: 'user', is_igi: true } });
    const res = await previewBatches.POST(
      req({ model_id: 'm1', qty: 5, batch_date: '2026-08-29' }, 'POST'));
    expect(res.status).toBe(403);
  });
});
