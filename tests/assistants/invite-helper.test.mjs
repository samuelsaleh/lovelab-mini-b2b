import test from 'node:test';
import assert from 'node:assert/strict';

import { inviteAssistant, setAssistantEventAccess } from '../../lib/assistants/invite.js';
import { InviteError } from '../../lib/agents/invite.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase admin client — records every operation so tests can assert
// on the exact writes the real helper performs. Mirrors the agent invite
// test mock, extended with event_access state.
// ─────────────────────────────────────────────────────────────────────────────

function createMockSupabase(state = {}) {
  const calls = [];
  const s = {
    profileByEmail: null,          // existing profile row (or null)
    authUsers: [],                 // existing auth users
    eventAccessRows: [],           // current event_access rows for the user
    failCreateUser: false,
    failEventAccessUpsert: false,
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
        return { data: merged, error: null };
      }
      if (ctx.op === 'upsert') {
        return { data: { ...ctx.payload }, error: null };
      }
    }
    if (ctx.table === 'event_access') {
      if (ctx.op === 'select') return { data: s.eventAccessRows, error: null };
      if (ctx.op === 'upsert' && s.failEventAccessUpsert) {
        return { data: null, error: { message: 'boom' } };
      }
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
      delete() { ctx.op = 'delete'; return b; },
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
  };
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

test('inviteAssistant new user: allowlist, auth user, assistant profile, fair access, welcome email', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();

  const result = await inviteAssistant(supabase, {
    email: 'New.Assistant@Example.COM',
    fullName: 'New Assistant',
    eventIds: ['fair-1', 'fair-2'],
    eventNames: ['Munich 2026', 'INHORGENTA'],
    invitedByUserId: 'admin-1',
    siteUrl: 'https://example.com',
  }, deps);

  assert.equal(result.created, true);
  assert.equal(result.tempPassword, 'Temp1234!');
  assert.equal(record.grantAccessCalls[0], 'new.assistant@example.com');

  const createUser = supabase.calls.find((c) => c.op === 'createUser');
  assert.ok(createUser, 'auth user should be created');
  assert.equal(createUser.payload.email, 'new.assistant@example.com');
  assert.equal(createUser.payload.email_confirm, true);

  const upsert = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'upsert');
  assert.ok(upsert);
  assert.equal(upsert.payload.is_assistant, true);
  assert.equal(upsert.payload.has_password_set, false);
  assert.ok(!('is_agent' in upsert.payload), 'assistants must NOT be flagged as agents');
  assert.ok(!('commission_rate' in upsert.payload), 'assistants carry no commission rate');

  const accessUpsert = supabase.calls.find((c) => c.table === 'event_access' && c.op === 'upsert');
  assert.ok(accessUpsert, 'fair access rows must be written');
  assert.equal(accessUpsert.payload.length, 2);
  assert.deepEqual(accessUpsert.payload.map((r) => r.event_id).sort(), ['fair-1', 'fair-2']);
  for (const row of accessUpsert.payload) {
    assert.equal(row.permission, 'edit');
    assert.equal(row.user_id, 'new-auth-id');
    assert.equal(row.user_email, 'new.assistant@example.com');
    assert.equal(row.granted_by, 'admin-1');
  }
  assert.equal(accessUpsert.opts.onConflict, 'event_id,user_id');

  assert.equal(record.emails.length, 1);
  assert.equal(record.emails[0].to, 'new.assistant@example.com');
  assert.ok(record.emails[0].html.includes('Temp1234!'), 'welcome email carries the temp password');
  assert.ok(record.emails[0].html.includes('Munich 2026'), 'welcome email lists the granted fairs');
  assert.ok(record.emails[0].html.includes('commercial assistant'), 'email explains the role');

  // No organization / agent-folder machinery for assistants.
  assert.ok(!supabase.calls.some((c) => c.table === 'organization_memberships'));
  assert.ok(!supabase.calls.some((c) => c.table === 'events' && c.op === 'insert'));
});

