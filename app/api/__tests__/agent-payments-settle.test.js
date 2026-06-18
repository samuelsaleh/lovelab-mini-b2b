/**
 * @jest-environment node
 *
 * /api/agent-payments  POST — Phase 29 (report-driven settlement)
 *
 * Covers:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when report_id is not a UUID
 *   ✓ 400 when amount is invalid before settlement runs
 *   ✓ 400 when the report belongs to a different agent
 *   ✓ 404 when the report does not exist
 *   ✓ plain payment (no report_id) records a payout, settles nothing
 *   ✓ report payment settles the report's commissions (status=paid + invoice)
 *     and links the payout row to the report + invoice
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let agentRow = null;
let reportRow = null;
let acQueue = [];
let acChains = [];
let insertedPaymentPayload = null;

const AGENT = '11111111-1111-1111-1111-111111111111';
const REPORT = '22222222-2222-2222-2222-222222222222';

function makeACChain(result) {
  const chain = {};
  for (const m of ['select', 'eq', 'in', 'update', 'neq', 'order']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.then = (resolve) => resolve(result);
  acChains.push(chain);
  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: agentRow, error: null })),
      };
    }
    if (table === 'commission_reports') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(() => Promise.resolve({ data: reportRow, error: null })),
      };
    }
    if (table === 'agent_commissions') {
      const result = acQueue.length ? acQueue.shift() : { data: [], error: null };
      return makeACChain(result);
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
  reportRow = { id: REPORT, agent_id: AGENT, snapshot_data: {} };
  acQueue = [];
  acChains = [];
  insertedPaymentPayload = null;
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

  test('400 when amount is invalid before settlement runs', async () => {
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 'not-a-number', report_id: REPORT }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive number/i);
    expect(acChains.length).toBe(0);
    expect(insertedPaymentPayload).toBeNull();
  });

  test('plain payment (no report) records the payout and settles nothing', async () => {
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, invoice_number: 'INV-7' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settled).toBeNull();
    expect(insertedPaymentPayload.report_id).toBeNull();
    expect(insertedPaymentPayload.invoice_number).toBe('INV-7');
    // No commission rows touched.
    expect(acChains.length).toBe(0);
  });

  test('404 when the report does not exist', async () => {
    reportRow = null;
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, report_id: REPORT }));
    expect(res.status).toBe(404);
  });

  test('400 when the report belongs to a different agent', async () => {
    reportRow = { id: REPORT, agent_id: 'someone-else', snapshot_data: {} };
    const res = await POST(makeRequest({ agent_id: AGENT, amount: 100, report_id: REPORT }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not belong/i);
  });

  test('report payment settles commissions + stamps invoice + links the payout', async () => {
    acQueue = [
      { data: [{ id: 'c1' }, { id: 'c2' }], error: null }, // resolution by report_id
      { data: [{ id: 'c1' }, { id: 'c2' }], error: null }, // settle update
    ];
    const res = await POST(makeRequest({
      agent_id: AGENT,
      amount: 1500,
      report_id: REPORT,
      invoice_number: 'INV-42',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settled).toEqual({ marked: 2, ids: ['c1', 'c2'] });

    // The commission settle update set status=paid + the invoice.
    const settleChain = acChains.find((c) => c.update.mock.calls.length > 0);
    const payload = settleChain.update.mock.calls[0][0];
    expect(payload.status).toBe('paid');
    expect(payload.invoice_number).toBe('INV-42');

    // The payout row links back to the report + invoice.
    expect(insertedPaymentPayload.report_id).toBe(REPORT);
    expect(insertedPaymentPayload.invoice_number).toBe('INV-42');
    expect(insertedPaymentPayload.amount).toBe(1500);
  });
});
