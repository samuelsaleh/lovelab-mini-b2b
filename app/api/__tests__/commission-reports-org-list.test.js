/**
 * @jest-environment node
 *
 * /api/commission-reports GET — ?organization_id= (Phase 31)
 *
 * Organization reports are keyed to the owner's profile and tagged in their
 * snapshot. The org page must see only those, never the owner's personal
 * (pre-org) reports.
 *
 * Covers:
 *   ✓ admin + organization_id → owner looked up, only reports tagged with
 *     that organization are returned, each with organization_id
 *   ✓ owner's personal reports are dropped
 *   ✓ organization without owner → empty list
 *   ✓ malformed organization_id → 400
 *   ✓ agents cannot use the filter (ignored, pinned to their own reports)
 */

let callerRole = 'admin';
let callerIsAgent = false;
let ownerRow = { user_id: 'sarah' };
let reportRows = [];
let lastReportQuery = null;
let ownerLookups = 0;

const ORG = '171e2660-88f9-4677-a346-72d7c71462e9';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      const q = { _col: null, _val: null };
      q.select = jest.fn(() => q);
      q.eq = jest.fn((col, val) => { q._col = col; q._val = val; return q; });
      q.single = jest.fn(async () => {
        if (q._col === 'id' && q._val === 'caller') {
          return { data: { role: callerRole, is_agent: callerIsAgent }, error: null };
        }
        return { data: { email: `${q._val}@x.com` }, error: null };
      });
      q.then = (resolve) => resolve({ data: [{ id: q._val.replace('@x.com', '') }], error: null });
      return q;
    }
    if (table === 'organization_memberships') {
      ownerLookups += 1;
      const q = {};
      q.select = jest.fn(() => q);
      q.eq = jest.fn(() => q);
      q.is = jest.fn(() => q);
      q.limit = jest.fn(() => q);
      q.maybeSingle = jest.fn(async () => ({ data: ownerRow, error: null }));
      return q;
    }
    if (table === 'commission_reports') {
      lastReportQuery = { select: null, filters: {} };
      const q = {};
      q.select = jest.fn((cols) => { lastReportQuery.select = cols; return q; });
      q.order = jest.fn(() => q);
      q.limit = jest.fn((n) => { lastReportQuery.limit = n; return q; });
      q.eq = jest.fn((col, val) => { lastReportQuery.filters[col] = val; return q; });
      q.in = jest.fn((col, vals) => { lastReportQuery.filters[`${col}_in`] = vals; return q; });
      q.then = (resolve) => resolve({ data: reportRows, error: null });
      return q;
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'caller' } } })) },
  })),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { GET } = require('../commission-reports/route');

const req = (qs) => new global.Request(`http://localhost/api/commission-reports${qs}`);

beforeEach(() => {
  callerRole = 'admin';
  callerIsAgent = false;
  ownerRow = { user_id: 'sarah' };
  reportRows = [];
  lastReportQuery = null;
  ownerLookups = 0;
});

describe('/api/commission-reports GET ?organization_id=', () => {
  test('returns only the owner\'s reports tagged with this organization', async () => {
    reportRows = [
      { id: 'r-org-new', agent_id: 'sarah', period_key: '2026-10-20-0900', organization: { id: ORG, name: 'Sarah Goutard Organization' } },
      { id: 'r-personal', agent_id: 'sarah', period_key: '2026-06', organization: null },
      { id: 'r-other-org', agent_id: 'sarah', period_key: '2026-09', organization: { id: OTHER_ORG, name: 'Other' } },
      { id: 'r-org-old', agent_id: 'sarah', period_key: '2026-08-01-1000', organization: { id: ORG, name: 'Sarah Goutard Organization' } },
    ];

    const res = await GET(req(`?organization_id=${ORG}&limit=24`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(ownerLookups).toBe(1);
    expect(lastReportQuery.filters.agent_id).toBe('sarah');
    expect(lastReportQuery.select).toContain('organization:snapshot_data->organization');
    expect(body.reports.map((r) => r.id)).toEqual(['r-org-new', 'r-org-old']);
    expect(body.reports[0].organization_id).toBe(ORG);
    expect(body.reports[0].organization).toBeUndefined();
  });

  test('organization without an owner → empty list', async () => {
    ownerRow = null;
    reportRows = [{ id: 'x', agent_id: 'sarah', organization: { id: ORG } }];
    const res = await GET(req(`?organization_id=${ORG}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reports).toEqual([]);
    expect(lastReportQuery).toBeNull();
  });

  test('malformed organization_id → 400', async () => {
    const res = await GET(req('?organization_id=nope'));
    expect(res.status).toBe(400);
  });

  test('agents cannot list by organization — pinned to their own reports', async () => {
    callerRole = 'agent';
    callerIsAgent = true;
    reportRows = [{ id: 'mine', agent_id: 'caller' }];

    const res = await GET(req(`?organization_id=${ORG}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(ownerLookups).toBe(0);
    expect(lastReportQuery.filters.agent_id).toBe('caller');
    expect(lastReportQuery.select).not.toContain('snapshot_data');
    expect(body.reports.map((r) => r.id)).toEqual(['mine']);
  });
});
