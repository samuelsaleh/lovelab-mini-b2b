import test from 'node:test';
import assert from 'node:assert/strict';

import { inviteEmployee, resendEmployeeInvite } from '../../lib/employees/invite.js';
import { InviteError } from '../../lib/agents/invite.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase admin client — records every operation so tests can assert
// on the exact writes the helper performs. Same shape as the assistant mock.
// ─────────────────────────────────────────────────────────────────────────────

function createMockSupabase(state = {}) {
  const calls = [];
  const s = {
    profileByEmail: null,
    authUsers: [],
    failCreateUser: false,
    failPasswordUpdate: false,
    ...state,
  };

  const handler = (ctx) => {
    calls.push(ctx);
    if (ctx.table === 'profiles') {
      if (ctx.op === 'select') return { data: s.profileByEmail, error: null };
      if (ctx.op === 'update') return { data: { ...(s.profileByEmail || {}), ...ctx.payload }, error: null };
      if (ctx.op === 'upsert') return { data: { ...ctx.payload }, error: null };
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
      delete() { ctx.op = 'delete'; return b; },
      eq(col, val) { ctx.filters.push([col, val]); return b; },
      maybeSingle() { return Promise.resolve(handler(ctx)); },
      single() { return Promise.resolve(handler(ctx)); },
      then(resolve, reject) { return Promise.resolve(handler(ctx)).then(resolve, reject); },
    };
    return b;
  };

  return {
    calls,
    from: (table) => makeBuilder(table),
    auth: {
      admin: {
        listUsers: async () => {
          calls.push({ table: 'auth', op: 'listUsers' });
          return { data: { users: s.authUsers } };
        },
        getUserById: async (id) => {
          calls.push({ table: 'auth', op: 'getUserById', id });
          const u = s.authUsers.find((x) => x.id === id);
          return { data: { user: u || null }, error: null };
        },
        createUser: async (payload) => {
          calls.push({ table: 'auth', op: 'createUser', payload });
          if (s.failCreateUser) return { data: null, error: { message: 'boom' } };
          return { data: { user: { id: 'new-auth-id', email: payload.email } }, error: null };
        },
        updateUserById: async (id, payload) => {
          calls.push({ table: 'auth', op: 'updateUserById', id, payload });
          if (s.failPasswordUpdate) return { error: { message: 'boom' } };
          return { error: null };
        },
      },
    },
  };
}

function createDeps(overrides = {}) {
  const record = { grantAccessCalls: [], emails: [] };
  const deps = {
    grantAccess: async (_c, email) => { record.grantAccessCalls.push(email); },
    generateTempPassword: () => 'Temp1234!',
    sendEmail: async (msg) => { record.emails.push(msg); },
    ...overrides,
  };
  return { deps, record };
}

// ─────────────────────────────────────────────────────────────────────────────
// New-user path
// ─────────────────────────────────────────────────────────────────────────────

test('new employee: allowlist, auth user with the mark, admin profile, welcome email with the temp password', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();

  const result = await inviteEmployee(supabase, {
    email: 'New.Colleague@Love-Lab.COM',
    fullName: 'New Colleague',
    invitedByUserId: 'admin-1',
    siteUrl: 'https://example.com',
  }, deps);

  assert.equal(result.created, true);
  assert.equal(result.tempPassword, 'Temp1234!');
  assert.deepEqual(record.grantAccessCalls, ['new.colleague@love-lab.com']);

  const createUser = supabase.calls.find((c) => c.op === 'createUser');
  assert.ok(createUser, 'auth user should be created');
  assert.equal(createUser.payload.email, 'new.colleague@love-lab.com');
  assert.equal(createUser.payload.password, 'Temp1234!');
  assert.equal(createUser.payload.email_confirm, true, 'a mailed temp password confirms the address (14 Sep 2026)');
  assert.equal(createUser.payload.email_confirm, true);
  assert.equal(createUser.payload.user_metadata.must_set_password, true, 'the mark that forces /set-password');
  assert.equal(createUser.payload.user_metadata.full_name, 'New Colleague');

  const upsert = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'upsert');
  assert.ok(upsert);
  assert.equal(upsert.payload.id, 'new-auth-id');
  assert.equal(upsert.payload.role, 'admin', 'an employee is an admin');
  assert.equal(upsert.payload.has_password_set, false);
  assert.ok(!('is_agent' in upsert.payload), 'employees are not agents');
  assert.ok(!('is_assistant' in upsert.payload), 'employees are not assistants');
  assert.ok(!('commission_rate' in upsert.payload));
  assert.equal(upsert.opts.onConflict, 'id');

  assert.equal(record.emails.length, 1);
  assert.equal(record.emails[0].to, 'new.colleague@love-lab.com');
  assert.ok(record.emails[0].subject.includes('invited to LoveLab'));
  assert.ok(record.emails[0].html.includes('Temp1234!'), 'welcome email carries the temp password');
  assert.ok(record.emails[0].html.includes('https://example.com/login'));
  assert.ok(!record.emails[0].html.includes('LoveLab B2B'));

  assert.ok(!supabase.calls.some((c) => c.table === 'organization_memberships'));
  assert.ok(!supabase.calls.some((c) => c.table === 'event_access'));
});

