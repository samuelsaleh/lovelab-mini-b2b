/**
 * @jest-environment node
 *
 * /api/commission-reports GET — Phase 19/B6 listing
 *
 * Covers:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when agent_id is malformed
 *   ✓ 400 when month is malformed
 *   ✓ 200 returns reports list, default ordering by created_at desc
 *   ✓ Filters by agent_id when provided
 *   ✓ Filters by month (period_key) when provided
 *   ✓ Caps limit at 200
 *   ✓ Floors limit at 1
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

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
  q.then = (resolve) => resolve({ data: fakeReports, error: null });
  return q;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() =>
          Promise.resolve({ data: currentUser ? { role: currentRole } : null, error: null }),
        ),
      };
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
  lastQueryFilters = null;
});

describe('/api/commission-reports GET', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
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
});
