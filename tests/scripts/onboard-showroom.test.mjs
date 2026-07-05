import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROSTER,
  resolveOrganization,
  planMember,
  onboardRoster,
  makeSendEmail,
} from '../../scripts/onboard-showroom-accestory.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase admin client — table-level fixtures with filter support for
// the exact query shapes the script uses.
// ─────────────────────────────────────────────────────────────────────────────

function createMockSupabase(fixtures = {}) {
  const s = {
    organizations: [],
    profiles: [],
    memberships: [],
    folders: [],
    ...fixtures,
  };

  const applyFilters = (rows, filters) =>
    rows.filter((row) => filters.every(([col, val]) => {
      if (val === null) return row[col] == null;
      return row[col] === val;
    }));

  const makeBuilder = (table) => {
    const ctx = { filters: [], isFilters: [], orFilter: null, op: 'select', payload: null };
    const rowsFor = () => {
      if (table === 'organizations') return s.organizations;
      if (table === 'profiles') return s.profiles;
      if (table === 'organization_memberships') return s.memberships;
      if (table === 'agent_folders') return s.folders;
      return [];
    };
    const resolve = () => {
      if (ctx.op === 'insert') {
        const inserted = { id: `new-${table}-${rowsFor().length + 1}`, ...ctx.payload };
        rowsFor().push(inserted);
        return { data: inserted, error: null };
      }
      let rows = applyFilters(rowsFor(), [...ctx.filters, ...ctx.isFilters]);
      if (ctx.orFilter) {
        // name.ilike.%pattern% clauses joined by commas
        const patterns = ctx.orFilter.split(',').map((c) => {
          const m = c.match(/^name\.ilike\.(.+)$/);
          return m ? m[1].replace(/%/g, '').toLowerCase() : null;
        }).filter(Boolean);
        rows = rows.filter((r) => patterns.some((p) => (r.name || '').toLowerCase().includes(p)));
      }
      return { data: rows, error: null };
    };
    const b = {
      select() { return b; },
      insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return b; },
      eq(col, val) { ctx.filters.push([col, val]); return b; },
      is(col, val) { ctx.isFilters.push([col, val]); return b; },
      or(expr) { ctx.orFilter = expr; return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() {
        const { data, error } = resolve();
        return Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error });
      },
      single() {
        const { data, error } = resolve();
        return Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error });
      },
      then(res, rej) { return Promise.resolve(resolve()).then(res, rej); },
    };
    return b;
  };

  return { from: (table) => makeBuilder(table), _state: s };
}

const ORG = { id: 'org-sa', name: 'Showroom Accestory', territory: 'France', commission_rate: 15 };

// ─────────────────────────────────────────────────────────────────────────────
// Roster sanity
// ─────────────────────────────────────────────────────────────────────────────

test('roster: all 8 team members present with normalized-able emails', () => {
  assert.equal(ROSTER.length, 8);
  const emails = ROSTER.map((m) => m.email);
  assert.deepEqual(new Set(emails).size, 8, 'no duplicate emails');
  for (const m of ROSTER) {
    assert.match(m.email, /^[^\s@]+@showroomaccestory\.com$/);
    assert.ok(m.fullName.trim().length > 0);
    assert.ok(['owner', 'member'].includes(m.membershipRole));
  }
});

test('roster: exactly one owner — Alice (Responsable commerciale)', () => {
  const owners = ROSTER.filter((m) => m.membershipRole === 'owner');
  assert.equal(owners.length, 1);
  assert.equal(owners[0].email, 'alice@showroomaccestory.com');
});

// ─────────────────────────────────────────────────────────────────────────────
// Organization resolution
// ─────────────────────────────────────────────────────────────────────────────

test('resolveOrganization: single name match wins', async () => {
  const supabase = createMockSupabase({ organizations: [ORG, { id: 'o2', name: 'Nicolas Organization' }] });
  const { org, reason } = await resolveOrganization(supabase);
  assert.equal(reason, null);
  assert.equal(org.id, 'org-sa');
});