test('new employee whose address already has an auth account (Google): password set, no duplicate user, mark kept with existing metadata', async () => {
  const supabase = createMockSupabase({
    authUsers: [{ id: 'oauth-id', email: 'colleague@love-lab.com', user_metadata: { avatar_url: 'x' } }],
  });
  const { deps } = createDeps();

  const result = await inviteEmployee(supabase, { email: 'colleague@love-lab.com', fullName: 'Col' }, deps);

  assert.equal(result.created, true);
  assert.ok(!supabase.calls.some((c) => c.op === 'createUser'));
  const pw = supabase.calls.find((c) => c.op === 'updateUserById');
  assert.equal(pw.id, 'oauth-id');
  assert.equal(pw.payload.password, 'Temp1234!');
  assert.equal(pw.payload.email_confirm, true, 'a mailed temp password confirms the address (14 Sep 2026)');
  assert.equal(pw.payload.user_metadata.must_set_password, true);
  assert.equal(pw.payload.user_metadata.avatar_url, 'x', 'existing metadata survives');
  assert.equal(pw.payload.user_metadata.full_name, 'Col');

  const upsert = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'upsert');
  assert.equal(upsert.payload.id, 'oauth-id');
  assert.equal(upsert.payload.role, 'admin');
});

test('sendInvite=false sends no email; a bad address is refused', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();
  await inviteEmployee(supabase, { email: 'a@b.co', sendInvite: false }, deps);
  assert.equal(record.emails.length, 0);

  await assert.rejects(
    () => inviteEmployee(createMockSupabase(), { email: 'not-an-email' }, createDeps().deps),
    (err) => err instanceof InviteError && err.status === 400,
  );
});

test('a brand-new employee whose email fails is reported (502) so the admin can resend', async () => {
  const supabase = createMockSupabase();
  const { deps } = createDeps({ sendEmail: async () => { throw new Error('resend down'); } });
  await assert.rejects(
    () => inviteEmployee(supabase, { email: 'x@y.co' }, deps),
    (err) => err instanceof InviteError && err.status === 502 && /resend down/.test(err.message),
  );
});

test('auth user creation failure surfaces as a 500 InviteError', async () => {
  const supabase = createMockSupabase({ failCreateUser: true });
  await assert.rejects(
    () => inviteEmployee(supabase, { email: 'x@y.co' }, createDeps().deps),
    (err) => err instanceof InviteError && err.status === 500,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Existing-profile path
// ─────────────────────────────────────────────────────────────────────────────

test('existing member with a password: role becomes admin, upgrade email, password untouched', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'user-1', email: 'member@love-lab.com', role: 'member', is_agent: false, is_assistant: false, has_password_set: true, full_name: 'Old Name' },
  });
  const { deps, record } = createDeps();

  const result = await inviteEmployee(supabase, { email: 'member@love-lab.com', fullName: 'New Name' }, deps);

  assert.equal(result.created, false);
  assert.equal(result.tempPassword, null);
  const update = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'update');
  assert.deepEqual(update.payload, { role: 'admin', full_name: 'New Name' });
  assert.deepEqual(update.filters, [['id', 'user-1']]);
  assert.deepEqual(record.grantAccessCalls, ['member@love-lab.com']);
  assert.ok(!supabase.calls.some((c) => c.op === 'updateUserById'), 'no password rotation');
  assert.equal(record.emails.length, 1);
  assert.ok(record.emails[0].subject.includes('full access'));
  assert.ok(!record.emails[0].html.includes('Temp1234!'));
});

