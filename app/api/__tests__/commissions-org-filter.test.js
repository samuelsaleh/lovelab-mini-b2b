/**
 * @jest-environment node
 *
 * /api/commissions GET — ?organization_id= (Phase 31 org settlement page)
 *
 * Covers:
 *   ✓ admin + organization_id: active members are loaded, their ids (plus the
 *     duplicate profiles behind them) go into .in('agent_id', …), and every row
 *     carries `agent: { id, full_name, email }`
 *   ✓ organization with no active member → empty payload, no .in([]) query
 *   ✓ malformed organization_id → 400
 *   ✓ an agent caller cannot use the filter (pinned to their own rows)
 */

let callerRole = 'admin';
let callerIsAgent = false;
let memberships = [];
let detailRows = [];
let profileRows = [];
let agentCommissionFilters = [];
let membershipQueries = 0;

function buildAgentCommissionsMock() {
  const filters = {};
  agentCommissionFilters.push(filters);
  const c = {};
  c.select = jest.fn().mockReturnValue(c);
  c.eq = jest.fn((col, val) => { filters[`eq_${col}`] = val; return c; });
  c.in = jest.fn((col, vals) => { filters[`in_${col}`] = vals; return c; });
  c.order = jest.fn().mockReturnValue(c);
  // Filters are applied after .range() in the route, so range must keep the
  // builder chainable; awaiting the chain resolves the rows.
  c.range = jest.fn().mockReturnValue(c);
  c.then = (onF, onR) => Promise.resolve({ data: detailRows, error: null, count: detailRows.length }).then(onF, onR);
  return c;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'agent_commissions') return buildAgentCommissionsMock();
    if (table === 'organization_memberships') {
      membershipQueries += 1;
      const c = {};
      c.select = jest.fn().mockReturnValue(c);
      c.eq = jest.fn().mockReturnValue(c);
      c.is = jest.fn().mockResolvedValue({ data: memberships, error: null });
      return c;
    }
    if (table === 'profiles') {
      const c = {};
      c.select = jest.fn().mockReturnValue(c);
      c.in = jest.fn().mockResolvedValue({ data: profileRows, error: null });
      return c;
    }
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
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'caller' } } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(async () => ({
        data: { role: callerRole, is_agent: callerIsAgent, commission_rate: 5, agent_status: 'active' },
        error: null,
      })),
    }),
  })),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

// Wassila was re-invited once: two profiles share her email.
jest.mock('@/app/api/_lib/access', () => ({
  resolveAgentIds: jest.fn(async (_sb, id) => (id === 'wassila' ? ['wassila', 'wassila-old'] : [id])),
}));

const { GET } = require('../commissions/route');

const ORG = '171e2660-88f9-4677-a346-72d7c71462e9';
const req = (qs) => new global.Request(`http://localhost/api/commissions${qs}`);

beforeEach(() => {
  callerRole = 'admin';
  callerIsAgent = false;
  memberships = [];
  detailRows = [];
  profileRows = [];
  agentCommissionFilters = [];
  membershipQueries = 0;
});

describe('/api/commissions GET ?organization_id=', () => {
  test('admin gets every member\'s rows, agent named on each', async () => {
    memberships = [{ user_id: 'sarah' }, { user_id: 'wassila' }];
    profileRows = [
      { id: 'sarah', full_name: 'Sarah Goutard', email: 'sarah@x.com' },
      { id: 'wassila', full_name: 'Wassila Mekidiche', email: 'wassila@x.com' },
    ];
    detailRows = [
      { id: 'c1', agent_id: 'wassila', type: 'order', status: 'pending', commission_amount: 100 },
      { id: 'c2', agent_id: 'sarah', type: 'order', status: 'pending', commission_amount: 50 },
      { id: 'c3', agent_id: 'wassila-old', type: 'order', status: 'paid', commission_amount: 20 },
    ];

    const res = await GET(req(`?organization_id=${ORG}&per_page=500`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(membershipQueries).toBe(1);
    // Both the detail and the summary queries scope to the resolved member ids.
    for (const f of agentCommissionFilters) {
      expect(f.in_agent_id).toEqual(['sarah', 'wassila', 'wassila-old']);
    }
    expect(body.commissions).toHaveLength(3);
    expect(body.commissions[0].agent).toEqual({ id: 'wassila', full_name: 'Wassila Mekidiche', email: 'wassila@x.com' });
    expect(body.commissions[1].agent.full_name).toBe('Sarah Goutard');
    // An unknown profile still yields an agent object, never undefined.
    expect(body.commissions[2].agent).toEqual({ id: 'wassila-old', full_name: null, email: null });
    expect(body.total_count).toBe(3);
  });

  test('organization without active members → empty list, no commissions query', async () => {
    memberships = [];
    const res = await GET(req(`?organization_id=${ORG}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.commissions).toEqual([]);
    expect(body.total_count).toBe(0);
    expect(agentCommissionFilters).toHaveLength(0);
  });

  test('malformed organization_id → 400', async () => {
    const res = await GET(req('?organization_id=not-a-uuid'));
    expect(res.status).toBe(400);
  });

  test('an agent caller is pinned to their own rows; the filter is ignored', async () => {
    callerRole = 'agent';
    callerIsAgent = true;
    detailRows = [{ id: 'c1', agent_id: 'caller', type: 'order', status: 'pending', commission_amount: 10 }];

    const res = await GET(req(`?organization_id=${ORG}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(membershipQueries).toBe(0);
    expect(agentCommissionFilters[0].eq_agent_id).toBe('caller');
    expect(body.commissions[0].agent).toBeUndefined();
  });
});
