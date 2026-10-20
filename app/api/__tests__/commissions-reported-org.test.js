/**
 * @jest-environment node
 *
 * /api/commissions/[id]/reported PATCH — members of a multi-member
 * organization (Phase 31).
 *
 * Org reports are keyed to the owner and tagged in their snapshot. A member's
 * line must link to the organization's latest report; searching for a report
 * in the member's own name used to answer "no report yet" every time.
 *
 * Covers:
 *   ✓ member of a multi-member org → latest report tagged with the org, found
 *     under the owner's profile, even when the owner also has personal reports
 *   ✓ multi-member org without any org report yet → 409 with the org wording
 *   ✓ single-member org → the agent's own latest report, as before
 */

let agentProfile = { organization_id: 'org-1' };
let memberships = [];
let ownerReports = [];
let reportQueries = [];
let updatePayload = null;

const ROW_ID = '11111111-1111-1111-1111-111111111111';

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      const q = { _col: null, _val: null };
      q.select = jest.fn(() => q);
      q.eq = jest.fn((col, val) => { q._col = col; q._val = val; return q; });
      q.single = jest.fn(async () => (
        q._val === 'admin-user'
          ? { data: { role: 'admin' }, error: null }
          : { data: agentProfile, error: null }
      ));
      return q;
    }
    if (table === 'organization_memberships') {
      const q = {};
      q.select = jest.fn(() => q);
      q.eq = jest.fn(() => q);
      q.is = jest.fn(async () => ({ data: memberships, error: null }));
      return q;
    }
    if (table === 'commission_reports') {
      const query = { select: null, filters: {} };
      reportQueries.push(query);
      const q = {};
      q.select = jest.fn((cols) => { query.select = cols; return q; });
      q.eq = jest.fn((col, val) => { query.filters[col] = val; return q; });
      q.order = jest.fn(() => q);
      q.limit = jest.fn((n) => { query.limit = n; return q; });
      q.maybeSingle = jest.fn(async () => ({ data: ownerReports[0] || null, error: null }));
      q.then = (resolve) => resolve({ data: ownerReports, error: null });
      return q;
    }
    if (table === 'agent_commissions') {
      return {
        select: jest.fn(() => {
          const c = {};
          c.eq = jest.fn(() => c);
          c.maybeSingle = jest.fn(async () => ({
            data: { id: ROW_ID, agent_id: 'wassila', document_id: null, type: 'order', status: 'pending', report_id: null, customer_paid_at: '2026-10-01T00:00:00.000Z' },
            error: null,
          }));
          return c;
        }),
        update: jest.fn((payload) => {
          updatePayload = payload;
          const c = {};
          c.eq = jest.fn(() => c);
          c.in = jest.fn(() => c);
          c.select = jest.fn(() => c);
          c.maybeSingle = jest.fn(async () => ({ data: { id: ROW_ID, agent_id: 'wassila', document_id: null, type: 'order', status: 'pending', ...payload }, error: null }));
          c.then = (resolve) => resolve({ data: [], error: null });
          return c;
        }),
      };
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'admin-user' } } })) },
  })),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { PATCH } = require('../commissions/[id]/reported/route');

const call = () => PATCH(
  new global.Request(`http://localhost/api/commissions/${ROW_ID}/reported`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reported: true }),
  }),
  { params: { id: ROW_ID } },
);

beforeEach(() => {
  agentProfile = { organization_id: 'org-1' };
  memberships = [
    { user_id: 'sarah', role: 'owner' },
    { user_id: 'wassila', role: 'member' },
  ];
  ownerReports = [];
  reportQueries = [];
  updatePayload = null;
});

describe('Mark reported for a member of a multi-member organization', () => {
  test('links the line to the latest ORG report under the owner, skipping personal ones', async () => {
    ownerReports = [
      { id: 'rep-personal', period_label: 'June 2026', period_key: '2026-06', created_at: '2026-10-19', organization: null },
      { id: 'rep-org', period_label: '18 October 2026', period_key: '2026-10-18-0900', created_at: '2026-10-18', organization: { id: 'org-1', name: 'Sarah Goutard Organization' } },
    ];

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(reportQueries[0].filters.agent_id).toBe('sarah');
    expect(reportQueries[0].select).toContain('organization:snapshot_data->organization');
    expect(updatePayload.report_id).toBe('rep-org');
    expect(body.report).toEqual({ id: 'rep-org', period_label: '18 October 2026', period_key: '2026-10-18-0900', created_at: '2026-10-18' });
  });

  test('409 with the organization wording when no org report exists yet', async () => {
    ownerReports = [
      { id: 'rep-personal', period_label: 'June 2026', created_at: '2026-06-30', organization: null },
    ];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/organization has no report yet/i);
    expect(updatePayload).toBeNull();
  });

  test('single-member organization keeps the agent\'s own latest report', async () => {
    memberships = [{ user_id: 'wassila', role: 'owner' }];
    ownerReports = [{ id: 'rep-own', period_label: 'May 2026', created_at: '2026-06-01' }];

    const res = await call();
    expect(res.status).toBe(200);
    expect(reportQueries[0].filters.agent_id).toBe('wassila');
    expect(updatePayload.report_id).toBe('rep-own');
  });
});