test('resolveOrganization: zero matches → no org, clear reason', async () => {
  const supabase = createMockSupabase({ organizations: [{ id: 'o2', name: 'Nicolas Organization' }] });
  const { org, candidates, reason } = await resolveOrganization(supabase);
  assert.equal(org, null);
  assert.equal(candidates.length, 0);
  assert.match(reason, /no organization matched/);
});

test('resolveOrganization: multiple matches → refuses to guess', async () => {
  const supabase = createMockSupabase({
    organizations: [ORG, { id: 'o2', name: 'Showroom Paris' }],
  });
  const { org, candidates, reason } = await resolveOrganization(supabase);
  assert.equal(org, null);
  assert.equal(candidates.length, 2);
  assert.match(reason, /--org-id/);
});

test('resolveOrganization: explicit --org-id bypasses the name search', async () => {
  const supabase = createMockSupabase({
    organizations: [ORG, { id: 'o2', name: 'Showroom Paris' }],
  });
  const { org, reason } = await resolveOrganization(supabase, { orgId: 'o2' });
  assert.equal(reason, null);
  assert.equal(org.id, 'o2');
});

test('resolveOrganization: bad --org-id → clear error, no fallback', async () => {
  const supabase = createMockSupabase({ organizations: [ORG] });
  const { org, reason } = await resolveOrganization(supabase, { orgId: 'nope' });
  assert.equal(org, null);
  assert.match(reason, /no organization with id nope/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-member planning
// ─────────────────────────────────────────────────────────────────────────────

const alice = ROSTER[0];

test('planMember: brand-new email → create', async () => {
  const supabase = createMockSupabase();
  const plan = await planMember(supabase, ORG.id, alice);
  assert.equal(plan.action, 'create');
});

test('planMember: active member → skip (idempotent re-run)', async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: 'u1', email: alice.email, organization_id: ORG.id }],
    memberships: [{ id: 'm1', organization_id: ORG.id, user_id: 'u1', role: 'owner', deleted_at: null }],
  });
  const plan = await planMember(supabase, ORG.id, alice);
  assert.equal(plan.action, 'skip');
  assert.equal(plan.membership.role, 'owner');
});

test('planMember: soft-deleted membership → reactivate', async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: 'u1', email: alice.email, organization_id: ORG.id }],
    memberships: [{ id: 'm1', organization_id: ORG.id, user_id: 'u1', role: 'member', deleted_at: '2026-01-01' }],
  });
  const plan = await planMember(supabase, ORG.id, alice);
  assert.equal(plan.action, 'reactivate');
});

test('planMember: profile in ANOTHER org → conflict, never poached', async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: 'u1', email: alice.email, organization_id: 'other-org' }],
  });
  const plan = await planMember(supabase, ORG.id, alice);
  assert.equal(plan.action, 'conflict');
});

test('planMember: profile without org → upgrade', async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: 'u1', email: alice.email, organization_id: null }],
  });
  const plan = await planMember(supabase, ORG.id, alice);
  assert.equal(plan.action, 'upgrade');
});

test('planMember: email matching is case/whitespace-insensitive input', async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: 'u1', email: 'alice@showroomaccestory.com', organization_id: ORG.id }],
    memberships: [{ id: 'm1', organization_id: ORG.id, user_id: 'u1', role: 'owner', deleted_at: null }],
  });
  const plan = await planMember(supabase, ORG.id, { ...alice, email: '  Alice@ShowroomAccestory.COM ' });
  assert.equal(plan.action, 'skip');
});

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

function silentLog() {}

