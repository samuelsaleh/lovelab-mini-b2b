/**
 * @jest-environment node
 *
 * /api/commissions/[id]  PATCH — amounts and status by hand (21 Oct 2026).
 *
 * Dionne fixes a line's figures or cancels it from the organization table
 * without touching the order.
 *
 * Coverage:
 *   ✓ order_total recalculates the commission from the line's rate
 *   ✓ order_total + commission_amount together: the commission given wins
 *   ✓ commission_amount alone leaves the net untouched
 *   ✓ status 'cancelled' / 'pending' round-trips; cancelling clears paid_at
 *   ✓ 409 on a paid-out line, 409 amounts on a cancelled line
 *   ✓ 400 on a negative amount / unknown status
 *   ✓ invoice-only requests still never load the row
 */

let currentUser = { id: 'admin-user' };
let existingRow = null;
let loadCalls = 0;
let updatePayload = null;

const ID = '11111111-1111-1111-1111-111111111111';

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
      };
    }
    if (table === 'agent_commissions') {
      return {
        select: jest.fn(() => {
          loadCalls += 1;
          const c = {};
          c.eq = jest.fn(() => c);
          c.maybeSingle = jest.fn(async () => ({ data: existingRow, error: null }));
          return c;
        }),
        update: jest.fn((payload) => {
          updatePayload = payload;
          const c = {};
          c.eq = jest.fn(() => c);
          c.select = jest.fn(() => c);
          c.maybeSingle = jest.fn(async () => ({ data: existingRow ? { ...existingRow, ...payload } : null, error: null }));
          return c;
        }),
      };
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: currentUser } })) },
  })),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { PATCH } = require('../commissions/[id]/route');

const call = (body) => PATCH(
  new global.Request(`http://localhost/api/commissions/${ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  { params: { id: ID } },
);

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  loadCalls = 0;
  updatePayload = null;
  existingRow = { id: ID, status: 'pending', commission_rate: 20, order_total: 2006, commission_amount: 401.2, type: 'order', invoice_number: null };
});

describe('PATCH /api/commissions/[id] — amounts', () => {
  test('a new net recalculates the commission from the rate', async () => {
    const res = await call({ order_total: 1800 });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ order_total: 1800, commission_amount: 360 });
    expect(body.commission.commission_amount).toBe(360);
  });

  test('net and commission together: the commission given wins', async () => {
    const res = await call({ order_total: 1800, commission_amount: 300 });
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ order_total: 1800, commission_amount: 300 });
  });

  test('commission alone leaves the net untouched, rounds to cents', async () => {
    const res = await call({ commission_amount: '350.555' });
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ commission_amount: 350.56 });
  });

  test('negative amounts and unknown statuses are refused', async () => {
    expect((await call({ order_total: -5 })).status).toBe(400);
    expect((await call({ commission_amount: 'abc' })).status).toBe(400);
    expect((await call({ status: 'paid' })).status).toBe(400);
    expect(updatePayload).toBeNull();
  });

  test('a paid-out line cannot be changed', async () => {
    existingRow.status = 'paid';
    const res = await call({ order_total: 1800 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/paid out/i);
    expect(updatePayload).toBeNull();
  });
});

describe('PATCH /api/commissions/[id] — cancel / restore', () => {
  test('cancelling takes the line out and clears paid_at', async () => {
    const res = await call({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ status: 'cancelled', paid_at: null });
  });

  test('a cancelled line can be restored, and its amounts fixed in the same request', async () => {
    existingRow.status = 'cancelled';
    const res = await call({ status: 'pending', order_total: 1000 });
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ status: 'pending', order_total: 1000, commission_amount: 200 });
  });

  test('amounts on a cancelled line without restoring → 409', async () => {
    existingRow.status = 'cancelled';
    expect((await call({ commission_amount: 10 })).status).toBe(409);
  });

  test('404 when the row does not exist', async () => {
    existingRow = null;
    expect((await call({ status: 'cancelled' })).status).toBe(404);
  });
});

describe('PATCH /api/commissions/[id] — invoice only is unchanged', () => {
  test('does not load the row and writes only the invoice', async () => {
    const res = await call({ invoice_number: ' 260312 ' });
    expect(res.status).toBe(200);
    expect(loadCalls).toBe(0);
    expect(updatePayload).toEqual({ invoice_number: '260312' });
  });

  test('empty body → 400', async () => {
    expect((await call({})).status).toBe(400);
  });
});
