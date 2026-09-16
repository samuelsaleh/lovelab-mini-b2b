/**
 * @jest-environment node
 *
 * /api/employees and /api/employees/[id] — invite a colleague with admin
 * access, list them, resend their temporary password, remove their access.
 *
 * Sam, 14 Sep 2026: "an admin can invite new employees through a button
 * with all similar access as admin have, like we have with agent."
 */
const mockRequireSession = jest.fn();
const mockIsAdmin = jest.fn();
jest.mock('@/lib/organizations/authz', () => ({
  requireSession: (...a) => mockRequireSession(...a),
  isAdmin: (...a) => mockIsAdmin(...a),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const mockInviteEmployee = jest.fn();
const mockResendEmployeeInvite = jest.fn();
jest.mock('@/lib/employees/invite', () => ({
  EMPLOYEE_SELECT: 'id, email, full_name, role, is_agent, is_assistant, has_password_set',
  inviteEmployee: (...a) => mockInviteEmployee(...a),
  resendEmployeeInvite: (...a) => mockResendEmployeeInvite(...a),
}));
const mockRevokeAccess = jest.fn();
jest.mock('@/lib/agents/access', () => ({ revokeAccess: (...a) => mockRevokeAccess(...a) }));

// One table double: `state` decides what selects return; every write is recorded.
const state = { list: [], byId: null, adminCount: 3 };
const writes = [];
const mockRpc = jest.fn(async () => ({ error: null }));
function table(name) {
  const ctx = { table: name, op: 'select', filters: [], head: false };
  const b = {
    select: (cols, opts) => { ctx.cols = cols; ctx.head = !!opts?.head; return b; },
    update: (payload) => { ctx.op = 'update'; ctx.payload = payload; writes.push(ctx); return b; },
    eq: (c, v) => { ctx.filters.push([c, v]); return b; },
    order: () => b,
    maybeSingle: async () => ({ data: state.byId, error: null }),
    single: async () => ({ data: ctx.op === 'update' ? { ...state.byId, ...ctx.payload } : state.byId, error: null }),
    then: (resolve) => {
      if (ctx.op === 'update') return resolve({ error: null });
      if (ctx.head) return resolve({ count: state.adminCount, error: null });
      return resolve({ data: state.list, error: null });
    },
  };
  return b;
}
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({})),
  createAdminClient: jest.fn(() => ({ from: (name) => table(name), rpc: (...a) => mockRpc(...a) })),
}));

const { InviteError } = require('@/lib/agents/invite');
const list = require('../employees/route');
const one = require('../employees/[id]/route');

const SAM = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const EMP = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';

function req(method, body, path = '/api/employees') {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  writes.length = 0;
  state.list = [];
  state.byId = null;
  state.adminCount = 3;
  mockRequireSession.mockResolvedValue({ user: { id: SAM }, profile: { role: 'admin' }, error: null });
  mockIsAdmin.mockReturnValue(true);
});

describe('GET /api/employees', () => {
  test('lists the admins and marks the caller', async () => {
    state.list = [
      { id: SAM, email: 'sam@love-lab.com', full_name: 'Sam', role: 'admin', has_password_set: false },
      { id: EMP, email: 'emp@love-lab.com', full_name: 'Emp', role: 'admin', has_password_set: true },
    ];
    const res = await list.GET(req('GET'));
    expect(res.status).toBe(200);
    const { employees } = await res.json();
    expect(employees.map((e) => [e.email, e.you])).toEqual([['sam@love-lab.com', true], ['emp@love-lab.com', false]]);
  });

  test('is admin-only', async () => {
    mockIsAdmin.mockReturnValue(false);
    expect((await list.GET(req('GET'))).status).toBe(403);
  });
});

describe('POST /api/employees', () => {
  test('invites through the helper and answers 201 for a new account', async () => {
    mockInviteEmployee.mockResolvedValue({ employee: { id: EMP, email: 'new@love-lab.com', role: 'admin' }, created: true });
    const res = await list.POST(req('POST', { email: ' New@Love-Lab.com ', full_name: 'New' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ employee: { id: EMP, email: 'new@love-lab.com', role: 'admin', you: false }, created: true });
    expect(mockInviteEmployee).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      email: 'new@love-lab.com', fullName: 'New', invitedByUserId: SAM, sendInvite: true,
      siteUrl: 'http://localhost:3000',
    }));
  });

  test('answers 200 when an existing account was upgraded', async () => {
    mockInviteEmployee.mockResolvedValue({ employee: { id: EMP }, created: false });
    expect((await list.POST(req('POST', { email: 'x@y.co' }))).status).toBe(200);
  });

  test('refuses a missing or malformed address before touching anything', async () => {
    expect((await list.POST(req('POST', {}))).status).toBe(400);
    expect((await list.POST(req('POST', { email: 'nope' }))).status).toBe(400);
    expect(mockInviteEmployee).not.toHaveBeenCalled();
  });

  test('passes the helper\'s own status through (already an employee → 409)', async () => {
    mockInviteEmployee.mockRejectedValue(new InviteError('already an employee', 409));
    const res = await list.POST(req('POST', { email: 'sam@love-lab.com' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already/);
  });

  test('is admin-only', async () => {
    mockIsAdmin.mockReturnValue(false);
    expect((await list.POST(req('POST', { email: 'x@y.co' }))).status).toBe(403);
    expect(mockInviteEmployee).not.toHaveBeenCalled();
  });
});

