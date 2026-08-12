/**
 * @jest-environment node
 *
 * /api/commissions/customer-paid-bulk  PATCH
 *
 * One request marks many commissions customer-paid. Mirrors the single-row
 * cascade onto linked new_client_bonus rows, grouped per agent so one agent's
 * documents can never flip another agent's bonuses.
 *
 * Coverage:
 *   ✓ 401 / 403 auth gates
 *   ✓ 429 when rate limited
 *   ✓ 400 on invalid JSON, non-boolean paid, missing/empty/oversized ids,
 *     non-UUID ids
 *   ✓ duplicate ids are collapsed
 *   ✓ paid:true stamps an ISO timestamp on every id; paid:false clears them
 *   ✓ cascade issues one UPDATE per agent with that agent's document ids
 *   ✓ no cascade for bonus rows, or for orders without a document_id
 *   ✓ a cascade failure still returns 200
 *   ✓ ids that matched nothing come back in not_found
 *   ✓ 500 when the primary update fails
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';
let rateLimitResponse = null;

// Primary update
let primaryPayload = null;
let primaryInFilter = null;
let primaryReturnRows = [];
let primaryError = null;

// Cascade updates (one per agent)
let cascadeCalls = [];
let cascadeReturnRows = [];
let cascadeError = null;

let commissionUpdateCount = 0;

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
      return {
        update: jest.fn((payload) => {
          commissionUpdateCount += 1;
          const isPrimary = commissionUpdateCount === 1;
          const call = { payload, filters: {} };
          if (isPrimary) primaryPayload = payload;
          else cascadeCalls.push(call);

          const chain = {};
          chain.eq = jest.fn((col, val) => {
            call.filters[col] = val;
            return chain;
          });
          chain.in = jest.fn((col, val) => {
            if (isPrimary) primaryInFilter = { col, val };
            else call.filters[col] = val;
            return chain;
          });
          chain.select = jest.fn(() => chain);
          chain.then = (resolve) =>
            resolve(
              isPrimary
                ? { data: primaryReturnRows, error: primaryError }
                : { data: cascadeReturnRows, error: cascadeError },
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

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => rateLimitResponse),
}));

const { PATCH, MAX_BULK_IDS } = require('../commissions/customer-paid-bulk/route');

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const ID_C = '33333333-3333-3333-3333-333333333333';

function makeRequest(body, opts = {}) {
  return new global.Request('http://localhost/api/commissions/customer-paid-bulk', {
    method: 'PATCH',
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const orderRow = (id, docId, agentId = 'agent-1') => ({
  id,
  customer_paid_at: null,
  status: 'pending',
  agent_id: agentId,
  document_id: docId,
  type: 'order',
});

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  rateLimitResponse = null;
  primaryPayload = null;
  primaryInFilter = null;
  primaryReturnRows = [orderRow(ID_A, 'doc-1'), orderRow(ID_B, 'doc-2')];
  primaryError = null;
  cascadeCalls = [];
  cascadeReturnRows = [];
  cascadeError = null;
  commissionUpdateCount = 0;
  jest.clearAllMocks();
});

describe('PATCH /api/commissions/customer-paid-bulk — access + validation', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    expect(res.status).toBe(403);
  });

  test('429 when rate limited', async () => {
    const { NextResponse } = require('next/server');
    rateLimitResponse = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const res = await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    expect(res.status).toBe(429);
  });

  test('400 when body is not valid JSON', async () => {
    const res = await PATCH(makeRequest(null, { raw: 'nope' }));
    expect(res.status).toBe(400);
  });

  test('400 when paid is not a boolean', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A], paid: 'true' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/paid must be a boolean/i);
  });

  test('400 when ids is missing', async () => {
    const res = await PATCH(makeRequest({ paid: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/non-empty array/i);
  });

  test('400 when ids is empty', async () => {
    const res = await PATCH(makeRequest({ ids: [], paid: true }));
    expect(res.status).toBe(400);
  });

  test('400 when ids is not an array', async () => {
    const res = await PATCH(makeRequest({ ids: ID_A, paid: true }));
    expect(res.status).toBe(400);
  });

  test(`400 when more than ${MAX_BULK_IDS} ids are sent`, async () => {
    const many = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) =>
      `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`);
    const res = await PATCH(makeRequest({ ids: many, paid: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too many ids/i);
  });

  test('400 when any id is not a UUID', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A, 'not-a-uuid'], paid: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid uuids/i);
  });

  test('400 when an id is not a string', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A, 42], paid: true }));
    expect(res.status).toBe(400);
  });

  test('duplicate ids are collapsed before hitting the database', async () => {
    primaryReturnRows = [orderRow(ID_A, 'doc-1')];
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_A, ID_A], paid: true }));
    expect(res.status).toBe(200);
    expect(primaryInFilter.val).toEqual([ID_A]);
  });
});

describe('PATCH /api/commissions/customer-paid-bulk — updates', () => {
  test('paid:true stamps an ISO timestamp on every id in one update', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B], paid: true }));
    expect(res.status).toBe(200);
    expect(primaryPayload.customer_paid_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(primaryInFilter).toEqual({ col: 'id', val: [ID_A, ID_B] });
    const body = await res.json();
    expect(body.updated_count).toBe(2);
  });

  test('paid:false clears customer_paid_at', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B], paid: false }));
    expect(res.status).toBe(200);
    expect(primaryPayload).toEqual({ customer_paid_at: null });
  });

  test('ids that matched no row come back in not_found', async () => {
    primaryReturnRows = [orderRow(ID_A, 'doc-1')];
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_C], paid: true }));
    const body = await res.json();
    expect(body.updated_count).toBe(1);
    expect(body.not_found).toEqual([ID_C]);
  });

  test('500 when the primary update fails', async () => {
    primaryError = { message: 'boom' };
    const res = await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/commissions/customer-paid-bulk — bonus cascade', () => {
  test('one cascade update per agent, scoped to that agent\'s documents', async () => {
    primaryReturnRows = [
      orderRow(ID_A, 'doc-1', 'agent-1'),
      orderRow(ID_B, 'doc-2', 'agent-1'),
      orderRow(ID_C, 'doc-3', 'agent-2'),
    ];
    cascadeReturnRows = [{ id: 'bonus-x' }];
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B, ID_C], paid: true }));
    expect(res.status).toBe(200);
    expect(cascadeCalls).toHaveLength(2);
    expect(cascadeCalls[0].filters).toEqual({
      agent_id: 'agent-1',
      document_id: ['doc-1', 'doc-2'],
      type: 'new_client_bonus',
    });
    expect(cascadeCalls[1].filters).toEqual({
      agent_id: 'agent-2',
      document_id: ['doc-3'],
      type: 'new_client_bonus',
    });
  });

  test('cascade writes the same timestamp as the primary update', async () => {
    cascadeReturnRows = [{ id: 'bonus-x' }];
    await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    expect(cascadeCalls[0].payload).toEqual(primaryPayload);
  });

  test('paid:false cascade clears the bonus too', async () => {
    cascadeReturnRows = [{ id: 'bonus-x' }];
    await PATCH(makeRequest({ ids: [ID_A], paid: false }));
    expect(cascadeCalls[0].payload).toEqual({ customer_paid_at: null });
  });

  test('response lists the cascaded bonus ids', async () => {
    primaryReturnRows = [orderRow(ID_A, 'doc-1')];
    cascadeReturnRows = [{ id: 'bonus-1' }, { id: 'bonus-2' }];
    const res = await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    const body = await res.json();
    expect(body.cascaded_bonus_ids).toEqual(['bonus-1', 'bonus-2']);
    expect(body.cascaded_bonuses).toBe(2);
  });

  test('no cascade when the updated rows are bonuses themselves', async () => {
    primaryReturnRows = [
      { ...orderRow(ID_A, 'doc-1'), type: 'new_client_bonus' },
    ];
    const res = await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    expect(res.status).toBe(200);
    expect(cascadeCalls).toHaveLength(0);
    expect((await res.json()).cascaded_bonuses).toBe(0);
  });

  test('no cascade for an order without a document_id', async () => {
    primaryReturnRows = [orderRow(ID_A, null)];
    await PATCH(makeRequest({ ids: [ID_A], paid: true }));
    expect(cascadeCalls).toHaveLength(0);
  });

  test('a cascade DB error does not fail the request', async () => {
    cascadeError = { message: 'cascade blew up' };
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B], paid: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated_count).toBe(2);
    expect(body.cascaded_bonuses).toBe(0);
  });
});
