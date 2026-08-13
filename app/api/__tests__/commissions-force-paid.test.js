/**
 * @jest-environment node
 *
 * /api/commissions/[id]/force-paid  PATCH
 *
 * Settles one commission by hand. The normal route is Paid? → Send report now →
 * Record Payment, but lines get stranded in Reported (paid outside the app, or
 * the payment recorded against another report) and a reported row is excluded
 * from every later report — so Record Payment can never reach it again.
 *
 * Coverage:
 *   ✓ 401 / 403 / 400 (bad id)
 *   ✓ 404 when the row doesn't exist, 500 when it can't be loaded
 *   ✓ 409 on already-paid and cancelled rows, with a message mom can act on
 *   ✓ flips status to paid with a paid_at stamp, guarded to unsettled rows
 *   ✓ stamps customer_paid_at only when missing, so Undo lands on "Ready"
 *   ✓ leaves the report link alone — a forced row stays on its report
 *   ✓ 409 when a payout settled the row between the load and the write
 *   ✓ the new-client bonus of the same order follows along, Paid? date included
 *   ✓ never writes to the agent_payments ledger
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let existingRow = null;
let loadError = null;

let updateCalls = [];
let primaryReturnsRow = null;
let primaryUpdateError = null;
let stampReturnsError = null;
let cascadeReturnsRows = [];
let cascadeReturnsError = null;

const primary = () => updateCalls[0] || null;
const stamp = () => updateCalls[1] || null;
const cascade = () => updateCalls[2] || null;

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

    if (table === 'agent_commissions') {
      return {
        select: jest.fn(() => {
          const chain = {};
          chain.eq = jest.fn(() => chain);
          chain.maybeSingle = jest.fn(() => Promise.resolve({ data: existingRow, error: loadError }));
          return chain;
        }),
        update: jest.fn((payload) => {
          const call = { payload, filters: {}, sawIsNull: false };
          const index = updateCalls.length;
          updateCalls.push(call);

          const chain = {};
          chain.eq = jest.fn((col, val) => { call.filters[col] = val; return chain; });
          chain.in = jest.fn((col, vals) => { call.filters[col] = vals; return chain; });
          chain.is = jest.fn((col, val) => {
            call.filters[col] = val;
            call.sawIsNull = val === null;
            return chain;
          });
          chain.select = jest.fn(() => chain);
          chain.maybeSingle = jest.fn(() =>
            Promise.resolve({ data: primaryUpdateError ? null : primaryReturnsRow, error: primaryUpdateError }),
          );
          // The two bonus statements are awaited directly rather than through
          // .maybeSingle(): the stamp resolves to an error slot, the settle to rows.
          chain.then = (resolve) =>
            resolve(
              index === 1
                ? { data: null, error: stampReturnsError }
                : { data: cascadeReturnsRows, error: cascadeReturnsError },
            );
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

const { PATCH } = require('../commissions/[id]/force-paid/route');

const VALID_ID = '11111111-1111-1111-1111-111111111111';
const REPORT_ID = '22222222-2222-2222-2222-222222222222';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function makeRequest() {
  return new global.Request(`http://localhost/api/commissions/${VALID_ID}/force-paid`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
  });
}

const call = (params = { id: VALID_ID }) => PATCH(makeRequest(), { params });

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';

  // The shape mom actually clicks on: on a report, never settled.
  existingRow = {
    id: VALID_ID,
    agent_id: 'agent-1',
    document_id: 'doc-1',
    type: 'order',
    status: 'pending',
    report_id: REPORT_ID,
    customer_paid_at: null,
  };
  loadError = null;

  updateCalls = [];
  primaryUpdateError = null;
  primaryReturnsRow = { ...existingRow, status: 'paid' };
  stampReturnsError = null;
  cascadeReturnsRows = [];
  cascadeReturnsError = null;

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

  test('403 for an agent, not a silent success', async () => {
    currentRole = 'agent';
    expect((await call()).status).toBe(403);
    expect(updateCalls).toHaveLength(0);
  });

  test('400 when the id is not a UUID', async () => {
    const res = await call({ id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid commission id/i);
  });

  test('404 when the commission does not exist', async () => {
    existingRow = null;
    expect((await call()).status).toBe(404);
  });

  test('500 when the row cannot be loaded', async () => {
    loadError = { message: 'boom' };
    existingRow = null;
    expect((await call()).status).toBe(500);
  });
});

describe('rows that must not be forced', () => {
  test('409 on an already-paid row, without touching it', async () => {
    existingRow.status = 'paid';
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already paid out/i);
    expect(updateCalls).toHaveLength(0);
  });

  test('409 on a cancelled row, with a reason', async () => {
    existingRow.status = 'cancelled';
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/cancelled/i);
    expect(updateCalls).toHaveLength(0);
  });
});

describe('forcing a reported row to paid', () => {
  test('sets status paid with a paid_at stamp', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(primary().payload.status).toBe('paid');
    expect(primary().payload.paid_at).toMatch(ISO);
    expect((await res.json()).commission.status).toBe('paid');
  });

  test('only touches the row mom clicked, and only while unsettled', async () => {
    await call();
    expect(primary().filters.id).toBe(VALID_ID);
    expect(primary().filters.status).toEqual(['pending', 'approved']);
  });

  test('ticks Paid? when missing, so Undo lands on "Ready to pay"', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(primary().payload.customer_paid_at).toMatch(ISO);
    // Same instant for the payout and the customer tick — one click, one time.
    expect(primary().payload.customer_paid_at).toBe(primary().payload.paid_at);
  });

  test('never overwrites a Paid? date that is already there', async () => {
    existingRow.customer_paid_at = '2026-04-30T09:00:00.000Z';
    await call();
    expect(primary().payload).not.toHaveProperty('customer_paid_at');
  });

  test('leaves the report link alone — the line stays on its report', async () => {
    await call();
    expect(primary().payload).not.toHaveProperty('report_id');
  });

  test('works on a Ready row that never made it onto a report', async () => {
    existingRow.report_id = null;
    existingRow.customer_paid_at = '2026-04-30T09:00:00.000Z';
    const res = await call();
    expect(res.status).toBe(200);
    expect(primary().payload.status).toBe('paid');
  });

  test('409 when a payout settled the row a moment earlier', async () => {
    primaryReturnsRow = null;
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/just settled|reload/i);
  });

  test('500 when the update fails', async () => {
    primaryUpdateError = { message: 'boom' };
    expect((await call()).status).toBe(500);
  });

  test('never writes to the payments ledger', async () => {
    await call();
    const tables = mockAdminSupabase.from.mock.calls.map(([t]) => t);
    expect(tables).not.toContain('agent_payments');
    expect(tables).not.toContain('commission_reports');
  });
});

describe('the new-client bonus follows its order', () => {
  test('the bonus of the same order is settled too', async () => {
    cascadeReturnsRows = [{ id: 'bonus-1' }];
    const res = await call();
    expect(res.status).toBe(200);
    expect(cascade().payload).toMatchObject({ status: 'paid' });
    expect(cascade().payload.paid_at).toMatch(ISO);
    expect(cascade().filters).toMatchObject({
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'new_client_bonus',
      status: ['pending', 'approved'],
    });
    expect((await res.json()).cascaded_bonuses).toBe(1);
  });

  test('a bonus missing its Paid? date gets one, and only then', async () => {
    await call();
    expect(stamp().payload).toEqual({ customer_paid_at: expect.stringMatching(ISO) });
    expect(stamp().sawIsNull).toBe(true);
    expect(stamp().filters).toMatchObject({
      document_id: 'doc-1',
      type: 'new_client_bonus',
      customer_paid_at: null,
    });
  });

  test('the bonus is settled with the same timestamp as its order', async () => {
    await call();
    expect(cascade().payload.paid_at).toBe(primary().payload.paid_at);
  });

  test('a bonus row does not cascade onto itself', async () => {
    primaryReturnsRow = { ...primaryReturnsRow, type: 'new_client_bonus' };
    const res = await call();
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect((await res.json()).cascaded_bonuses).toBe(0);
  });

  test('an order without a document does not cascade', async () => {
    primaryReturnsRow = { ...primaryReturnsRow, document_id: null };
    await call();
    expect(updateCalls).toHaveLength(1);
  });

  test('a failing cascade does not fail the click', async () => {
    cascadeReturnsError = { message: 'simulated cascade failure' };
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
    expect(body.commission.status).toBe('paid');
  });

  test('a failing Paid? stamp still settles the bonus', async () => {
    stampReturnsError = { message: 'simulated stamp failure' };
    cascadeReturnsRows = [{ id: 'bonus-1' }];
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).cascaded_bonuses).toBe(1);
  });
});
