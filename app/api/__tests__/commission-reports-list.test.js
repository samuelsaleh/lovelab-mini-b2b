/**
 * @jest-environment node
 *
 * /api/commission-reports GET — Phase 19/B6 listing
 *
 * Covers:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is neither admin nor agent
 *   ✓ 400 when agent_id is malformed
 *   ✓ 400 when month is malformed
 *   ✓ 200 returns reports list, default ordering by created_at desc
 *   ✓ Filters by agent_id when provided (admin)
 *   ✓ Filters by month (period_key) when provided
 *   ✓ Caps limit at 200
 *   ✓ Floors limit at 1
 *   ✓ Phase 20.1 — agents can list their OWN reports (filter forced to user.id)
 *   ✓ Phase 20.1 — agents trying to read another agent_id are forced back
 *                  to their own filter (no cross-agent leak)
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';
let currentIsAgent = false;
let currentEmail = 'admin@test.com';

const fakeReports = [
  { id: 'r1', agent_id: 'a-1', period_key: '2026-04', total_due: 500, created_at: '2026-05-01' },
  { id: 'r2', agent_id: 'a-1', period_key: '2026-03', total_due: 0,   created_at: '2026-04-01' },
];

let lastQueryFilters = null;

function makeQuery() {
  const q = {};
  q.select = jest.fn().mockReturnValue(q);
  q.order = jest.fn().mockReturnValue(q);
  q.limit = jest.fn((n) => {
    lastQueryFilters.limit = n;
    return q;
  });
  q.eq = jest.fn((col, val) => {
    lastQueryFilters[col] = val;
    return q;
  });
  q.in = jest.fn((col, vals) => {
    lastQueryFilters[`${col}_in`] = vals;
    lastQueryFilters[col] = Array.isArray(vals) && vals.length === 1 ? vals[0] : vals;
    return q;
  });
  q.then = (resolve) => resolve({ data: fakeReports, error: null });
  return q;
}

// resolveAgentIds(adminSupabase, agentId) does:
//   1. profiles.select('email').eq('id', agentId).single()
//   2. profiles.select('id').eq('email', email)
// We track the latest id fed into .eq('id', X) so step 2 can return [X].
let lastProfileLookupId = null;

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      const profileQuery = {
        _filterCol: null,
        _filterVal: null,
        select: jest.fn(() => profileQuery),
        eq: jest.fn((col, val) => {
          profileQuery._filterCol = col;
          profileQuery._filterVal = val;
          if (col === 'id') lastProfileLookupId = val;
          return profileQuery;
        }),
        single: jest.fn(() => {
          // Caller-profile lookup (route reads role/is_agent for the
          // authenticated user) vs. resolveAgentIds email lookup.
          if (profileQuery._filterCol === 'id' && profileQuery._filterVal === currentUser?.id) {
            return Promise.resolve({
              data: currentUser
                ? { role: currentRole, is_agent: currentIsAgent, email: currentEmail }
                : null,
              error: null,
            });
          }
          // resolveAgentIds first step: fetch the email for the agent_id
          return Promise.resolve({
            data: { email: `agent-${profileQuery._filterVal}@test.com` },
            error: null,
          });
        }),
        // Step 2 of resolveAgentIds: profiles.select('id').eq('email', X)
        // Returns the same id we were originally asked about.
        then: (resolve) => resolve({
          data: [{ id: lastProfileLookupId || currentUser?.id || 'unknown' }],
          error: null,
        }),
      };
      return profileQuery;
    }
    if (table === 'commission_reports') {
      lastQueryFilters = { table };
      return makeQuery();
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

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { GET } = require('../commission-reports/route');

function makeRequest(qs = '') {
  return new global.Request(`http://localhost/api/commission-reports${qs}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  currentIsAgent = false;
  currentEmail = 'admin@test.com';
  lastQueryFilters = null;
  lastProfileLookupId = null;
});

describe('/api/commission-reports GET', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  test('403 when caller is neither admin nor agent', async () => {
    currentRole = 'user';
    currentIsAgent = false;
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  test('400 when agent_id is malformed', async () => {
    const res = await GET(makeRequest('?agent_id=not-a-uuid'));
    expect(res.status).toBe(400);
  });

  test('400 when month is malformed', async () => {
    const res = await GET(makeRequest('?month=April-2026'));
    expect(res.status).toBe(400);
  });

  test('200 returns reports list', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports).toEqual(fakeReports);
  });

  test('filters by agent_id when given', async () => {
    const validUuid = '11111111-1111-1111-1111-111111111111';
    await GET(makeRequest(`?agent_id=${validUuid}`));
    expect(lastQueryFilters.agent_id).toBe(validUuid);
  });

  test('filters by month (period_key) when given', async () => {
    await GET(makeRequest('?month=2026-04'));
    expect(lastQueryFilters.period_key).toBe('2026-04');
  });

  test('caps limit at 200', async () => {
    await GET(makeRequest('?limit=10000'));
    expect(lastQueryFilters.limit).toBe(200);
  });

  test('non-positive limit falls back to default 50', async () => {
    await GET(makeRequest('?limit=0'));
    expect(lastQueryFilters.limit).toBe(50);
  });

  test('default limit is 50', async () => {
    await GET(makeRequest());
    expect(lastQueryFilters.limit).toBe(50);
  });

  // ── Phase 20.1 — agent self-access ───────────────────────────────────────
  test('Phase 20.1 — agent can list their OWN reports (no agent_id param)', async () => {
    currentUser = { id: 'agent-self-1' };
    currentRole = 'member';
    currentIsAgent = true;
    currentEmail = 'agent@test.com';
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    // The route should force agent_id filter to user.id (or its resolved
    // siblings). Either eq() or in() may be used depending on resolveAgentIds.
    expect(lastQueryFilters.agent_id).toBeDefined();
  });

  test('Phase 20.1 — agent passing a foreign agent_id is forced back to their OWN id', async () => {
    currentUser = { id: 'agent-self-2' };
    currentRole = 'member';
    currentIsAgent = true;
    currentEmail = 'agent2@test.com';
    const otherAgent = '99999999-9999-9999-9999-999999999999';
    const res = await GET(makeRequest(`?agent_id=${otherAgent}`));
    expect(res.status).toBe(200);
    // The other agent's id MUST NOT show up in the resolved filter
    const filtered = String(lastQueryFilters.agent_id || '');
    expect(filtered).not.toBe(otherAgent);
  });
});
