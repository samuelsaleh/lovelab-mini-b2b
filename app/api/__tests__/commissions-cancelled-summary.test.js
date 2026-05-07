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

// ────────────────────────────────────────────────────────────────────────
// Phase 19b — four-bucket split (READY TO PAY vs AWAITING CUSTOMER)
// ────────────────────────────────────────────────────────────────────────

describe('/api/commissions GET — Phase 19b four-bucket summary', () => {
  test('ready_to_pay sums pending rows where customer_paid_at is set', async () => {
    summaryRows = [
      // Customer paid → READY TO PAY
      { commission_amount: 100, status: 'pending', type: 'order', customer_paid_at: '2026-05-01T10:00:00Z' },
      { commission_amount: 200, status: 'pending', type: 'order', customer_paid_at: '2026-05-02T10:00:00Z' },
      // Customer hasn't paid → AWAITING CUSTOMER
      { commission_amount: 300, status: 'pending', type: 'order', customer_paid_at: null },
      // Already paid out → PAID OUT (not in either pending bucket)
      { commission_amount: 50, status: 'paid', type: 'order', customer_paid_at: '2026-04-01T10:00:00Z' },
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.summary.ready_to_pay).toBe(300);          // 100 + 200
    expect(body.summary.awaiting_customer).toBe(300);     // just the 300
    expect(body.summary.ready_to_pay_count).toBe(2);
    expect(body.summary.awaiting_customer_count).toBe(1);
    // pending_amount should stay = ready_to_pay + awaiting_customer
    expect(body.summary.pending_amount).toBe(600);
    expect(body.summary.paid_amount).toBe(50);
  });

  test('cancelled rows are excluded from both new buckets', async () => {
    summaryRows = [
      { commission_amount: 999, status: 'cancelled', type: 'order', customer_paid_at: '2026-05-01' },
      { commission_amount: 100, status: 'pending', type: 'order', customer_paid_at: null },
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.summary.ready_to_pay).toBe(0);
    expect(body.summary.awaiting_customer).toBe(100);
  });

  test('approved status counts toward ready_to_pay just like pending (when customer_paid_at set)', async () => {
    summaryRows = [
      { commission_amount: 50, status: 'approved', type: 'order', customer_paid_at: '2026-05-01' },
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.summary.ready_to_pay).toBe(50);
    expect(body.summary.awaiting_customer).toBe(0);
  });

  test('new_client_bonus rows split into ready/awaiting just like orders', async () => {
    summaryRows = [
      { commission_amount: 200, status: 'pending', type: 'new_client_bonus', customer_paid_at: '2026-05-01' },
      { commission_amount: 200, status: 'pending', type: 'new_client_bonus', customer_paid_at: null },
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.summary.from_new_client_bonus).toBe(400);
    expect(body.summary.new_client_bonus_count).toBe(2);
    expect(body.summary.ready_to_pay).toBe(200);
    expect(body.summary.awaiting_customer).toBe(200);
  });

  test('all customers paid → awaiting_customer is 0; pending_amount equals ready_to_pay', async () => {
    summaryRows = [
      { commission_amount: 100, status: 'pending', type: 'order', customer_paid_at: '2026-05-01' },
      { commission_amount: 50, status: 'pending', type: 'new_client_bonus', customer_paid_at: '2026-05-01' },
    ];
    detailRows = [...summaryRows];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.summary.awaiting_customer).toBe(0);
    expect(body.summary.ready_to_pay).toBe(150);
    expect(body.summary.pending_amount).toBe(150);
  });
});
