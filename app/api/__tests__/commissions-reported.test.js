/**
 * @jest-environment node
 *
 * /api/commissions/[id]/reported  PATCH
 *
 * The manual override for the report link. Report generation sets `report_id`
 * itself, but rows get stranded on the wrong side of it — swept into a report
 * before the Paid? tick existed, or linked when a send went wrong — and a
 * linked row is excluded from every later report. Without this there is no way
 * back for that commission.
 *
 * Coverage:
 *   ✓ 401 / 403 / 400 (bad id, bad body, bad JSON)
 *   ✓ 404 when the row doesn't exist
 *   ✓ 409 on paid-out and cancelled rows, with a message mom can act on
 *   ✓ reported=true links the agent's most recent report
 *   ✓ reported=true stamps customer_paid_at only when it's missing
 *   ✓ 409 when the agent has never had a report
 *   ✓ reported=false clears the link and leaves customer_paid_at alone
 *   ✓ the new-client bonus of the same order follows along
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let existingRow = null;
let loadError = null;
let latestReport = null;
let reportError = null;
let reportFilters = null;

let primaryUpdatePayload = null;
let primaryUpdateFilters = null;
let primaryReturnsRow = null;

let cascadeUpdatePayload = null;
let cascadeUpdateFilters = null;
let cascadeReturnsRows = [];
let cascadeReturnsError = null;
let cascadeCalled = false;

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() =>
          Promise.resolve({ data: currentUser ? { role: currentRole } : null, error: null }),
        ),
      };
    }

    if (table === 'commission_reports') {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn((col, val) => { reportFilters[col] = val; return chain; });
      chain.order = jest.fn((col, opts) => { reportFilters.__order = { col, ...opts }; return chain; });
      chain.limit = jest.fn((n) => { reportFilters.__limit = n; return chain; });
      chain.maybeSingle = jest.fn(() => Promise.resolve({ data: latestReport, error: reportError }));
      return chain;
    }

    if (table === 'agent_commissions') {
      return {
        select: jest.fn(() => {
          const chain = {};
          chain.eq = jest.fn(() => chain);
          chain.maybeSingle = jest.fn(() => Promise.resolve({ data: existingRow, error: loadError }));
          return chain;
        }),
        update: jest.fn((payload) => {
          const isPrimary = primaryUpdatePayload === null;
          if (isPrimary) {
            primaryUpdatePayload = payload;
            primaryUpdateFilters = {};
          } else {
            cascadeUpdatePayload = payload;
            cascadeUpdateFilters = {};
            cascadeCalled = true;
          }
          const filters = () => (isPrimary ? primaryUpdateFilters : cascadeUpdateFilters);
          const chain = {};
          chain.eq = jest.fn((col, val) => { filters()[col] = val; return chain; });
          chain.in = jest.fn((col, vals) => { filters()[col] = vals; return chain; });
          chain.select = jest.fn(() => chain);
          chain.maybeSingle = jest.fn(() =>
            Promise.resolve({ data: primaryReturnsRow, error: null }),
          );
          // The cascade awaits the chain directly after .select('id').
          chain.then = (resolve) =>
            resolve({ data: cascadeReturnsRows, error: cascadeReturnsError });
          return chain;
        }),
      };
    }

    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { PATCH } = require('../commissions/[id]/reported/route');

const VALID_ID = '11111111-1111-1111-1111-111111111111';
const REPORT_ID = '22222222-2222-2222-2222-222222222222';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function makeRequest(body = { reported: true }, { raw } = {}) {
  return new global.Request(`http://localhost/api/commissions/${VALID_ID}/reported`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

const call = (body, params = { id: VALID_ID }) => PATCH(makeRequest(body), { params });

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';

  existingRow = {
    id: VALID_ID,
    agent_id: 'agent-1',
    document_id: 'doc-1',
    type: 'order',
    status: 'pending',
    report_id: null,
    customer_paid_at: null,
  };
  loadError = null;

  latestReport = { id: REPORT_ID, period_label: 'June 2026', created_at: '2026-07-01T06:00:00.000Z' };
  reportError = null;
  reportFilters = {};

  primaryUpdatePayload = null;
  primaryUpdateFilters = null;
  primaryReturnsRow = { ...existingRow, report_id: REPORT_ID, customer_paid_at: '2026-07-01T06:00:00.000Z' };

  cascadeUpdatePayload = null;
  cascadeUpdateFilters = null;
  cascadeReturnsRows = [];
  cascadeReturnsError = null;
  cascadeCalled = false;

  jest.clearAllMocks();
});

describe('access and input', () => {
  test('401 when no session', async () => {
    currentUser = null;
    expect((await call()).status).toBe(401);
  });

  test('403 when the caller is not an admin', async () => {
    currentRole = 'user';
    expect((await call()).status).toBe(403);
  });

  test('400 when the id is not a UUID', async () => {
    const res = await call({ reported: true }, { id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid commission id/i);
  });

  test('400 when `reported` is missing or not a boolean', async () => {
    for (const body of [{}, { reported: 'yes' }, { reported: 1 }, { reported: null }]) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/must be a boolean/i);
    }
  });

  test('400 on a malformed body', async () => {
    const res = await PATCH(makeRequest(null, { raw: 'not json' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid json/i);
  });

  test('404 when the commission does not exist', async () => {
    existingRow = null;
    const res = await call();
    expect(res.status).toBe(404);
  });

  test('500 when the row cannot be loaded', async () => {
    loadError = { message: 'boom' };
    existingRow = null;
    expect((await call()).status).toBe(500);
  });
});

describe('rows that are already settled', () => {
  test('409 on a paid-out row, pointing at the way out', async () => {
    existingRow.status = 'paid';
    const res = await call({ reported: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already paid out.*undo/i);
    expect(primaryUpdatePayload).toBeNull();
  });

  test('409 on a cancelled row', async () => {
    existingRow.status = 'cancelled';
    const res = await call({ reported: false });
    expect(res.status).toBe(409);
    expect(primaryUpdatePayload).toBeNull();
  });
});

describe('marking a row reported', () => {
  test('links the agent\'s most recent report', async () => {
    const res = await call({ reported: true });
    expect(res.status).toBe(200);
    expect(primaryUpdatePayload.report_id).toBe(REPORT_ID);
    expect(primaryUpdateFilters.id).toBe(VALID_ID);
    const body = await res.json();
    expect(body.report.period_label).toBe('June 2026');
  });

  test('looks up the report for that agent, newest first', async () => {
    await call({ reported: true });
    expect(reportFilters.agent_id).toBe('agent-1');
    expect(reportFilters.__order).toMatchObject({ col: 'created_at', ascending: false });
    expect(reportFilters.__limit).toBe(1);
  });

  test('ticks Paid? when it is missing — a reported line is a paid one', async () => {
    const res = await call({ reported: true });
    expect(res.status).toBe(200);
    expect(primaryUpdatePayload.customer_paid_at).toMatch(ISO);
  });

  test('never overwrites a Paid? date that is already there', async () => {
    existingRow.customer_paid_at = '2026-05-01T09:00:00.000Z';
    await call({ reported: true });
    expect(primaryUpdatePayload).not.toHaveProperty('customer_paid_at');
  });

  test('409 when the agent has never had a report', async () => {
    latestReport = null;
    const res = await call({ reported: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no report yet/i);
    expect(primaryUpdatePayload).toBeNull();
  });

  test('500 when the report lookup fails', async () => {
    reportError = { message: 'boom' };
    latestReport = null;
    expect((await call({ reported: true })).status).toBe(500);
  });
});

describe('taking a row back off a report', () => {
  test('clears the link so the next report picks it up again', async () => {
    existingRow.report_id = REPORT_ID;
    existingRow.customer_paid_at = '2026-05-01T09:00:00.000Z';
    primaryReturnsRow = { ...existingRow, report_id: null };
    const res = await call({ reported: false });
    expect(res.status).toBe(200);
    expect(primaryUpdatePayload).toEqual({ report_id: null });
  });

  test('leaves the Paid? tick alone', async () => {
    existingRow.report_id = REPORT_ID;
    existingRow.customer_paid_at = '2026-05-01T09:00:00.000Z';
    await call({ reported: false });
    expect(primaryUpdatePayload).not.toHaveProperty('customer_paid_at');
  });

  test('does not go looking for a report', async () => {
    await call({ reported: false });
    expect(reportFilters).toEqual({});
  });
});

describe('the new-client bonus follows its order', () => {
  test('an order with a document cascades onto its bonus row', async () => {
    cascadeReturnsRows = [{ id: 'bonus-1' }];
    const res = await call({ reported: true });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(true);
    expect(cascadeUpdatePayload).toEqual(primaryUpdatePayload);
    expect(cascadeUpdateFilters).toMatchObject({
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'new_client_bonus',
      status: ['pending', 'approved'],
    });
    expect((await res.json()).cascaded_bonuses).toBe(1);
  });

  test('unlinking cascades too', async () => {
    existingRow.report_id = REPORT_ID;
    primaryReturnsRow = { ...existingRow, report_id: null };
    cascadeReturnsRows = [{ id: 'bonus-1' }];
    await call({ reported: false });
    expect(cascadeUpdatePayload).toEqual({ report_id: null });
  });

  test('a bonus row does not cascade onto itself', async () => {
    primaryReturnsRow = { ...primaryReturnsRow, type: 'new_client_bonus' };
    const res = await call({ reported: true });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(false);
    expect((await res.json()).cascaded_bonuses).toBe(0);
  });

  test('an order without a document does not cascade', async () => {
    primaryReturnsRow = { ...primaryReturnsRow, document_id: null };
    await call({ reported: true });
    expect(cascadeCalled).toBe(false);
  });

  test('a failing cascade does not fail the click', async () => {
    cascadeReturnsError = { message: 'simulated cascade failure' };
    const res = await call({ reported: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
    expect(body.commission.id).toBe(VALID_ID);
  });
});