test('inviteAssistant new user with existing auth account (Google OAuth): sets password instead of creating', async () => {
  const supabase = createMockSupabase({
    authUsers: [{ id: 'oauth-id', email: 'helper@example.com' }],
  });
  const { deps } = createDeps();

  const result = await inviteAssistant(supabase, {
    email: 'helper@example.com',
    eventIds: ['fair-1'],
  }, deps);

  assert.equal(result.created, true);
  assert.ok(!supabase.calls.some((c) => c.op === 'createUser'), 'must not create a duplicate auth user');
  const pwUpdate = supabase.calls.find((c) => c.op === 'updateUserById');
  assert.equal(pwUpdate.id, 'oauth-id');
  assert.equal(pwUpdate.payload.password, 'Temp1234!');

  const upsert = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'upsert');
  assert.equal(upsert.payload.id, 'oauth-id', 'profile keyed to the existing auth id');
  assert.equal(upsert.payload.is_assistant, true);
});

test('inviteAssistant sendInvite=false sends no email', async () => {
  const supabase = createMockSupabase();
  const { deps, record } = createDeps();
  await inviteAssistant(supabase, { email: 'a@b.co', eventIds: ['fair-1'], sendInvite: false }, deps);
  assert.equal(record.emails.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Existing-profile (upgrade) path
// ─────────────────────────────────────────────────────────────────────────────

test('inviteAssistant existing profile: flags as assistant, grants fairs, sends upgrade email without password', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'user-1', email: 'existing@example.com', is_assistant: false, is_agent: false, role: 'member' },
  });
  const { deps, record } = createDeps();

  const result = await inviteAssistant(supabase, {
    email: 'existing@example.com',
    fullName: 'Existing User',
    eventIds: ['fair-9'],
    eventNames: ['Paris 2026'],
    invitedByUserId: 'admin-1',
  }, deps);

  assert.equal(result.created, false);
  assert.equal(result.tempPassword, null, 'no temp password for existing accounts');

  const update = supabase.calls.find((c) => c.table === 'profiles' && c.op === 'update');
  assert.ok(update);
  assert.equal(update.payload.is_assistant, true);
  assert.equal(update.payload.full_name, 'Existing User');
  assert.ok(!('is_agent' in update.payload), 'existing agent state must not be touched');

  const accessUpsert = supabase.calls.find((c) => c.table === 'event_access' && c.op === 'upsert');
  assert.equal(accessUpsert.payload[0].event_id, 'fair-9');
  assert.equal(accessUpsert.payload[0].user_id, 'user-1');
  assert.equal(accessUpsert.payload[0].user_email, 'existing@example.com');

  assert.equal(record.grantAccessCalls.length, 1, 'existing users still get allowlist access');
  assert.equal(record.emails.length, 1);
  assert.ok(!record.emails[0].html.includes('Temp1234!'), 'upgrade email carries no password');
  assert.ok(record.emails[0].html.includes('Paris 2026'), 'upgrade email lists the granted fairs');
});

test('inviteAssistant retries a half-finished invitation with a fresh password and welcome email', async () => {
  const supabase = createMockSupabase({
    profileByEmail: {
      id: 'partial-user',
      email: 'partial@example.com',
      is_assistant: true,
      is_agent: false,
      role: 'member',
      has_password_set: false,
    },
  });
  const { deps, record } = createDeps();

  const result = await inviteAssistant(supabase, {
    email: 'partial@example.com',
    fullName: 'Partial Invite',
    eventIds: ['fair-1'],
    eventNames: ['Paris 2026'],
  }, deps);

  assert.equal(result.created, false, 'profile already existed');
  assert.equal(result.tempPassword, 'Temp1234!', 'retry generates a fresh temporary password');
  const passwordUpdate = supabase.calls.find((c) => c.op === 'updateUserById');
  assert.equal(passwordUpdate.id, 'partial-user');
  assert.equal(passwordUpdate.payload.password, 'Temp1234!');
  assert.equal(record.emails.length, 1);
  assert.ok(record.emails[0].html.includes('Temp1234!'), 'retry sends the welcome email, not an upgrade email');
});

// ─────────────────────────────────────────────────────────────────────────────
// setAssistantEventAccess — replace-set semantics
// ─────────────────────────────────────────────────────────────────────────────