test('existing agent keeps being an agent and gains full access', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'agent-1', email: 'agent@x.com', role: 'member', is_agent: true, has_password_set: true },
  });
  const { deps } = createDeps();
  await inviteEmployee(supabase, { email: 'agent@x.com' }, deps);
  const update = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'update');
  assert.deepEqual(update.payload, { role: 'admin' });
  assert.ok(!('is_agent' in update.payload));
});

test('pending invite (profile exists, no password yet): password rotated, welcome email again', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'pending-1', email: 'pending@love-lab.com', role: 'member', has_password_set: false, full_name: 'Pending' },
  });
  const { deps, record } = createDeps();

  const result = await inviteEmployee(supabase, { email: 'pending@love-lab.com' }, deps);

  assert.equal(result.created, false);
  assert.equal(result.tempPassword, 'Temp1234!');
  const pw = supabase.calls.find((c) => c.op === 'updateUserById');
  assert.equal(pw.id, 'pending-1');
  assert.equal(pw.payload.password, 'Temp1234!');
  assert.equal(pw.payload.email_confirm, true, 'a mailed temp password confirms the address (14 Sep 2026)');
  assert.equal(pw.payload.user_metadata.must_set_password, true);
  assert.ok(record.emails[0].html.includes('Temp1234!'), 'welcome email, not the upgrade one');
});

test('someone who is already an employee is refused with 409', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'sam', email: 'sam@love-lab.com', role: 'admin', has_password_set: true },
  });
  const { deps, record } = createDeps();
  await assert.rejects(
    () => inviteEmployee(supabase, { email: 'sam@love-lab.com' }, deps),
    (err) => err instanceof InviteError && err.status === 409,
  );
  assert.ok(!supabase.calls.some((c) => c.op === 'update' || c.op === 'upsert'), 'nothing written');
  assert.equal(record.emails.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Resend / reset
// ─────────────────────────────────────────────────────────────────────────────

test('resendEmployeeInvite: fresh temp password, mark re-applied, has_password_set back to false, welcome email', async () => {
  const supabase = createMockSupabase({
    authUsers: [{ id: 'emp-1', email: 'emp@love-lab.com', user_metadata: { full_name: 'Emp', must_set_password: false } }],
  });
  const { deps, record } = createDeps();

  const result = await resendEmployeeInvite(supabase, {
    profile: { id: 'emp-1', email: 'emp@love-lab.com', full_name: 'Emp', has_password_set: true },
    siteUrl: 'https://example.com',
  }, deps);

  assert.deepEqual(result, { ok: true });
  const pw = supabase.calls.find((c) => c.op === 'updateUserById');
  assert.equal(pw.id, 'emp-1');
  assert.equal(pw.payload.password, 'Temp1234!');
  assert.equal(pw.payload.email_confirm, true, 'a mailed temp password confirms the address (14 Sep 2026)');
  assert.equal(pw.payload.user_metadata.must_set_password, true);
  assert.equal(pw.payload.user_metadata.full_name, 'Emp');

  const update = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'update');
  assert.deepEqual(update.payload, { has_password_set: false });
  assert.deepEqual(update.filters, [['id', 'emp-1']]);

  assert.equal(record.emails.length, 1);
  assert.equal(record.emails[0].to, 'emp@love-lab.com');
  assert.ok(record.emails[0].html.includes('Temp1234!'));
});

test('resendEmployeeInvite refuses without a target and reports a failed password update', async () => {
  await assert.rejects(
    () => resendEmployeeInvite(createMockSupabase(), { profile: null }, createDeps().deps),
    (err) => err instanceof InviteError && err.status === 400,
  );
  const supabase = createMockSupabase({ failPasswordUpdate: true });
  await assert.rejects(
    () => resendEmployeeInvite(supabase, { profile: { id: 'e', email: 'e@x.co' } }, createDeps().deps),
    (err) => err instanceof InviteError && err.status === 500,
  );
});
