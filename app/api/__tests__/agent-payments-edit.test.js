/**
 * @jest-environment node
 *
 * /api/agent-payments/[id]  PATCH + DELETE — Phase 19b
 *
 * Validates the admin-only edit/delete API for the Payments Ledger:
 *   - Auth gate: 401 when no session, 403 when role !== admin.
 *   - PATCH validation: positive amount, ISO-shaped payment_date, sparse update.
 *   - PATCH success: only the fields actually sent reach the DB layer.
 *   - PATCH 404 when target row doesn't exist (returning row is null).
 *   - DELETE success: issues `.delete().eq('id', ...)` and returns ok.
 *   - DELETE 404 when nothing is removed.
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let updateLastArgs = null;
let updatePayload = null;

let deleteCalled = false;
let deleteEqArgs = null;
let deleteReturnsRow = null;

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table !== 'agent_payments') throw new Error('unexpected table: ' + table);

    return {
      // PATCH chain: .update(payload).eq('id', x).select().maybeSingle()
      update: jest.fn((payload) => {
        updatePayload = payload;
        const chain = {};
        chain.eq = jest.fn((col, val) => {
          updateLastArgs = { col, val };
          return chain;
        });
        chain.select = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: updateReturnsRow,
          error: null,
        });
        return chain;
      }),
      // DELETE chain: .delete().eq('id', x).select().maybeSingle()
      delete: jest.fn(() => {
        deleteCalled = true;
        const chain = {};
        chain.eq = jest.fn((col, val) => {
          deleteEqArgs = { col, val };
          return chain;
        });
        chain.select = jest.fn().mockReturnValue(chain);
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: deleteReturnsRow,
          error: null,
        });
        return chain;
      }),
    };
  }),
};

let updateReturnsRow = null;

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({
        data: currentUser ? { role: currentRole } : null,
        error: null,
      })),
    }),
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { PATCH, DELETE } = require('../agent-payments/[id]/route');

function makeRequest(method, body) {
  return new global.Request(`http://localhost/api/agent-payments/p1`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined,
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  updateLastArgs = null;
  updatePayload = null;
  updateReturnsRow = { id: 'p1', amount: 100, notes: 'updated', payment_date: '2025-05-06' };
  deleteCalled = false;
  deleteEqArgs = null;
  deleteReturnsRow = { id: 'p1' };
  jest.clearAllMocks();
});

describe('PATCH /api/agent-payments/[id]', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await PATCH(makeRequest('PATCH', { amount: 50 }), { params: { id: 'p1' } });
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await PATCH(makeRequest('PATCH', { amount: 50 }), { params: { id: 'p1' } });
    expect(res.status).toBe(403);
  });

  test('400 when amount is not positive', async () => {
    const res = await PATCH(makeRequest('PATCH', { amount: 0 }), { params: { id: 'p1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive/i);
  });

  test('400 when payment_date is not ISO-shaped', async () => {
    const res = await PATCH(makeRequest('PATCH', { payment_date: 'not-a-date' }), {
      params: { id: 'p1' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/payment_date/i);
  });

  test('400 when no editable fields are sent', async () => {
    const res = await PATCH(makeRequest('PATCH', {}), { params: { id: 'p1' } });
    expect(res.status).toBe(400);
  });

  test('sparse update: only sent fields hit the DB and updated row is returned', async () => {
    const res = await PATCH(
      makeRequest('PATCH', { notes: 'corrected comment' }),
      { params: { id: 'p1' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment).toMatchObject({ id: 'p1' });
    // Only `notes` should be in the update payload — not amount, not date.
    expect(updatePayload).toEqual({ notes: 'corrected comment' });
    expect(updateLastArgs).toEqual({ col: 'id', val: 'p1' });
  });

  test('multi-field sparse update: amount + payment_date applied, notes untouched', async () => {
    await PATCH(
      makeRequest('PATCH', { amount: 250.5, payment_date: '2025-06-01' }),
      { params: { id: 'p1' } },
    );
    expect(updatePayload).toEqual({ amount: 250.5, payment_date: '2025-06-01' });
  });

  test('404 when target row does not exist', async () => {
    updateReturnsRow = null;
    const res = await PATCH(
      makeRequest('PATCH', { amount: 50 }),
      { params: { id: 'missing' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/agent-payments/[id]', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await DELETE(makeRequest('DELETE'), { params: { id: 'p1' } });
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await DELETE(makeRequest('DELETE'), { params: { id: 'p1' } });
    expect(res.status).toBe(403);
  });

  test('200 + supabase.delete().eq("id", id) is called on success', async () => {
    const res = await DELETE(makeRequest('DELETE'), { params: { id: 'p1' } });
    expect(res.status).toBe(200);
    expect(deleteCalled).toBe(true);
    expect(deleteEqArgs).toEqual({ col: 'id', val: 'p1' });
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  test('404 when no row was actually removed', async () => {
    deleteReturnsRow = null;
    const res = await DELETE(makeRequest('DELETE'), { params: { id: 'p1' } });
    expect(res.status).toBe(404);
  });
});