test('onboardRoster: invites every new member with org id, correct role, France metadata', async () => {
  const supabase = createMockSupabase();
  const inviteCalls = [];
  const invite = async (_admin, options) => {
    inviteCalls.push(options);
    return { agent: { id: `id-${options.email}` }, created: true, tempPassword: 'Tmp123!' };
  };

  const { results, failures } = await onboardRoster(supabase, ORG, ROSTER, { invite, log: silentLog });

  assert.equal(failures, 0);
  assert.equal(results.length, 8);
  assert.equal(inviteCalls.length, 8);
  for (const call of inviteCalls) {
    assert.equal(call.organizationId, ORG.id);
    assert.equal(call.autoEnsureOrg, false, 'must never auto-create a solo org');
    assert.equal(call.extraAgentFields.agent_company, 'Showroom Accestory');
    assert.equal(call.extraAgentFields.agent_country, 'France');
  }
  const aliceCall = inviteCalls.find((c) => c.email === 'alice@showroomaccestory.com');
  assert.equal(aliceCall.membershipRole, 'owner');
  assert.equal(inviteCalls.filter((c) => c.membershipRole === 'member').length, 7);
});

test('onboardRoster: dry run never calls invite', async () => {
  const supabase = createMockSupabase();
  let invoked = 0;
  const invite = async () => { invoked += 1; return {}; };

  const { results, failures } = await onboardRoster(supabase, ORG, ROSTER, { invite, dryRun: true, log: silentLog });

  assert.equal(invoked, 0);
  assert.equal(failures, 0);
  assert.ok(results.every((r) => r.dryRun));
});

test('onboardRoster: active members are skipped, not re-invited', async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: 'u1', email: 'alice@showroomaccestory.com', organization_id: ORG.id }],
    memberships: [{ id: 'm1', organization_id: ORG.id, user_id: 'u1', role: 'owner', deleted_at: null }],
  });
  const inviteCalls = [];
  const invite = async (_a, options) => { inviteCalls.push(options.email); return { agent: {}, created: true, tempPassword: 'x' }; };

  const { results, failures } = await onboardRoster(supabase, ORG, ROSTER, { invite, log: silentLog });

  assert.equal(failures, 0);
  assert.equal(inviteCalls.length, 7, 'Alice already active → 7 invites');
  assert.ok(!inviteCalls.includes('alice@showroomaccestory.com'));
  assert.equal(results.find((r) => r.email === 'alice@showroomaccestory.com').action, 'skip');
});

test('onboardRoster: member of another org is reported as conflict failure', async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: 'u9', email: 'ruby@showroomaccestory.com', organization_id: 'someone-elses-org' }],
  });
  const invite = async () => ({ agent: {}, created: true, tempPassword: 'x' });

  const { results, failures } = await onboardRoster(supabase, ORG, ROSTER, { invite, log: silentLog });

  assert.equal(failures, 1);
  const ruby = results.find((r) => r.email === 'ruby@showroomaccestory.com');
  assert.equal(ruby.action, 'conflict');
  assert.equal(ruby.ok, false);
});

test('onboardRoster: one invite failure does not block the other seven', async () => {
  const supabase = createMockSupabase();
  const invite = async (_a, options) => {
    if (options.email === 'caren@showroomaccestory.com') throw new Error('resend exploded');
    return { agent: { id: 'x' }, created: true, tempPassword: 'x' };
  };

  const { results, failures } = await onboardRoster(supabase, ORG, ROSTER, { invite, log: silentLog });

  assert.equal(failures, 1);
  assert.equal(results.filter((r) => r.ok).length, 7);
  const caren = results.find((r) => r.email === 'caren@showroomaccestory.com');
  assert.equal(caren.action, 'error');
  assert.match(caren.error, /resend exploded/);
});

test('onboardRoster: temp passwords are captured for the summary fallback', async () => {
  const supabase = createMockSupabase();
  const invite = async (_a, options) => ({ agent: { id: 'x' }, created: true, tempPassword: `pw-${options.email}` });

  const { results } = await onboardRoster(supabase, ORG, ROSTER, { invite, log: silentLog });
  assert.equal(results.filter((r) => r.tempPassword).length, 8);
});

