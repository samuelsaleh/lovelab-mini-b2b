/**
 * @jest-environment node
 *
 * POST /api/events/[id]/access with organization_id — invite a whole team.
 *
 * Sam, 14 Sep 2026: "how can I add Sarah's whole organization as an invite
 * to the fair?" Members are the live memberships plus any agent profile
 * carrying the organisation id; the fair's owner and inactive agents are
 * skipped; every member gets one access row.
 */
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn(async () => ({ user: { id: 'sam' }, isAdmin: true })),
  requireEventPermission: jest.fn(async () => ({ allowed: true })),
}));

const state = {};
const writes = [];
function table(name) {
  const ctx = { table: name, filters: [] };
  const b = {
    select: () => b,
    eq: (c, v) => { ctx.filters.push([c, v]); return b; },
    is: (c, v) => { ctx.filters.push([c, v]); return b; },
    in: (c, v) => { ctx.filters.push([c, v]); return b; },
    order: () => b,
    upsert: (rows, opts) => { writes.push({ table: name, rows, opts }); ctx.upserted = rows; return b; },
    maybeSingle: async () => ({ data: state[name]?.one ?? null, error: null }),
    single: async () => ({ data: state[name]?.one ?? null, error: null }),
    then: (resolve) => {
      if (ctx.upserted) return resolve({ data: ctx.upserted.map((r) => ({ ...r, created_at: 'now' })), error: null });
      const list = state[name]?.list;
      return resolve({ data: typeof list === 'function' ? list(ctx.filters) : (list || []), error: null });
    },
  };
  return b;
}
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({})),
  createAdminClient: jest.fn(() => ({ from: (name) => table(name) })),
}));

const { POST } = require('../events/[id]/access/route');
const req = (body) => new Request('http://localhost:3000/api/events/fair-1/access', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const params = { params: Promise.resolve({ id: 'fair-1' }) };

beforeEach(() => {
  writes.length = 0;
  for (const k of Object.keys(state)) delete state[k];
  state.organizations = { one: { id: 'org-sarah', name: "Sarah's team" } };
  state.events = { one: { created_by: 'sam' } };
  state.organization_memberships = { list: [{ user_id: 'sarah' }, { user_id: 'wassila' }] };
  state.profiles = {
    list: (filters) => {
      // the "by profile" lookup vs the final profile fetch
      if (filters.some(([c]) => c === 'organization_id')) return [{ id: 'wassila' }, { id: 'drifted' }];
      const wanted = filters.find(([c]) => c === 'id')?.[1] || [];
      return [
        { id: 'sarah', full_name: 'Sarah Goutard', email: 'sarah@x.com', agent_status: 'active' },
        { id: 'wassila', full_name: 'Wassila', email: 'wassila@x.com', agent_status: 'invited' },
        { id: 'drifted', full_name: 'Old', email: 'old@x.com', agent_status: 'inactive' },
      ].filter((p) => wanted.includes(p.id));
    },
  };
});

test('grants every active member of the team in one upsert and reports the count', async () => {
  const res = await POST(req({ organization_id: 'org-sarah', permission: 'edit' }), params);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.organization).toEqual({ id: 'org-sarah', name: "Sarah's team" });
  expect(body.granted).toBe(2);
  expect(body.access.map((r) => [r.user_id, r.permission, r.profiles.full_name])).toEqual([
    ['sarah', 'edit', 'Sarah Goutard'],
    ['wassila', 'edit', 'Wassila'],
  ]);
  expect(writes).toHaveLength(1);
  expect(writes[0].table).toBe('event_access');
  expect(writes[0].opts).toEqual({ onConflict: 'event_id,user_id' });
  expect(writes[0].rows).toEqual([
    { event_id: 'fair-1', user_id: 'sarah', user_email: 'sarah@x.com', granted_by: 'sam', permission: 'edit' },
    { event_id: 'fair-1', user_id: 'wassila', user_email: 'wassila@x.com', granted_by: 'sam', permission: 'edit' },
  ]);
});

test("the fair's owner is skipped, and a member without a live membership but with the org on their profile is included", async () => {
  state.events = { one: { created_by: 'sarah' } };
  const res = await POST(req({ organization_id: 'org-sarah', permission: 'read' }), params);
  const body = await res.json();
  expect(body.granted).toBe(1);
  expect(writes[0].rows.map((r) => r.user_id)).toEqual(['wassila']);
});

test('an unknown team is 404, an empty team is 400, and a bad permission is 400', async () => {
  state.organizations = { one: null };
  expect((await POST(req({ organization_id: 'nope', permission: 'edit' }), params)).status).toBe(404);

  state.organizations = { one: { id: 'org-e', name: 'Empty' } };
  state.organization_memberships = { list: [] };
  state.profiles = { list: () => [] };
  const empty = await POST(req({ organization_id: 'org-e', permission: 'edit' }), params);
  expect(empty.status).toBe(400);
  expect((await empty.json()).error).toMatch(/no members/);

  expect((await POST(req({ organization_id: 'org-sarah', permission: 'owner' }), params)).status).toBe(400);
  expect(writes).toEqual([]);
});

test('a single-person invite still works as before', async () => {
  state.profiles = { one: { id: 'bastian', email: 'b@x.com' }, list: () => [] };
  state.event_access = { one: { event_id: 'fair-1', user_id: 'bastian', permission: 'edit' } };
  const res = await POST(req({ user_id: 'bastian', permission: 'edit' }), params);
  expect(res.status).toBe(200);
  expect(writes[0].rows).toMatchObject({ user_id: 'bastian', permission: 'edit' });
});
