import test from 'node:test';
import assert from 'node:assert/strict';

import { inviteAgent, resendAgentInvite, InviteError } from '../../lib/agents/invite.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase admin client — records every operation so tests can assert
// on the exact writes the real helper performs.
// ─────────────────────────────────────────────────────────────────────────────

function createMockSupabase(state = {}) {
  const calls = [];
  const s = {
    profileByEmail: null,          // existing profile row (or null)
    authUsers: [],                 // existing auth users
    membership: null,              // existing membership row (or null)
    updateResult: null,            // row returned by profiles update
    upsertResult: null,            // row returned by profiles upsert
    failCreateUser: false,
    failUpdatePassword: false,
    ...state,
  };

  const handler = (ctx) => {
    calls.push(ctx);
    if (ctx.table === 'profiles') {
      if (ctx.op === 'select') {
        return { data: s.profileByEmail, error: null };
      }
      if (ctx.op === 'update') {
        const merged = { ...(s.profileByEmail || {}), ...ctx.payload };
        return { data: s.updateResult || merged, error: null };
      }
      if (ctx.op === 'upsert') {
        return { data: s.upsertResult || { ...ctx.payload }, error: null };
      }
    }
    if (ctx.table === 'organization_memberships') {
      if (ctx.op === 'select') return { data: s.membership, error: null };
      return { data: null, error: null };
    }
    if (ctx.table === 'allowed_emails') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };

  const makeBuilder = (table) => {
    const ctx = { table, op: 'select', payload: null, opts: null, filters: [] };
    const b = {
      select(cols) { if (ctx.op === 'select') ctx.cols = cols; return b; },
      insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return b; },
      update(payload) { ctx.op = 'update'; ctx.payload = payload; return b; },
      upsert(payload, opts) { ctx.op = 'upsert'; ctx.payload = payload; ctx.opts = opts; return b; },
      eq(col, val) { ctx.filters.push([col, val]); return b; },
      in(col, val) { ctx.filters.push([col, val]); return b; },
      is(col, val) { ctx.filters.push([col, val]); return b; },
      maybeSingle() { return Promise.resolve(handler(ctx)); },
      single() { return Promise.resolve(handler(ctx)); },
      then(resolve, reject) { return Promise.resolve(handler(ctx)).then(resolve, reject); },
    };
    return b;
  };

  const client = {
    calls,
    from: (table) => makeBuilder(table),
    auth: {
      admin: {
        listUsers: async () => {
          calls.push({ table: 'auth', op: 'listUsers' });
          return { data: { users: s.authUsers } };
        },
        createUser: async (payload) => {
          calls.push({ table: 'auth', op: 'createUser', payload });
          if (s.failCreateUser) return { data: null, error: { message: 'boom' } };
          return { data: { user: { id: 'new-auth-id', email: payload.email } }, error: null };
        },
        updateUserById: async (id, payload) => {
          calls.push({ table: 'auth', op: 'updateUserById', id, payload });
          if (s.failUpdatePassword) return { error: { message: 'boom' } };
          return { error: null };
        },
      },
    },
  };
  return client;
}

function createDeps(overrides = {}) {
  const record = {
    grantAccessCalls: [],
    emails: [],
    provisionCalls: [],
    autoEnsureCalls: [],
  };
  const deps = {
    grantAccess: async (_c, email) => { record.grantAccessCalls.push(email); },
    generateTempPassword: () => 'Temp1234!',
    sendEmail: async (msg) => { record.emails.push(msg); },
    provisionAgentInOrg: async (orgId, userId) => { record.provisionCalls.push([orgId, userId]); },
    autoEnsureOrganization: async (userId, callerId) => {
      record.autoEnsureCalls.push([userId, callerId]);
      return { organization: { id: 'auto-org-1' } };
    },
    ...overrides,
  };
  return { deps, record };
}

// ─────────────────────────────────────────────────────────────────────────────
// New-user path
// ─────────────────────────────────────────────────────────────────────────────