// ─────────────────────────────────────────────────────────────────────────────
// Email dep
// ─────────────────────────────────────────────────────────────────────────────

test('makeSendEmail: without api key reports no_api_key instead of throwing', async () => {
  const send = makeSendEmail({ apiKey: null });
  const res = await send({ to: 'a@b.c', subject: 's', html: '<p>x</p>' });
  assert.deepEqual(res, { sent: false, reason: 'no_api_key' });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end with the REAL inviteAgent (mock auth admin) — proves the script
// wiring produces the same writes as the admin /api/agents flow.
// ─────────────────────────────────────────────────────────────────────────────

test('integration: real inviteAgent path creates auth user, profile and org membership', async () => {
  const { inviteAgent } = await import('../../lib/agents/invite.js');

  const writes = { authCreated: [], profileUpserts: [], membershipInserts: [] };
  const admin = {
    from(table) {
      const ctx = { table, op: 'select', payload: null, filters: [] };
      const handler = () => {
        if (table === 'profiles' && ctx.op === 'select') return { data: null, error: null };
        if (table === 'profiles' && ctx.op === 'upsert') {
          writes.profileUpserts.push(ctx.payload);
          return { data: { ...ctx.payload }, error: null };
        }
        if (table === 'organization_memberships' && ctx.op === 'select') return { data: null, error: null };
        if (table === 'organization_memberships' && ctx.op === 'insert') {
          writes.membershipInserts.push(ctx.payload);
          return { data: ctx.payload, error: null };
        }
        return { data: null, error: null };
      };
      const b = {
        select() { return b; },
        insert(p) { ctx.op = 'insert'; ctx.payload = p; return b; },
        update(p) { ctx.op = 'update'; ctx.payload = p; return b; },
        upsert(p) { ctx.op = 'upsert'; ctx.payload = p; return b; },
        eq() { return b; },
        maybeSingle() { return Promise.resolve(handler()); },
        single() { return Promise.resolve(handler()); },
        then(res, rej) { return Promise.resolve(handler()).then(res, rej); },
      };
      return b;
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] } }),
        createUser: async (payload) => {
          writes.authCreated.push(payload);
          return { data: { user: { id: `auth-${payload.email}`, email: payload.email } }, error: null };
        },
        updateUserById: async () => ({ error: null }),
      },
    },
  };

  const emails = [];
  const provisioned = [];
  const deps = {
    sendEmail: async (msg) => { emails.push(msg); return { sent: true }; },
    provisionAgentInOrg: async (orgId, userId) => { provisioned.push([orgId, userId]); },
    autoEnsureOrganization: async () => { throw new Error('must not be called'); },
  };

  const { failures, results } = await onboardRoster(admin, ORG, ROSTER, {
    invite: (client, options) => inviteAgent(client, options, deps),
    log: silentLog,
  });

  assert.equal(failures, 0);
  assert.equal(writes.authCreated.length, 8);
  assert.equal(writes.profileUpserts.length, 8);
  assert.equal(writes.membershipInserts.length, 8);
  assert.equal(emails.length, 8);
  assert.equal(provisioned.length, 8);

  for (const upsert of writes.profileUpserts) {
    assert.equal(upsert.is_agent, true);
    assert.equal(upsert.agent_status, 'invited');
    assert.equal(upsert.has_password_set, false, 'forced /set-password on first login');
    assert.equal(upsert.organization_id, ORG.id);
    assert.equal(upsert.agent_company, 'Showroom Accestory');
  }
  const ownerMemberships = writes.membershipInserts.filter((m) => m.role === 'owner');
  assert.equal(ownerMemberships.length, 1, 'only Alice becomes owner');
  assert.ok(results.every((r) => r.tempPassword), 'every invite yields a temp password for the summary');
});
