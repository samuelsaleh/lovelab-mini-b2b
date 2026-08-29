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

const preview = require('../igi/preview/[screen]/route');
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
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  };
}

const req = () => new global.Request('http://localhost/api/igi/preview/todo');
const params = (screen) => ({ params: Promise.resolve({ screen }) });

beforeEach(() => {
  checkRateLimit.mockReset().mockReturnValue(null);
  authGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'sam' } } });
  global.__sb = sb({ profile: { id: 'sam', role: 'admin' } });
  global.__admin = sb({ profile: { id: 'sam', role: 'admin' } });
});

const SCREENS = ['todo', 'stock', 'history', 'invoices'];

describe('every IGI screen has a working preview', () => {
  it.each(SCREENS)('%s answers', async (screen) => {
    const res = await preview.GET(req(), params(screen));
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
      SCREENS.map(async (s) => (await preview.GET(req(), params(s))).json()),
    );

    expect(ours).toEqual(theirs);
  })

  it('hides the reserved serials, which RLS is not there to do for an admin', async () => {
    const body = await (await preview.GET(req(), params('stock'))).json();
    expect(body.models.map((m) => m.serial)).toEqual(['LGAJ6530']);
  });

  it('refuses a screen that does not exist', async () => {
    const res = await preview.GET(req(), params('shelf'));
    expect(res.status).toBe(404);
  });

  it('refuses a screen name that is a prototype property', async () => {
    // `PORTAL_VIEWS[screen]` would happily hand back Object.prototype members.
    const res = await preview.GET(req(), params('constructor'));
    expect(res.status).toBe(404);
  });

  it('refuses anyone who is not a LoveLab admin', async () => {
    global.__sb = sb({ profile: { id: 'igi-1', role: 'user', is_igi: true } });
    global.__admin = sb({ profile: { id: 'igi-1', role: 'user', is_igi: true } });
    const res = await preview.GET(req(), params('stock'));
    expect(res.status).toBe(403);
  });
});
