/**
 * @jest-environment node
 *
 * /api/commissions GET — Phase 18 summary regression test.
 *
 * Same root cause as the /api/agents bug: the summary aggregator was summing
 * commission_amount, from_orders, order_count, etc. across every row including
 * status='cancelled'. Cancelled rows are kept for the audit trail but must
 * never inflate "total earned" or "X orders" the agent sees on their dashboard.
 */

let detailRows = [];
let summaryRows = [];

function buildAgentCommissionsMock() {
  // The route makes two queries: detail (paginated) and summary (no limit).
  // We discriminate by whether range() is called (detail) vs not (summary).
  const buildChain = (resolveTo) => {
    const c = {};
    c.select = jest.fn().mockReturnValue(c);
    c.eq = jest.fn().mockReturnValue(c);
    c.in = jest.fn().mockReturnValue(c);
    c.order = jest.fn().mockReturnValue(c);
    c.range = jest.fn().mockResolvedValue({ data: detailRows, error: null, count: detailRows.length });
    // For the summary chain (no range, no order), the next .then-able is
    // applyFilters returning the chain as a plain Promise. We coerce by
    // making the chain itself a thenable that resolves to summaryRows.
    c.then = (onF, onR) => Promise.resolve({ data: resolveTo, error: null }).then(onF, onR);
    return c;
  };
  // Both detail and summary go through the same .from('agent_commissions');
  // we return a fresh chain each call.
  return buildChain(summaryRows);
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'agent_commissions') return buildAgentCommissionsMock();
    if (table === 'agent_payments') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    }
    if (table === 'documents') {
      return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'agent-user' } } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'admin', is_agent: true, commission_rate: 5, agent_status: 'active' },
        error: null,
      }),
    }),
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/app/api/_lib/access', () => ({
  resolveAgentIds: jest.fn().mockResolvedValue(['agent-user']),
}));

const { GET } = require('../commissions/route');

function makeRequest() {
  return new global.Request('http://localhost/api/commissions');
}

beforeEach(() => {
  detailRows = [];
  summaryRows = [];
});

describe('/api/commissions GET — cancelled rows excluded from summary', () => {
  test('summary.total_earned and summary.from_orders ignore cancelled rows', async () => {
    summaryRows = [
      { commission_amount: 50, status: 'pending', type: 'order' },
      { commission_amount: 75, status: 'paid', type: 'order' },
      { commission_amount: 999, status: 'cancelled', type: 'order' }, // must not count
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);

    expect(body.summary.total_earned).toBe(125); // 50 + 75, NOT 125 + 999
    expect(body.summary.from_orders).toBe(125);
    expect(body.summary.order_count).toBe(2);   // not 3
  });

  test('summary.from_bonuses and summary.bonus_count ignore cancelled bonuses', async () => {
    summaryRows = [
      { commission_amount: 100, status: 'pending', type: 'bonus' },
      { commission_amount: 200, status: 'cancelled', type: 'bonus' },
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.summary.from_bonuses).toBe(100);
    expect(body.summary.bonus_count).toBe(1);
  });

  test('summary.pending_amount and summary.paid_amount were already correct and stay correct', async () => {
    summaryRows = [
      { commission_amount: 10, status: 'pending', type: 'order' },
      { commission_amount: 20, status: 'paid', type: 'order' },
      { commission_amount: 30, status: 'cancelled', type: 'order' },
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.summary.pending_amount).toBe(10);
    expect(body.summary.paid_amount).toBe(20);
  });
});