test('setAssistantEventAccess removes fairs not in the new list and adds new ones', async () => {
  const supabase = createMockSupabase({
    eventAccessRows: [{ event_id: 'fair-old' }, { event_id: 'fair-keep' }],
  });

  const result = await setAssistantEventAccess(supabase, {
    userId: 'user-1',
    userEmail: 'helper@example.com',
    eventIds: ['fair-keep', 'fair-new'],
    grantedBy: 'admin-1',
  });

  assert.deepEqual(result.removed, ['fair-old']);
  assert.deepEqual(result.added, ['fair-new']);

  const del = supabase.calls.find((c) => c.table === 'event_access' && c.op === 'delete');
  assert.ok(del, 'stale fair access must be deleted');
  const inFilter = del.filters.find(([col]) => col === 'event_id');
  assert.deepEqual(inFilter[1], ['fair-old']);

  const upsert = supabase.calls.find((c) => c.table === 'event_access' && c.op === 'upsert');
  assert.equal(upsert.payload.length, 1);
  assert.equal(upsert.payload[0].event_id, 'fair-new');
  assert.equal(upsert.payload[0].user_email, 'helper@example.com');
});

test('setAssistantEventAccess no-op when the list is unchanged', async () => {
  const supabase = createMockSupabase({
    eventAccessRows: [{ event_id: 'fair-1' }],
  });

  const result = await setAssistantEventAccess(supabase, {
    userId: 'user-1',
    userEmail: 'helper@example.com',
    eventIds: ['fair-1'],
  });

  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.added, []);
  assert.ok(!supabase.calls.some((c) => c.table === 'event_access' && c.op === 'delete'));
  assert.ok(!supabase.calls.some((c) => c.table === 'event_access' && c.op === 'upsert'));
});

test('setAssistantEventAccess surfaces grant failures as InviteError', async () => {
  const supabase = createMockSupabase({ failEventAccessUpsert: true });
  await assert.rejects(
    () => setAssistantEventAccess(supabase, { userId: 'user-1', userEmail: 'helper@example.com', eventIds: ['fair-1'] }),
    (err) => err instanceof InviteError && err.status === 500
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation and failure paths
// ─────────────────────────────────────────────────────────────────────────────

test('inviteAssistant rejects invalid emails with a 400 InviteError', async () => {
  const supabase = createMockSupabase();
  const { deps } = createDeps();
  for (const bad of ['', null, 'not-an-email', 'a@b', 'user @x.com']) {
    await assert.rejects(
      () => inviteAssistant(supabase, { email: bad, eventIds: ['fair-1'] }, deps),
      (err) => err instanceof InviteError && err.status === 400
    );
  }
});

test('inviteAssistant surfaces auth createUser failure as 500 InviteError', async () => {
  const supabase = createMockSupabase({ failCreateUser: true });
  const { deps } = createDeps();
  await assert.rejects(
    () => inviteAssistant(supabase, { email: 'a@b.co', eventIds: ['fair-1'] }, deps),
    (err) => err instanceof InviteError && err.status === 500
  );
});

test('inviteAssistant new user: welcome email failure surfaces as 502 (admin must know)', async () => {
  const supabase = createMockSupabase();
  const { deps } = createDeps({
    sendEmail: async () => { throw new Error('resend down'); },
  });
  await assert.rejects(
    () => inviteAssistant(supabase, { email: 'a@b.co', eventIds: ['fair-1'] }, deps),
    (err) => err instanceof InviteError && err.status === 502
  );
});

test('inviteAssistant existing user: upgrade email failure is non-blocking', async () => {
  const supabase = createMockSupabase({
    profileByEmail: { id: 'user-1', email: 'e@x.co', is_assistant: false, is_agent: false, role: 'member' },
  });
  const { deps } = createDeps({
    sendEmail: async () => { throw new Error('resend down'); },
  });
  const result = await inviteAssistant(supabase, { email: 'e@x.co', eventIds: ['fair-1'] }, deps);
  assert.equal(result.created, false, 'existing user upgrade still succeeds');
});