test('inviteAgent new user: creates auth user, profile, sends temp-password email', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();

  const result = await inviteAgent(supabase, {
    email: 'New.Agent@Example.COM',
    fullName: 'New Agent',
    commissionRate: 12,
    siteUrl: 'https://example.com',
  }, deps);

  assert.equal(result.created, true);
  assert.equal(result.tempPassword, 'Temp1234!');
  assert.equal(record.grantAccessCalls[0], 'new.agent@example.com');

  const createUser = supabase.calls.find((c) => c.op === 'createUser');
  assert.ok(createUser, 'auth user should be created');
  assert.equal(createUser.payload.email, 'new.agent@example.com');
  assert.equal(createUser.payload.email_confirm, true);

  const upsert = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'upsert');
  assert.ok(upsert);
  assert.equal(upsert.payload.is_agent, true);
  assert.equal(upsert.payload.agent_status, 'invited');
  assert.equal(upsert.payload.has_password_set, false);
  assert.equal(upsert.payload.commission_rate, 12);

  assert.equal(record.emails.length, 1);
  assert.equal(record.emails[0].to, 'new.agent@example.com');
  assert.ok(record.emails[0].html.includes('Temp1234!'), 'welcome email carries the temp password');

  // No org requested → agent gets their own auto-created org (owner)
  assert.equal(record.autoEnsureCalls.length, 1);
  assert.equal(record.provisionCalls.length, 0);
});

test('inviteAgent new user with existing auth account (Google OAuth): sets password instead of creating', async () => {
  const supabase = createMockSupabase({
    authUsers: [{ id: 'oauth-id', email: 'agent@example.com' }],
  });
  const { deps } = createDeps();

  const result = await inviteAgent(supabase, { email: 'agent@example.com' }, deps);

  assert.equal(result.created, true);
  assert.ok(!supabase.calls.some((c) => c.op === 'createUser'), 'must not create a duplicate auth user');
  const pwUpdate = supabase.calls.find((c) => c.op === 'updateUserById');
  assert.equal(pwUpdate.id, 'oauth-id');
  assert.equal(pwUpdate.payload.password, 'Temp1234!');

  const upsert = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'upsert');
  assert.equal(upsert.payload.id, 'oauth-id', 'profile keyed to the existing auth id');
});

test('inviteAgent sendInvite=false sends no email', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();
  await inviteAgent(supabase, { email: 'a@b.co', sendInvite: false }, deps);
  assert.equal(record.emails.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Existing-profile (upgrade) path
// ─────────────────────────────────────────────────────────────────────────────

test('inviteAgent existing profile: upgrades to active agent and sends upgrade email', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'user-1', email: 'existing@example.com', is_agent: false, organization_id: null },
  });
  const { deps, record } = createDeps();

  const result = await inviteAgent(supabase, {
    email: 'existing@example.com',
    fullName: 'Existing User',
  }, deps);

  assert.equal(result.created, false);
  assert.equal(result.tempPassword, null, 'no temp password for existing accounts');

  const update = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'update');
  assert.ok(update);
  assert.equal(update.payload.is_agent, true);
  assert.equal(update.payload.agent_status, 'active', 're-invited existing users become active');
  assert.equal(update.payload.full_name, 'Existing User');

  assert.equal(record.grantAccessCalls.length, 1, 'existing users still get allowlist access');
  assert.equal(record.emails.length, 1);
  assert.ok(!record.emails[0].html.includes('Temp1234!'), 'upgrade email carries no password');
});

test('inviteAgent existing profile without commissionRate leaves rate untouched', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'user-1', email: 'e@x.co', is_agent: true, organization_id: null },
  });
  const { deps } = createDeps();
  await inviteAgent(supabase, { email: 'e@x.co', commissionRate: null }, deps);
  const update = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'update');
  assert.ok(!('commission_rate' in update.payload), 'null rate must not overwrite the configured rate');
});

// ─────────────────────────────────────────────────────────────────────────────
// Organization handling
// ─────────────────────────────────────────────────────────────────────────────

test('inviteAgent into an org: member membership created, NO solo org auto-created', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();

  await inviteAgent(supabase, {
    email: 'sub@example.com',
    organizationId: 'org-france',
    membershipRole: 'member',
    autoEnsureOrg: false,
  }, deps);

  const upsert = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'upsert');
  assert.equal(upsert.payload.organization_id, 'org-france');

  const memberInsert = supabase.calls.find((c) => c.table === 'organization_memberships' && c.op === 'insert');
  assert.ok(memberInsert);
  assert.equal(memberInsert.payload.role, 'member');
  assert.equal(memberInsert.payload.organization_id, 'org-france');

  assert.deepEqual(record.provisionCalls, [['org-france', memberInsert.payload.user_id]]);
  assert.equal(record.autoEnsureCalls.length, 0, 'sub-agents must NOT get their own solo org');
});

