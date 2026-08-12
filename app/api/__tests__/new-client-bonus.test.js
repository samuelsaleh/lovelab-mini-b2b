/**
 * @jest-environment node
 *
 * /api/agents/[id]/new-client-bonus  PATCH        — Phase 19
 * /api/agents/[id]/new-client-bonus/preview  GET  — Phase 19
 *
 * Validates the admin-only API for the new-client-bonus toggle:
 *   - Auth gate: 401 when no session, 403 when role !== admin.
 *   - PATCH validation: cannot enable without a positive amount.
 *   - PATCH success: settings persisted; backfill invoked when enabling
 *     with positive amount; backfill SKIPPED when runBackfill: false.
 *   - PATCH disable: existing bonus rows untouched (we just verify the
 *     update payload + that no backfill runs).
 *   - GET preview: returns rows from the lib helper unchanged.
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';
let agentTargetRow = {
  id: 'agent-1',
  is_agent: true,
  agent_deleted_at: null,
  full_name: 'Nicolas',
  email: 'nicolas@love-lab.com',
};

let updatePayload = null;
let updateAgentId = null;

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      const chain = {};
      const ret = () => chain;
      chain.select = jest.fn(ret);
      chain.eq = jest.fn(ret);
      chain.maybeSingle = jest.fn().mockImplementation(() =>
        Promise.resolve({ data: agentTargetRow, error: null }),
      );
      chain.single = jest.fn().mockImplementation(() =>
        Promise.resolve({
          data: currentUser ? { role: currentRole } : null,
          error: null,
        }),
      );
      chain.update = jest.fn((payload) => {
        updatePayload = payload;
        return {
          eq: jest.fn((col, val) => {
            updateAgentId = val;
            return Promise.resolve({ data: null, error: null });
          }),
        };
      });
      return chain;
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(() =>
        Promise.resolve({
          data: currentUser ? { role: currentRole } : null,
          error: null,
        }),
      ),
    }),
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

let backfillCalls = [];
let backfillResponse = { created: 0, total: 0, rows: [] };
let backfillThrows = null;
let previewResponse = { rows: [], customer_count: 0, total: 0 };

jest.mock('@/lib/newClientBonus', () => ({
  __esModule: true,
  // Real value — the route validates the incoming mode against it.
  BONUS_MODES: ['off', 'manual', 'auto'],
  executeBackfill: jest.fn((_admin, agentId, amount) => {
    backfillCalls.push({ agentId, amount });
    if (backfillThrows) return Promise.reject(backfillThrows);
    return Promise.resolve(backfillResponse);
  }),
  previewBackfill: jest.fn((_admin, _agentId, _amount) =>
    Promise.resolve(previewResponse),
  ),
}));

jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: jest.fn(() => Promise.resolve()),
}));

const { PATCH } = require('../agents/[id]/new-client-bonus/route');
const { GET } = require('../agents/[id]/new-client-bonus/preview/route');

function makeRequest(url, method, body) {
  return new global.Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  agentTargetRow = {
    id: 'agent-1',
    is_agent: true,
    agent_deleted_at: null,
    full_name: 'Nicolas',
    email: 'nicolas@love-lab.com',
  };
  updatePayload = null;
  updateAgentId = null;
  backfillCalls = [];
  backfillResponse = { created: 0, total: 0, rows: [] };
  backfillThrows = null;
  previewResponse = { rows: [], customer_count: 0, total: 0 };
  jest.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────
// PATCH — auth + validation
// ────────────────────────────────────────────────────────────────────────

describe('PATCH /api/agents/[id]/new-client-bonus — auth & validation', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: true,
        amount: 200,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: true,
        amount: 200,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(403);
  });

  test('400 when enabled=true but amount missing', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: true,
        amount: null,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive amount/i);
  });

  test('400 when amount is negative', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: false,
        amount: -10,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(400);
  });

  test('404 when target agent is soft-deleted', async () => {
    agentTargetRow = { ...agentTargetRow, agent_deleted_at: '2026-01-01' };
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: true,
        amount: 200,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────────────────
// PATCH — success paths
// ────────────────────────────────────────────────────────────────────────

describe('PATCH /api/agents/[id]/new-client-bonus — success', () => {
  test('enabling with amount 200 persists settings AND runs backfill', async () => {
    backfillResponse = { created: 5, total: 1000, rows: [] };
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: true,
        amount: 200,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent).toMatchObject({
      id: 'agent-1',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(body.backfill).toEqual({ created: 5, total: 1000, rows: [] });
    // Legacy `enabled: true` still means the automatic mode.
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'auto',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(updateAgentId).toBe('agent-1');
    expect(backfillCalls).toEqual([{ agentId: 'agent-1', amount: 200 }]);
  });

  test('enabling with runBackfill:false persists settings but SKIPS backfill', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: true,
        amount: 200,
        runBackfill: false,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'auto',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(backfillCalls).toEqual([]);
  });

  test('disabling skips backfill and persists enabled=false', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: false,
        amount: 200, // amount still saved for next time
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'off',
      new_client_bonus_enabled: false,
      new_client_bonus_amount: 200,
    });
    expect(backfillCalls).toEqual([]);
  });

  test('backfill failure surfaces as 500 with helpful message', async () => {
    backfillThrows = new Error('rls_denied');
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: true,
        amount: 200,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/backfill failed/i);
    // Settings still persisted before backfill ran.
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'auto',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
  });

  test('amount: null is accepted when disabling (no amount required)', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        enabled: false,
        amount: null,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'off',
      new_client_bonus_enabled: false,
      new_client_bonus_amount: null,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────
// PATCH — three modes
//
// 'manual' is the mode that matters most here: it must save like an
// enabled agent (so the button shows up and the amount is kept) while
// creating absolutely nothing, neither on save nor retroactively.
// ────────────────────────────────────────────────────────────────────────

describe('PATCH /api/agents/[id]/new-client-bonus — modes', () => {
  const patchMode = (mode, extra = {}) =>
    PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        mode,
        amount: 200,
        ...extra,
      }),
      { params: { id: 'agent-1' } },
    );

  test('manual saves the mode, keeps the agent enabled, and never backfills', async () => {
    backfillResponse = { created: 9, total: 1800, rows: [] };
    const res = await patchMode('manual');
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'manual',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(backfillCalls).toEqual([]);
    const body = await res.json();
    expect(body.backfill).toEqual({ created: 0, total: 0, rows: [] });
    expect(body.agent.new_client_bonus_mode).toBe('manual');
  });

  test('auto saves the mode and still backfills', async () => {
    backfillResponse = { created: 3, total: 600, rows: [] };
    const res = await patchMode('auto');
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'auto',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(backfillCalls).toEqual([{ agentId: 'agent-1', amount: 200 }]);
  });

  test('off saves the mode, disables, and never backfills', async () => {
    const res = await patchMode('off');
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({
      new_client_bonus_mode: 'off',
      new_client_bonus_enabled: false,
      new_client_bonus_amount: 200,
    });
    expect(backfillCalls).toEqual([]);
  });

  test('manual still requires a positive amount', async () => {
    const res = await PATCH(
      makeRequest('http://localhost/api/agents/agent-1/new-client-bonus', 'PATCH', {
        mode: 'manual',
        amount: 0,
      }),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive amount/i);
  });

  test('an unknown mode is rejected', async () => {
    const res = await patchMode('sometimes');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/mode must be one of/i);
    expect(updatePayload).toBe(null);
  });

  test('mode wins over a contradicting legacy enabled flag', async () => {
    const res = await patchMode('manual', { enabled: false });
    expect(res.status).toBe(200);
    expect(updatePayload.new_client_bonus_mode).toBe('manual');
    expect(updatePayload.new_client_bonus_enabled).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// GET preview
// ────────────────────────────────────────────────────────────────────────

describe('GET /api/agents/[id]/new-client-bonus/preview', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await GET(
      makeRequest(
        'http://localhost/api/agents/agent-1/new-client-bonus/preview?amount=200',
        'GET',
      ),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await GET(
      makeRequest(
        'http://localhost/api/agents/agent-1/new-client-bonus/preview?amount=200',
        'GET',
      ),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(403);
  });

  test('400 when amount missing or not numeric', async () => {
    const res = await GET(
      makeRequest(
        'http://localhost/api/agents/agent-1/new-client-bonus/preview?amount=abc',
        'GET',
      ),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(400);
  });

  test('200 returns the preview shape from lib helper', async () => {
    previewResponse = {
      rows: [
        { customer: 'Blush', customer_key: 'blush', first_order_date: '2026-03-01', document_id: 'd1', amount: 200 },
        { customer: 'Casadona', customer_key: 'casadona', first_order_date: '2026-03-15', document_id: 'd2', amount: 200 },
      ],
      customer_count: 2,
      total: 400,
    };
    const res = await GET(
      makeRequest(
        'http://localhost/api/agents/agent-1/new-client-bonus/preview?amount=200',
        'GET',
      ),
      { params: { id: 'agent-1' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(previewResponse);
  });
});
