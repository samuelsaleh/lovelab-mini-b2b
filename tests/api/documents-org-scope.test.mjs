import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { canUseOrgScope, buildTeamScopeOrFilter } from '../../lib/organizations/team.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// canUseOrgScope — who may request organization_id-scoped documents
// ─────────────────────────────────────────────────────────────────────────────

test('any ACTIVE org member (owner or member) can use the org scope', () => {
  for (const role of ['owner', 'member']) {
    assert.equal(
      canUseOrgScope({
        organizationId: 'org-1',
        memberships: [{ organization_id: 'org-1', role, deleted_at: null }],
      }),
      true,
      `${role} should see team documents`
    );
  }
});

test('non-members of the org are rejected', () => {
  assert.equal(
    canUseOrgScope({
      organizationId: 'org-1',
      memberships: [{ organization_id: 'org-OTHER', role: 'owner', deleted_at: null }],
    }),
    false
  );
});

test('users with no org memberships are rejected', () => {
  assert.equal(canUseOrgScope({ organizationId: 'org-1', memberships: [] }), false);
  assert.equal(canUseOrgScope({ organizationId: 'org-1', memberships: undefined }), false);
});

test('removed (soft-deleted) members lose team visibility', () => {
  assert.equal(
    canUseOrgScope({
      organizationId: 'org-1',
      memberships: [{ organization_id: 'org-1', role: 'member', deleted_at: '2026-06-01' }],
    }),
    false
  );
});

test('admins can scope to any org', () => {
  assert.equal(canUseOrgScope({ isAdmin: true, organizationId: 'org-1', memberships: [] }), true);
});

test('missing organization_id never scopes', () => {
  assert.equal(canUseOrgScope({ isAdmin: true, organizationId: null }), false);
  assert.equal(
    canUseOrgScope({ organizationId: '', memberships: [{ organization_id: '', deleted_at: null }] }),
    false
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// buildTeamScopeOrFilter — the PostgREST filter for team documents
// ─────────────────────────────────────────────────────────────────────────────

test('filter covers member-created docs OR org-event docs', () => {
  const filter = buildTeamScopeOrFilter({ memberIds: ['u1', 'u2'], eventIds: ['e1'] });
  assert.equal(filter, 'created_by.in.(u1,u2),event_id.in.(e1)');
});

test('filter with only members', () => {
  assert.equal(buildTeamScopeOrFilter({ memberIds: ['u1'], eventIds: [] }), 'created_by.in.(u1)');
});

test('filter with only events', () => {
  assert.equal(buildTeamScopeOrFilter({ memberIds: [], eventIds: ['e1', 'e2'] }), 'event_id.in.(e1,e2)');
});

test('empty scope yields null (caller returns an empty list)', () => {
  assert.equal(buildTeamScopeOrFilter({ memberIds: [], eventIds: [] }), null);
  assert.equal(buildTeamScopeOrFilter({}), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Route wiring — static source assertions on app/api/documents/route.js
// (the route itself needs Next.js to run; these assertions pin the contract)
// ─────────────────────────────────────────────────────────────────────────────

const routeSrc = readFileSync(join(repoRoot, 'app/api/documents/route.js'), 'utf8');

test('documents route rejects non-members of the requested org with 403', () => {
  assert.ok(routeSrc.includes('canUseOrgScope('), 'must use the shared membership check');
  assert.match(routeSrc, /not a member of this organization[\s\S]{0,80}status: 403/);
});

test('documents route resolves the team scope through getOrgTeamScope', () => {
  assert.ok(routeSrc.includes('getOrgTeamScope(adminSupabase, organizationId)'));
  assert.ok(routeSrc.includes('buildTeamScopeOrFilter('));
});

test('documents route expands the default non-admin list with teammates', () => {
  assert.ok(routeSrc.includes('getActiveOrgMemberships(adminSupabase, user.id)'));
  assert.ok(routeSrc.includes("scope') === 'mine'"), 'scope=mine opt-out must exist for the analytics toggle');
});

test('admin org filter path is preserved (organizationId && isAdmin)', () => {
  assert.ok(routeSrc.includes('if (organizationId && isAdmin)'));
});

// The team scope (getOrgTeamScope) intentionally includes soft-deleted
// memberships so a removed member's historical documents stay in team
// totals, while canUseOrgScope (above) blocks the removed member from
// requesting the data. Pin that asymmetry at the source level.
const accessSrc = readFileSync(join(repoRoot, 'app/api/_lib/access.js'), 'utf8');

test('team scope keeps historical (soft-deleted) member ids for attribution', () => {
  const scopeFn = accessSrc.slice(accessSrc.indexOf('export async function getOrgTeamScope'));
  const membershipQuery = scopeFn.slice(0, scopeFn.indexOf('profiles'));
  assert.ok(
    !membershipQuery.includes("is('deleted_at', null)"),
    'getOrgTeamScope must NOT filter memberships by deleted_at — historical docs stay in totals'
  );
});

test('caller membership check only accepts ACTIVE memberships', () => {
  const fn = accessSrc.slice(
    accessSrc.indexOf('export async function getActiveOrgMemberships'),
    accessSrc.indexOf('export async function getOrgTeamScope')
  );
  assert.ok(fn.includes(".is('deleted_at', null)"));
});