test('inviteAgent re-invite of a removed member reactivates the membership', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'user-9', email: 'back@example.com', is_agent: true, organization_id: null },
    membership: { id: 'm-1', deleted_at: '2026-01-01', role: 'member' },
  });
  const { deps } = createDeps();

  await inviteAgent(supabase, { email: 'back@example.com', organizationId: 'org-1' }, deps);

  const memberUpdate = supabase.calls.find((c) => c.table === 'organization_memberships' && c.op === 'update');
  assert.ok(memberUpdate, 'soft-deleted membership must be reactivated');
  assert.equal(memberUpdate.payload.deleted_at, null);
  assert.ok(!supabase.calls.some((c) => c.table === 'organization_memberships' && c.op === 'insert'));
});

test('inviteAgent existing active membership: no duplicate insert', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'user-9', email: 'dup@example.com', is_agent: true, organization_id: 'org-1' },
    membership: { id: 'm-1', deleted_at: null, role: 'member' },
  });
  const { deps } = createDeps();

  await inviteAgent(supabase, { email: 'dup@example.com', organizationId: 'org-1' }, deps);

  assert.ok(!supabase.calls.some((c) => c.table === 'organization_memberships' && c.op === 'insert'));
  assert.ok(!supabase.calls.some((c) => c.table === 'organization_memberships' && c.op === 'update'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation and failure paths
// ─────────────────────────────────────────────────────────────────────────────

test('inviteAgent rejects invalid emails with a 400 InviteError', async () => {
  const supabase = createMockSupabase();
  const { deps } = createDeps();
  for (const bad of ['', null, 'not-an-email', 'a@b', 'user @x.com']) {
    await assert.rejects(
      () => inviteAgent(supabase, { email: bad }, deps),
      (err) => err instanceof InviteError && err.status === 400
    );
  }
});

test('inviteAgent rejects invalid membership roles', async () => {
  const supabase = createMockSupabase();
  const { deps } = createDeps();
  await assert.rejects(
    () => inviteAgent(supabase, { email: 'a@b.co', membershipRole: 'admin' }, deps),
    (err) => err instanceof InviteError && err.status === 400
  );
});

test('inviteAgent surfaces auth createUser failure as 500 InviteError', async () => {
  const supabase = createMockSupabase({ failCreateUser: true });
  const { deps } = createDeps();
  await assert.rejects(
    () => inviteAgent(supabase, { email: 'a@b.co' }, deps),
    (err) => err instanceof InviteError && err.status === 500
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// resendAgentInvite
// ─────────────────────────────────────────────────────────────────────────────

test('resendAgentInvite resets password and re-sends the welcome email', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();

  await resendAgentInvite(supabase, {
    profile: { id: 'u-1', email: 'pending@example.com', full_name: 'Pending', has_password_set: false, agent_status: 'invited' },
    siteUrl: 'https://example.com',
  }, deps);

  const pwUpdate = supabase.calls.find((c) => c.op === 'updateUserById');
  assert.equal(pwUpdate.id, 'u-1');
  assert.equal(pwUpdate.payload.password, 'Temp1234!');
  assert.equal(record.emails.length, 1);
  assert.ok(record.emails[0].html.includes('Temp1234!'));
});

test('resendAgentInvite refuses when the member already set their own password', async () => {
  const supabase = createMockSupabase();
  const { deps } = createDeps();
  await assert.rejects(
    () => resendAgentInvite(supabase, {
      profile: { id: 'u-1', email: 'active@example.com', has_password_set: true, agent_status: 'invited' },
    }, deps),
    (err) => err instanceof InviteError && err.status === 409
  );
});

test('resendAgentInvite refuses for non-invited statuses', async () => {
  const supabase = createMockSupabase();
  const { deps } = createDeps();
  await assert.rejects(
    () => resendAgentInvite(supabase, {
      profile: { id: 'u-1', email: 'a@b.co', has_password_set: false, agent_status: 'active' },
    }, deps),
    (err) => err instanceof InviteError && err.status === 409
  );
});