describe('PUT /api/employees/[id] { _resend }', () => {
  test('sends a fresh temporary password', async () => {
    state.byId = { id: EMP, email: 'emp@love-lab.com', full_name: 'Emp', role: 'admin' };
    mockResendEmployeeInvite.mockResolvedValue({ ok: true });
    const res = await one.PUT(req('PUT', { _resend: true }, `/api/employees/${EMP}`), params(EMP));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/emp@love-lab.com/);
    expect(mockResendEmployeeInvite).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      profile: expect.objectContaining({ id: EMP }), siteUrl: 'http://localhost:3000',
    }));
  });

  test('not for your own account, and 404 for someone who is not an employee', async () => {
    state.byId = { id: SAM, email: 'sam@love-lab.com', role: 'admin' };
    expect((await one.PUT(req('PUT', { _resend: true }, `/api/employees/${SAM}`), params(SAM))).status).toBe(400);
    state.byId = null;
    expect((await one.PUT(req('PUT', { _resend: true }, `/api/employees/${EMP}`), params(EMP))).status).toBe(404);
    expect((await one.PUT(req('PUT', { _resend: true }, '/api/employees/nope'), params('nope'))).status).toBe(400);
    expect(mockResendEmployeeInvite).not.toHaveBeenCalled();
  });
});

describe('PUT /api/employees/[id] { commercial } — Sam, 15 Sep 2026', () => {
  test('makes an employee a commercial: agent flag, active, rate, since', async () => {
    state.byId = { id: EMP, email: 'raphael@love-lab.com', full_name: 'Raphael', role: 'admin', is_agent: false, agent_since: null };
    const res = await one.PUT(req('PUT', { commercial: true, commission_rate: 10 }, `/api/employees/${EMP}`), params(EMP));
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ is_agent: true, agent_status: 'active', agent_deleted_at: null, commission_rate: 10 });
    expect(typeof writes[0].payload.agent_since).toBe('string');
    expect(writes[0].filters).toEqual([['id', EMP]]);
    const { employee } = await res.json();
    expect(employee).toMatchObject({ id: EMP, is_agent: true, commission_rate: 10, you: false });
  });

  test('keeps the original agent_since when re-marking, and allows your own row', async () => {
    state.byId = { id: SAM, email: 'sam@love-lab.com', role: 'admin', is_agent: false, agent_since: '2026-01-01T00:00:00Z' };
    const res = await one.PUT(req('PUT', { commercial: true, commission_rate: 12.5 }, `/api/employees/${SAM}`), params(SAM));
    expect(res.status).toBe(200);
    expect(writes[0].payload.agent_since).toBe('2026-01-01T00:00:00Z');
    expect((await res.json()).employee.you).toBe(true);
  });

  test('refuses a rate outside 0–100 or missing', async () => {
    state.byId = { id: EMP, email: 'e@x.com', role: 'admin' };
    for (const rate of [undefined, 'ten', -1, 101]) {
      const res = await one.PUT(req('PUT', { commercial: true, commission_rate: rate }, `/api/employees/${EMP}`), params(EMP));
      expect(res.status).toBe(400);
    }
    expect(writes).toEqual([]);
  });

  test('stops a commercial: flag off, inactive, rate and history kept', async () => {
    state.byId = { id: EMP, email: 'e@x.com', role: 'admin', is_agent: true, agent_status: 'active', commission_rate: 10 };
    const res = await one.PUT(req('PUT', { commercial: false }, `/api/employees/${EMP}`), params(EMP));
    expect(res.status).toBe(200);
    expect(writes[0].payload).toEqual({ is_agent: false, agent_status: 'inactive' });
  });

  test('is admin-only', async () => {
    mockIsAdmin.mockReturnValue(false);
    expect((await one.PUT(req('PUT', { commercial: true, commission_rate: 5 }, `/api/employees/${EMP}`), params(EMP))).status).toBe(403);
  });
});

describe('DELETE /api/employees/[id]', () => {
  test('demotes to member, revokes sessions and the login allowlist', async () => {
    state.byId = { id: EMP, email: 'emp@love-lab.com', role: 'admin', is_agent: false, is_assistant: false };
    const res = await one.DELETE(req('DELETE', undefined, `/api/employees/${EMP}`), params(EMP));
    expect(res.status).toBe(200);
    expect(writes).toEqual([expect.objectContaining({ table: 'profiles', payload: { role: 'member' }, filters: [['id', EMP]] })]);
    expect(mockRpc).toHaveBeenCalledWith('revoke_user_sessions', { uid: EMP });
    expect(mockRevokeAccess).toHaveBeenCalledWith(expect.anything(), 'emp@love-lab.com');
  });

  test('keeps the login of someone who is also an agent or an assistant', async () => {
    state.byId = { id: EMP, email: 'agent@x.com', role: 'admin', is_agent: true, is_assistant: false };
    await one.DELETE(req('DELETE', undefined, `/api/employees/${EMP}`), params(EMP));
    expect(mockRevokeAccess).not.toHaveBeenCalled();
    expect(writes[0].payload).toEqual({ role: 'member' });
  });

  test('refuses to remove yourself or the last employee', async () => {
    state.byId = { id: SAM, email: 'sam@love-lab.com', role: 'admin' };
    const self = await one.DELETE(req('DELETE', undefined, `/api/employees/${SAM}`), params(SAM));
    expect(self.status).toBe(400);
    expect((await self.json()).error).toMatch(/own access/);

    state.byId = { id: EMP, email: 'emp@love-lab.com', role: 'admin' };
    state.adminCount = 1;
    const last = await one.DELETE(req('DELETE', undefined, `/api/employees/${EMP}`), params(EMP));
    expect(last.status).toBe(400);
    expect((await last.json()).error).toMatch(/last employee/);
    expect(writes).toEqual([]);
  });

  test('is admin-only', async () => {
    mockIsAdmin.mockReturnValue(false);
    expect((await one.DELETE(req('DELETE', undefined, `/api/employees/${EMP}`), params(EMP))).status).toBe(403);
  });
});
