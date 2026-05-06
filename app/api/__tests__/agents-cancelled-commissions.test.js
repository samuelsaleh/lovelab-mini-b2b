/**
 * @jest-environment node
 *
 * /api/agents GET — Phase 18 regression test.
 *
 * The bug: when an agent's order is soft-deleted, Phase 11b's cascade flips
 * the matching agent_commissions row to status='cancelled'. Before this fix,
 * /api/agents counted that row as 1 order with the full revenue, so deleted
 * orders kept inflating the admin Top Agents leaderboard (Marc Schlund / 1
 * order / €470 even after deletion).
 *
 * Behaviour locked in:
 *   - cancelled rows do not contribute to commByAgent.orders / .revenue
 *   - cancelled rows do not contribute to .commission either
 *   - non-cancelled rows still count normally
 */

const profilesQueryResults = {
  active: [
    {
      id: 'marc-id',
      email: 'marc@example.com',
      full_name: 'Marc Schlund',
      is_agent: true,
      agent_status: 'active',
      commission_rate: 5,
    },
  ],
  trashed: [],
};

let commRowsToReturn = [];

function buildProfilesMock() {
  // The route makes several profiles queries; we only need the first OR()
  // call (the "active agents" list) to resolve to our Marc fixture.
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.or = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockResolvedValue({ data: [], error: null });
  chain.order = jest.fn().mockResolvedValue({ data: profilesQueryResults.active, error: null });
  return chain;
}

function buildAgentCommissionsMock() {
  const chain = {};
  chain.select = jest.fn().mockResolvedValue({ data: commRowsToReturn, error: null });
  return chain;
}

function buildDocumentsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockResolvedValue({ data: [], error: null });
  return chain;
}

function buildOrgsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockResolvedValue({ data: [], error: null });
  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') return buildProfilesMock();
    if (table === 'agent_commissions') return buildAgentCommissionsMock();
    if (table === 'documents') return buildDocumentsMock();
    if (table === 'organizations') return buildOrgsMock();
    if (table === 'organization_memberships') return buildOrgsMock();
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
      is: jest.fn().mockResolvedValue({ data: [], error: null }),
      not: jest.fn().mockResolvedValue({ data: [], error: null }),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
  }),
  rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/lib/organizations/authz', () => ({
  requireSession: jest.fn().mockResolvedValue({
    user: { id: 'admin-user' },
    profile: { id: 'admin-user', role: 'admin' },
  }),
  isAdmin: jest.fn().mockReturnValue(true),
}));

jest.mock('@/lib/email-templates', () => ({
  welcomeAgentEmail: jest.fn(),
  upgradeAgentEmail: jest.fn(),
}));

jest.mock('@/lib/send-email', () => ({ sendEmail: jest.fn() }));

jest.mock('@/lib/organizations/provision-agent', () => ({
  provisionAgentInOrg: jest.fn(),
  autoEnsureOrganization: jest.fn(),
}));

jest.mock('@/lib/agents/access', () => ({ grantAccess: jest.fn() }));

const { GET } = require('../agents/route');

function makeRequest() {
  return new global.Request('http://localhost/api/agents');
}

beforeEach(() => {
  commRowsToReturn = [];
});

describe('/api/agents GET — cancelled commissions are not counted', () => {
  test('a cancelled row does NOT inflate effective_orders or effective_revenue', async () => {
    // Marc has exactly one commission row, and its status is cancelled
    // because his order was soft-deleted. The Top Agents widget should
    // therefore show 0 orders / €0 for him, not 1 order / €470.
    commRowsToReturn = [
      {
        agent_id: 'marc-id',
        type: 'order',
        order_total: 470,
        commission_amount: 23.5,
        status: 'cancelled',
      },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);

    const marc = (body.agents || []).find((a) => a.id === 'marc-id');
    expect(marc).toBeDefined();
    expect(marc.stats.effective_orders).toBe(0);
    expect(marc.stats.effective_revenue).toBe(0);
  });

  test('a pending row DOES count toward effective_orders / effective_revenue', async () => {
    commRowsToReturn = [
      {
        agent_id: 'marc-id',
        type: 'order',
        order_total: 1000,
        commission_amount: 50,
        status: 'pending',
      },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    const marc = (body.agents || []).find((a) => a.id === 'marc-id');
    expect(marc.stats.effective_orders).toBe(1);
    expect(marc.stats.effective_revenue).toBe(1000);
  });

  test('mixed statuses: only non-cancelled rows are counted', async () => {
    commRowsToReturn = [
      { agent_id: 'marc-id', type: 'order', order_total: 100, commission_amount: 5, status: 'pending' },
      { agent_id: 'marc-id', type: 'order', order_total: 200, commission_amount: 10, status: 'paid' },
      { agent_id: 'marc-id', type: 'order', order_total: 999, commission_amount: 49.95, status: 'cancelled' },
      { agent_id: 'marc-id', type: 'order', order_total: 50, commission_amount: 2.5, status: 'approved' },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    const marc = (body.agents || []).find((a) => a.id === 'marc-id');
    // 3 non-cancelled order rows, total revenue 100+200+50 = 350
    expect(marc.stats.effective_orders).toBe(3);
    expect(marc.stats.effective_revenue).toBe(350);
  });
});
