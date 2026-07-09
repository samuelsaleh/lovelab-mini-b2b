/**
 * @jest-environment node
 *
 * /api/agent-payments  POST — Phase 29 (report-driven settlement)
 *
 * Covers:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when report_id is not a UUID
 *   ✓ 400 when the report belongs to a different agent
 *   ✓ 404 when the report does not exist
 *   ✓ 409 when the report already has a payment
 *   ✓ plain payment (no report_id) records a payout, settles nothing
 *   ✓ report payment is delegated to the atomic DB RPC
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let agentRow = null;
let insertedPaymentPayload = null;
let rpcResult = null;
let rpcError = null;
let rpcCall = null;

const AGENT = '11111111-1111-1111-1111-111111111111';
const REPORT = '22222222-2222-2222-2222-222222222222';

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: agentRow, error: null })),
      };
    }
    if (table === 'agent_payments') {
      return {
        insert: jest.fn((payload) => {
          insertedPaymentPayload = payload;
          const chain = {};
          chain.select = jest.fn().mockReturnValue(chain);
          chain.single = jest.fn(() => Promise.resolve({ data: { id: 'pay-1', ...payload }, error: null }));
          return chain;
        }),
      };
    }
    throw new Error('unexpected table: ' + table);
  }),
  rpc: jest.fn((fn, payload) => {
    rpcCall = { fn, payload };
    return Promise.resolve({ data: rpcResult, error: rpcError });
  }),
};

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

const { POST } = require('../agent-payments/route');

function makeRequest(body) {
  return new global.Request('http://localhost/api/agent-payments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  agentRow = { id: AGENT, is_agent: true, agent_deleted_at: null };
  insertedPaymentPayload = null;
  rpcResult = {
    payment: {
      id: 'pay-1',
      agent_id: AGENT,
      amount: 1500,
      report_id: REPORT,
      invoice_number: 'INV-42',
    },
    settled: { marked: 2, ids: ['c1', 'c2'] },
  };
  rpcError = null;
  rpcCall = null;
  jest.clearAllMocks();
});

describe('POST /api/agent-payments', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100 }));
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100 }));
    expect(res.status).toBe(403);
  });

  test('400 when report_id is not a UUID', async () => {
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, report_id: 'nope' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/report_id must be a UUID/i);
  });

  test('plain payment (no report) records the payout and settles nothing', async () => {
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, invoice_number: 'INV-7' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settled).toBeNull();
    expect(insertedPaymentPayload.report_id).toBeNull();
    expect(insertedPaymentPayload.invoice_number).toBe('INV-7');
    expect(mockAdminSupabase.rpc).not.toHaveBeenCalled();
  });

  test('404 when the report does not exist', async () => {
    rpcError = { code: 'P0002', message: 'Commission report not found' };
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, report_id: REPORT }));
    expect(res.status).toBe(404);
  });

  test('400 when the report belongs to a different agent', async () => {
    rpcError = { message: 'Report does not belong to this agent' };
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, report_id: REPORT }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not belong/i);
  });

  test('409 when the report already has a payment', async () => {
    rpcError = { code: '23505', message: 'Commission report already has a recorded payment' };
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, report_id: REPORT }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already has/i);
    expect(insertedPaymentPayload).toBeNull();
  });

  test('report payment delegates to the atomic RPC', async () => {
    const res = await POST(makeRequest({
      agent_id: AGENT,
      amount: 1500,
      report_id: REPORT,
      invoice_number: 'INV-42',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settled).toEqual({ marked: 2, ids: ['c1', 'c2'] });
    expect(body.payment).toMatchObject({
      report_id: REPORT,
      invoice_number: 'INV-42',
      amount: 1500,
    });

    expect(rpcCall).toEqual({
      fn: 'record_agent_report_payment',
      payload: {
        p_agent_id: AGENT,
        p_amount: 1500,
        p_notes: null,
        p_payment_date: expect.any(String),
        p_report_id: REPORT,
        p_invoice_number: 'INV-42',
        p_created_by: 'admin-user',
      },
    });
    // Report-linked payments must not fall back to the old split-write path.
    expect(insertedPaymentPayload).toBeNull();
  });
});
