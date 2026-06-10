/**
 * @jest-environment node
 *
 * /api/commissions POST — Phase 27 "quick orders" + bonus back-compat.
 *
 * Covers:
 *   1. type='order' (order_total mode) inserts an order commission with
 *      commission = amount * rate / 100, backdated created_at, customer_paid_at set.
 *   2. type='order' (direct mode) pays the agent the typed amount as-is (rate 0).
 *   3. commission_rate defaults to the agent's configured rate when omitted.
 *   4. Validation rejects a missing client_label and non-positive amounts.
 *   5. customer_paid:false leaves customer_paid_at NULL (still awaiting customer).
 *   6. Legacy bonus POST (no type) still inserts a type='bonus' row.
 */

let lastInsert = null;
let agentRow = { id: 'agent-1', is_agent: true, agent_deleted_at: null, commission_rate: 10 };

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: agentRow, error: null }),
      };
    }
    if (table === 'agent_commissions') {
      return {
        insert: jest.fn((payload) => {
          lastInsert = payload;
          return {
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'new-commission', ...payload },
              error: null,
            }),
          };
        }),
      };
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin-user' } } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
    }),
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { POST } = require('../commissions/route');

function makeRequest(body) {
  return new global.Request('http://localhost/api/commissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  lastInsert = null;
  agentRow = { id: 'agent-1', is_agent: true, agent_deleted_at: null, commission_rate: 10 };
});

describe('/api/commissions POST — quick order (order_total mode)', () => {
  test('computes commission = amount * rate / 100 and backdates created_at', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      type: 'order',
      client_label: 'Old Client',
      amount: 1000,
      amount_mode: 'order_total',
      commission_rate: 12,
      created_at: '2025-12-01T00:00:00.000Z',
      customer_paid: true,
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(lastInsert.type).toBe('order');
    expect(lastInsert.client_label).toBe('Old Client');
    expect(lastInsert.order_total).toBe(1000);
    expect(lastInsert.commission_rate).toBe(12);
    expect(lastInsert.commission_amount).toBe(120); // 1000 * 12%
    expect(lastInsert.status).toBe('pending');
    expect(lastInsert.document_id).toBeNull();
    expect(lastInsert.created_at).toBe('2025-12-01T00:00:00.000Z');
    expect(lastInsert.customer_paid_at).not.toBeNull();
    expect(body.commission.id).toBe('new-commission');
  });

  test('defaults the rate to the agent commission_rate when omitted', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      type: 'order',
      client_label: 'Client B',
      amount: 200,
    }));
    expect(res.status).toBe(200);
    expect(lastInsert.commission_rate).toBe(10); // agent default
    expect(lastInsert.commission_amount).toBe(20); // 200 * 10%
  });

  test('customer_paid:false leaves customer_paid_at NULL', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      type: 'order',
      client_label: 'Client C',
      amount: 500,
      customer_paid: false,
    }));
    expect(res.status).toBe(200);
    expect(lastInsert.customer_paid_at).toBeNull();
  });
});

describe('/api/commissions POST — quick order (direct mode)', () => {
  test('pays the typed amount as-is with rate 0', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      type: 'order',
      client_label: 'Direct Client',
      amount: 100,
      amount_mode: 'direct',
    }));
    expect(res.status).toBe(200);
    expect(lastInsert.commission_rate).toBe(0);
    expect(lastInsert.commission_amount).toBe(100);
    expect(lastInsert.order_total).toBe(100);
  });
});

describe('/api/commissions POST — validation', () => {
  test('rejects a quick order with no client_label', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      type: 'order',
      amount: 100,
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/client_label/i);
    expect(lastInsert).toBeNull();
  });

  test('rejects a non-positive amount', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      type: 'order',
      client_label: 'X',
      amount: 0,
    }));
    expect(res.status).toBe(400);
    expect(lastInsert).toBeNull();
  });

  test('rejects an invalid type', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      type: 'refund',
      amount: 100,
    }));
    expect(res.status).toBe(400);
    expect(lastInsert).toBeNull();
  });
});

describe('/api/commissions POST — legacy bonus back-compat', () => {
  test('a body with no type still inserts a type=bonus row', async () => {
    const res = await POST(makeRequest({
      agent_id: 'agent-1',
      amount: 250,
      notes: 'bank transfer',
    }));
    expect(res.status).toBe(200);
    expect(lastInsert.type).toBe('bonus');
    expect(lastInsert.commission_amount).toBe(250);
    expect(lastInsert.order_total).toBe(0);
    expect(lastInsert.commission_rate).toBe(0);
    expect(lastInsert.notes).toBe('bank transfer');
  });
});
