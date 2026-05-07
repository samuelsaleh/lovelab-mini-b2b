/**
 * @jest-environment node
 *
 * /api/commissions/[id]/customer-paid  PATCH — Phase 19b + 19d cascade
 *
 * Validates the admin-only toggle for the "customer paid this order"
 * flag on a commission row, INCLUDING the Phase 19d cascade where
 * ticking an order's customer_paid_at also ticks the linked
 * type='new_client_bonus' row's customer_paid_at.
 *
 * Coverage:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when commission id is malformed (not a UUID)
 *   ✓ 400 when body is invalid JSON
 *   ✓ 400 when `paid` is not a boolean (e.g. "true" string)
 *   ✓ 200 when paid:true → customer_paid_at set to ISO timestamp
 *   ✓ 200 when paid:false → customer_paid_at set to null
 *   ✓ 404 when commission not found
 *   ✓ Cascade: paid:true on type='order' triggers UPDATE on linked bonus
 *   ✓ Cascade: paid:false on type='order' clears the bonus's paid_at too
 *   ✓ No cascade when row type is 'new_client_bonus' (avoids self/loop)
 *   ✓ No cascade when row has no document_id (manual bonus, no link)
 *   ✓ Cascade DB error is logged but does NOT fail the request (200 still)
 *   ✓ Response includes cascaded_bonuses count
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

// First update (the row addressed by `id`)
let primaryUpdatePayload = null;
let primaryUpdateMatchId = null;
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
      // Decide which update we're handling based on whether the primary
      // update has already happened in this request lifecycle.
      const isPrimary = primaryUpdatePayload === null && !cascadeCalled;
      return {
        update: jest.fn((payload) => {
          if (isPrimary) {
            primaryUpdatePayload = payload;
          } else {
            cascadeUpdatePayload = payload;
            cascadeCalled = true;
            cascadeUpdateFilters = {};
          }
          const chain = {};
          chain.eq = jest.fn((col, val) => {
            if (isPrimary) primaryUpdateMatchId = { col, val };
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

const { PATCH } = require('../commissions/[id]/customer-paid/route');

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(body, opts = {}) {
  return new global.Request(`http://localhost/api/commissions/${VALID_ID}/customer-paid`, {
    method: 'PATCH',
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  primaryUpdatePayload = null;
  primaryUpdateMatchId = null;
  primaryReturnsRow = {
    id: VALID_ID,
    customer_paid_at: null,
    status: 'pending',
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

describe('PATCH /api/commissions/[id]/customer-paid', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(403);
  });

  test('400 when id is not a UUID', async () => {
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid commission id/i);
  });

  test('400 when body is not valid JSON', async () => {
    const res = await PATCH(makeRequest(null, { raw: 'not json' }), {
      params: { id: VALID_ID },
    });
    expect(res.status).toBe(400);
  });

  test('400 when `paid` is missing', async () => {
    const res = await PATCH(makeRequest({}), { params: { id: VALID_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/paid must be a boolean/i);
  });

  test('400 when `paid` is a string instead of boolean', async () => {
    const res = await PATCH(makeRequest({ paid: 'true' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(400);
  });

  test('200 when paid:true sets customer_paid_at to an ISO timestamp', async () => {
    primaryReturnsRow = {
      id: VALID_ID,
      customer_paid_at: '2026-05-07T10:00:00.000Z',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'order',
    };
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commission.id).toBe(VALID_ID);
    expect(primaryUpdatePayload.customer_paid_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(primaryUpdateMatchId).toEqual({ col: 'id', val: VALID_ID });
  });

  test('200 when paid:false clears customer_paid_at to null', async () => {
    const res = await PATCH(makeRequest({ paid: false }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(primaryUpdatePayload).toEqual({ customer_paid_at: null });
  });

  test('404 when commission not found', async () => {
    primaryReturnsRow = null;
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(404);
  });

  // ── Cascade tests (Phase 19d) ──────────────────────────────────────

  test('cascade: paid:true on type=order triggers a second UPDATE on linked bonus', async () => {
    cascadeReturnsRows = [{ id: 'bonus-id-1' }];
    primaryReturnsRow = {
      id: VALID_ID,
      customer_paid_at: '2026-05-07T10:00:00.000Z',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'order',
    };
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(true);
    expect(cascadeUpdatePayload.customer_paid_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(cascadeUpdateFilters).toEqual({
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'new_client_bonus',
    });
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(1);
  });

  test('cascade: paid:false on type=order also clears the bonus customer_paid_at', async () => {
    cascadeReturnsRows = [{ id: 'bonus-id-1' }];
    const res = await PATCH(makeRequest({ paid: false }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(true);
    expect(cascadeUpdatePayload).toEqual({ customer_paid_at: null });
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(1);
  });

  test('NO cascade when row type is new_client_bonus (avoid loops onto self)', async () => {
    primaryReturnsRow = {
      id: VALID_ID,
      customer_paid_at: '2026-05-07T10:00:00.000Z',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: 'doc-1',
      type: 'new_client_bonus',
    };
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(false);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
  });

  test('NO cascade when order has no document_id (manual / orphaned)', async () => {
    primaryReturnsRow = {
      id: VALID_ID,
      customer_paid_at: '2026-05-07T10:00:00.000Z',
      status: 'pending',
      agent_id: 'agent-1',
      document_id: null,
      type: 'order',
    };
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(false);
  });

  test('cascade DB error does NOT fail the primary request (200 with cascaded_bonuses=0)', async () => {
    cascadeReturnsError = { message: 'simulated cascade failure' };
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(cascadeCalled).toBe(true);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
    expect(body.commission.id).toBe(VALID_ID);
  });

  test('cascade returns 0 when no bonus row exists for that order', async () => {
    cascadeReturnsRows = []; // no bonus to cascade onto
    const res = await PATCH(makeRequest({ paid: true }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cascaded_bonuses).toBe(0);
  });
});
