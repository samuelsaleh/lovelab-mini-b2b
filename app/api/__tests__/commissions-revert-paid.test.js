/**
 * @jest-environment node
 *
 * /api/commissions/[id]/revert-paid  PATCH
 *
 * Admin-only "undo a payout": reverts a PAID commission back to 'pending'
 * (clearing paid_at, keeping customer_paid_at) so it returns to "Ready to pay"
 * and re-enters the next payout. Includes the cascade onto the linked
 * type='new_client_bonus' row.
 *
 * Coverage:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when commission id is malformed (not a UUID)
 *   ✓ 200 reverts status→pending, paid_at→null, scoped to status='paid'
 *   ✓ customer_paid_at is preserved (not touched) in the update payload
 *   ✓ 404 when no paid row matches (not found / not paid)
 *   ✓ Cascade: order with document_id reverts the linked bonus too
 *   ✓ No cascade when row type is 'new_client_bonus'
 *   ✓ No cascade when row has no document_id
 *   ✓ Cascade DB error is logged but does NOT fail the request (200 still)
 *   ✓ Response includes cascaded_bonuses count
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

// First update (the row addressed by `id`)
let primaryUpdatePayload = null;
let primaryUpdateFilters = null;
let primaryReturnsRow = null;

// Second update (the cascade onto the linked bonus row)
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
          Promise.resolve({
            data: currentUser ? { role: currentRole } : null,
            error: null,
          }),
        ),
      };
    }
    if (table === 'agent_commissions') {
      const isPrimary = primaryUpdatePayload === null && !cascadeCalled;
      return {
        update: jest.fn((payload) => {
          if (isPrimary) {
            primaryUpdatePayload = payload;
            primaryUpdateFilters = {};
          } else {
            cascadeUpdatePayload = payload;
            cascadeCalled = true;
            cascadeUpdateFilters = {};
          }
          const chain = {};
          chain.eq = jest.fn((col, val) => {
            if (isPrimary) primaryUpdateFilters[col] = val;
            else cascadeUpdateFilters[col] = val;
            return chain;
          });
          chain.select = jest.fn().mockReturnValue(chain);
          chain.maybeSingle = jest.fn(() =>
            Promise.resolve({ data: primaryReturnsRow, error: null }),
          );
          // The cascade call uses .select('id') and awaits the chain directly
          // (no .maybeSingle), so the chain itself is a thenable.
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

const { PATCH } = require('../commissions/[id]/revert-paid/route');

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest() {
  return new global.Request(`http://localhost/api/commissions/${VALID_ID}/revert-paid`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  primaryUpdatePayload = null;
  primaryUpdateFilters = null;
  primaryReturnsRow = {
    id: VALID_ID,
    status: 'pending',
    paid_at: null,
    customer_paid_at: '2026-04-01T10:00:00.000Z',
    agent_id: 'agent-1',
    document_id: 'doc-1',
    type: 'order',
  };
  cascadeUpdatePayload = null;
  cascadeUpdateFilters = null;
  cascadeReturnsRows = [];
  cascadeReturnsError = null;
  cascadeCalled = false;
  jest.clearAllMocks();
});

describe('PATCH /api/commissions/[id]/revert-paid', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(403);
  });

  test('400 when id is not a UUID', async () => {
    const res = await PATCH(makeRequest(), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid commission id/i);
  });

  test('200 reverts status→pending and paid_at→null, scoped to status=paid', async () => {
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commission.id).toBe(VALID_ID);
    expect(primaryUpdatePayload).toEqual({ status: 'pending', paid_at: null });
    // Only flips rows currently paid, addressed by id.
    expect(primaryUpdateFilters).toEqual({ id: VALID_ID, status: 'paid' });
  });

  test('does NOT touch customer_paid_at (preserved → Ready to pay)', async () => {
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(primaryUpdatePayload).not.toHaveProperty('customer_paid_at');
    const body = await res.json();
    expect(body.commission.customer_paid_at).toBe('2026-04-01T10:00:00.000Z');
  });

  test('404 when no paid row matches', async () => {
    primaryReturnsRow = null;
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found or not paid/i);
  });

  // ── Cascade tests ──────────────────────────────────────────────────

  test('cascade: order with document_id reverts the linked bonus too', async () => {
    cascadeReturnsRows = [{ id: 'bonus-id-1' }];
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(true);
    expect(cascadeUpdatePayload).toEqual({ status: 'pending', paid_at: null });
    expect(cascadeUpdateFilters).toEqual({
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'new_client_bonus',
      status: 'paid',
    });
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(1);
  });

  test('NO cascade when row type is new_client_bonus', async () => {
    primaryReturnsRow = {
      id: VALID_ID,
      status: 'pending',
      paid_at: null,
      customer_paid_at: '2026-04-01T10:00:00.000Z',
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'new_client_bonus',
    };
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(false);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
  });

  test('NO cascade when order has no document_id', async () => {
    primaryReturnsRow = {
      id: VALID_ID,
      status: 'pending',
      paid_at: null,
      customer_paid_at: '2026-04-01T10:00:00.000Z',
      agent_id: 'agent-1',
      document_id: null,
      type: 'order',
    };
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(false);
  });

  test('cascade DB error does NOT fail the request (200, cascaded_bonuses=0)', async () => {
    cascadeReturnsError = { message: 'simulated cascade failure' };
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(true);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
    expect(body.commission.id).toBe(VALID_ID);
  });

  test('cascade returns 0 when no bonus row exists for that order', async () => {
    cascadeReturnsRows = [];
    const res = await PATCH(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
  });
});
