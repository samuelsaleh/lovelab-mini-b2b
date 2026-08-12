/**
 * @jest-environment node
 *
 * POST /api/commissions/new-client-bonus
 *
 * The manual counterpart to the automatic bonus hook. Since the bonus
 * is real money, this route must be admin-only, must never take the
 * amount from the caller, and must pass every refusal from the lib
 * back as a message the admin can act on.
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';
let agentRow = {
  id: '11111111-1111-4111-8111-111111111111',
  is_agent: true,
  agent_deleted_at: null,
  new_client_bonus_mode: 'manual',
  new_client_bonus_enabled: true,
  new_client_bonus_amount: 200,
};
let agentLookupError = null;

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table !== 'profiles') throw new Error('unexpected table: ' + table);
    const chain = {};
    const ret = () => chain;
    chain.select = jest.fn(ret);
    chain.eq = jest.fn(ret);
    chain.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: agentLookupError ? null : agentRow, error: agentLookupError }),
    );
    chain.single = jest.fn(() =>
      Promise.resolve({ data: currentUser ? { role: currentRole } : null, error: null }),
    );
    return chain;
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

let rateLimitResponse = null;
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => rateLimitResponse) }));

let manualCalls = [];
let manualResult = { created: true, amount: 200 };
let manualThrows = null;

jest.mock('@/lib/newClientBonus', () => ({
  __esModule: true,
  createManualBonusForOrder: jest.fn((_admin, args) => {
    manualCalls.push(args);
    if (manualThrows) return Promise.reject(manualThrows);
    return Promise.resolve(manualResult);
  }),
}));

const { POST } = require('../commissions/new-client-bonus/route');

function makeRequest(body) {
  return {
    url: 'http://localhost/api/commissions/new-client-bonus',
    method: 'POST',
    headers: new Map(),
    json: async () => {
      if (body === '__invalid__') throw new Error('bad json');
      return body;
    },
  };
}

const post = (body) => POST(makeRequest(body));
const validBody = { agent_id: AGENT_ID, document_id: DOCUMENT_ID };

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  agentLookupError = null;
  agentRow = {
    id: AGENT_ID,
    is_agent: true,
    agent_deleted_at: null,
    new_client_bonus_mode: 'manual',
    new_client_bonus_enabled: true,
    new_client_bonus_amount: 200,
  };
  rateLimitResponse = null;
  manualCalls = [];
  manualResult = { created: true, amount: 200 };
  manualThrows = null;
});

describe('access control', () => {
  test('401 without a session', async () => {
    currentUser = null;
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(manualCalls).toEqual([]);
  });

  test('403 for a non-admin, even the agent themselves', async () => {
    currentRole = 'member';
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect(manualCalls).toEqual([]);
  });

  test('the rate limiter short-circuits the route', async () => {
    rateLimitResponse = { status: 429 };
    const res = await post(validBody);
    expect(res).toBe(rateLimitResponse);
    expect(manualCalls).toEqual([]);
  });
});

describe('input validation', () => {
  test('rejects invalid JSON', async () => {
    const res = await post('__invalid__');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid json/i);
  });

  test('rejects a missing or malformed agent_id', async () => {
    for (const agent_id of [undefined, null, '', 'not-a-uuid', 123]) {
      const res = await post({ agent_id, document_id: DOCUMENT_ID });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/agent_id/i);
    }
    expect(manualCalls).toEqual([]);
  });

  test('rejects a missing or malformed document_id', async () => {
    for (const document_id of [undefined, null, '', 'nope', {}]) {
      const res = await post({ agent_id: AGENT_ID, document_id });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/document_id/i);
    }
    expect(manualCalls).toEqual([]);
  });

  test('404 for an unknown, non-agent or deleted agent', async () => {
    for (const row of [
      null,
      { id: AGENT_ID, is_agent: false },
      { id: AGENT_ID, is_agent: true, agent_deleted_at: '2026-01-01T00:00:00Z' },
    ]) {
      agentRow = row;
      const res = await post(validBody);
      expect(res.status).toBe(404);
    }
    expect(manualCalls).toEqual([]);
  });

  test('500 when the agent lookup itself fails', async () => {
    agentLookupError = { message: 'connection reset' };
    const res = await post(validBody);
    expect(res.status).toBe(500);
  });
});

describe('creating the bonus', () => {
  test('creates it and reports the amount', async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: true, amount: 200 });
  });

  test('passes the agent profile through so the lib can read mode and amount', async () => {
    await post(validBody);
    expect(manualCalls).toHaveLength(1);
    expect(manualCalls[0]).toMatchObject({
      agentId: AGENT_ID,
      documentId: DOCUMENT_ID,
    });
    expect(manualCalls[0].profile).toMatchObject({
      new_client_bonus_mode: 'manual',
      new_client_bonus_amount: 200,
    });
  });

  test('an amount in the body is ignored — it always comes from the agent', async () => {
    await post({ ...validBody, amount: 99999, commission_amount: 99999 });
    expect(manualCalls[0].profile.new_client_bonus_amount).toBe(200);
    expect(manualCalls[0]).not.toHaveProperty('amount');
  });

  test('works for an auto-mode agent too', async () => {
    agentRow = { ...agentRow, new_client_bonus_mode: 'auto' };
    const res = await post(validBody);
    expect(res.status).toBe(200);
  });
});

describe('refusals become readable 409s', () => {
  const cases = [
    ['already_exists', /already has a new-client bonus/i],
    ['not_first_order', /not the first order/i],
    ['feature_disabled', /switched off/i],
    ['no_amount', /bonus amount/i],
    ['no_order_commission', /no commission/i],
    ['document_deleted', /deleted/i],
    ['document_not_found', /no longer exists/i],
    ['no_customer_key', /company or client name/i],
    ['missing_inputs', /missing/i],
  ];

  test.each(cases)('%s is explained to the admin', async (reason, matcher) => {
    manualResult = { skipped: true, reason };
    const res = await post(validBody);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe(reason);
    expect(body.error).toMatch(matcher);
  });

  test('an unrecognised reason still gets a generic message', async () => {
    manualResult = { skipped: true, reason: 'something_new' };
    const res = await post(validBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/could not add the bonus/i);
  });

  test('a thrown error becomes a 500, not a silent success', async () => {
    manualThrows = new Error('unique violation');
    const res = await post(validBody);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/unique violation/i);
  });
});
