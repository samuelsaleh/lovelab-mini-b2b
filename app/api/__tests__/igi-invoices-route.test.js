/**
 * @jest-environment node
 *
 * The invoice comparison: our figures from the movements, beside what IGI billed.
 */

const getUserContext = jest.fn();
const checkRateLimit = jest.fn(() => null);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({})),
  createAdminClient: jest.fn(() => global.__db),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a) => checkRateLimit(...a) }));
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => getUserContext(...a) }));

const invoices = require('../igi/invoices/route');

function req(body, method = 'GET') {
  return new global.Request('http://localhost/api/igi/invoices', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

function db(tables) {
  const captured = { upserted: null };
  return {
    captured,
    from(table) {
      const rows = tables[table] ?? [];
      const chain = {
        select: () => chain,
        upsert: (payload, opts) => { captured.upserted = { payload, opts }; return {
          select: () => ({ single: async () => ({ data: payload, error: null }) }) } },
        single: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  };
}

// One closed movement in August: 100 sent over, 60 made, 58 came back.
const BASE = {
  igi_visits: [{ id: 'v1', visit_no: 24, visit_date: '2026-08-24', status: 'closed', unattributed_total: null, date_suspect: false }],
  igi_visit_lines: [{ visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: 60, qty_received: 58 }],
  igi_models: [{ id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round' }],
  igi_invoices: [],
};

beforeEach(() => {
  checkRateLimit.mockReset().mockReturnValue(null);
  getUserContext.mockReset().mockResolvedValue({ user: { id: 'u1' }, isAdmin: true });
  global.__db = db(BASE);
});

describe('only LoveLab see the invoice comparison', () => {
  test('a non-admin is refused', async () => {
    // What LoveLab were billed, and whether they agree, is not IGI's to read.
    getUserContext.mockResolvedValue({ user: { id: 'u2' }, isAdmin: false });
    expect((await invoices.GET(req())).status).toBe(403);
    expect((await invoices.PUT(req({ month: '2026-08' }, 'PUT'))).status).toBe(403);
  });

  test('a signed-out visitor is refused', async () => {
    getUserContext.mockResolvedValue({ user: null, isAdmin: false });
    expect((await invoices.GET(req())).status).toBe(401);
  });
});

describe('our figures', () => {
  test('counts what came back by default, and shows all three ways', async () => {
    const body = await (await invoices.GET(req())).json();
    const m = body.months[0];
    expect(m.month).toBe('2026-08');
    expect(m.basis).toBe('received');
    expect(m.ours.qty).toBe(58);
    expect(m.totals_by_basis).toEqual({
      requested: { qty: 100, eur: 120 },
      issued: { qty: 60, eur: 72 },
      received: { qty: 58, eur: 69.6 },
    });
  });

  test('names each model with its carat and shape', async () => {
    const body = await (await invoices.GET(req())).json();
    expect(body.months[0].ours.rows[0]).toMatchObject({
      serial: 'LGAJ6530', name: 'Cuty-Cubix', carat: 0.1, shape: 'Round',
    });
  });

  test('says nothing is recorded rather than implying agreement', async () => {
    const body = await (await invoices.GET(req())).json();
    expect(body.months[0].comparison).toEqual({ status: 'not_recorded', difference: null });
    expect(body.months[0].billed).toBeNull();
  });

  test('leaves out months with nothing completed', async () => {
    global.__db = db({ ...BASE, igi_visits: [{ id: 'v1', visit_no: 24, visit_date: '2026-08-24', status: 'issued', unattributed_total: null }] });
    const body = await (await invoices.GET(req())).json();
    expect(body.months).toEqual([]);
  });
});

describe('against what IGI billed', () => {
  test('says so when the two agree', async () => {
    global.__db = db({ ...BASE, igi_invoices: [{ period_month: '2026-08-01', igi_reference: 'ATW/26/SC/02896', igi_total_eur: '69.60', basis: 'received', note: null }] });
    const body = await (await invoices.GET(req())).json();
    expect(body.months[0].comparison).toEqual({ status: 'agrees', difference: 0 });
    expect(body.months[0].billed.reference).toBe('ATW/26/SC/02896');
  });

  test('explains a gap by naming the basis that would close it', async () => {
    // They billed 120,00 — the 100 we sent over, not the 58 that came back.
    global.__db = db({ ...BASE, igi_invoices: [{ period_month: '2026-08-01', igi_reference: 'ATW/26', igi_total_eur: '120.00', basis: 'received', note: null }] });
    const body = await (await invoices.GET(req())).json();
    expect(body.months[0].comparison.status).toBe('they_billed_more');
    expect(body.months[0].basis_that_would_match).toBe('requested');
  });

  test('recomputes on the basis recorded for that month', async () => {
    global.__db = db({ ...BASE, igi_invoices: [{ period_month: '2026-08-01', igi_reference: 'ATW/26', igi_total_eur: '120.00', basis: 'requested', note: null }] });
    const body = await (await invoices.GET(req())).json();
    expect(body.months[0].ours.qty).toBe(100);
    expect(body.months[0].comparison).toEqual({ status: 'agrees', difference: 0 });
  });

  test('keeps the unattributed certificates on their own line', async () => {
    global.__db = db({
      ...BASE,
      igi_visits: [...BASE.igi_visits, { id: 'v2', visit_no: 25, visit_date: '2026-08-25', status: 'closed', unattributed_total: 453, date_suspect: false }],
    });
    const body = await (await invoices.GET(req())).json();
    expect(body.months[0].ours.unattributed).toBe(453);
    expect(body.months[0].ours.rows.every((r) => r.qty !== 453)).toBe(true);
  });
});

describe('recording their invoice', () => {
  test('saves it against the month', async () => {
    const res = await invoices.PUT(req({ month: '2026-08', reference: 'ATW/26/SC/02896', total_eur: 69.6, basis: 'received' }, 'PUT'));
    expect(res.status).toBe(200);
    expect(global.__db.captured.upserted.payload).toMatchObject({
      period_month: '2026-08-01', igi_reference: 'ATW/26/SC/02896', igi_total_eur: 69.6,
      basis: 'received', recorded_by: 'u1',
    });
  });

  test('corrects rather than duplicates when entered again', async () => {
    await invoices.PUT(req({ month: '2026-08', total_eur: 70 }, 'PUT'));
    expect(global.__db.captured.upserted.opts).toEqual({ onConflict: 'period_month' });
  });

  test('needs a real month', async () => {
    expect((await invoices.PUT(req({ total_eur: 70 }, 'PUT'))).status).toBe(400);
    expect((await invoices.PUT(req({ month: 'August', total_eur: 70 }, 'PUT'))).status).toBe(400);
  });

  test('refuses a total that is not an amount', async () => {
    expect((await invoices.PUT(req({ month: '2026-08', total_eur: -1 }, 'PUT'))).status).toBe(400);
    expect((await invoices.PUT(req({ month: '2026-08', total_eur: 'lots' }, 'PUT'))).status).toBe(400);
  });

  test('refuses an unknown billing basis', async () => {
    expect((await invoices.PUT(req({ month: '2026-08', basis: 'guesswork' }, 'PUT'))).status).toBe(400);
  });

  test('accepts a month with no total yet, so the reference can be filed first', async () => {
    const res = await invoices.PUT(req({ month: '2026-08', reference: 'ATW/26' }, 'PUT'));
    expect(res.status).toBe(200);
    expect(global.__db.captured.upserted.payload.igi_total_eur).toBeNull();
  });
});
