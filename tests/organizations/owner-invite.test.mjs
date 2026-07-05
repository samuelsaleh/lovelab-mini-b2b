import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_BULK_INVITES,
  canManageTeam,
  resolveInviteRole,
  canManageTargetMember,
  parseInviteEmails,
  validateInviteTarget,
  resolveMemberCommissionRate,
} from '../../lib/organizations/team.js';

// ─────────────────────────────────────────────────────────────────────────────
// Who can manage the team
// ─────────────────────────────────────────────────────────────────────────────

test('canManageTeam: admins and org owners only', () => {
  assert.equal(canManageTeam({ callerIsAdmin: true }), true);
  assert.equal(canManageTeam({ callerRole: 'owner' }), true);
  assert.equal(canManageTeam({ callerRole: 'member' }), false);
  assert.equal(canManageTeam({ callerRole: null }), false);
  assert.equal(canManageTeam({}), false);
  assert.equal(canManageTeam(), false);
});

test('canManageTeam is not fooled by truthy non-values', () => {
  assert.equal(canManageTeam({ callerIsAdmin: 'yes' }), false);
  assert.equal(canManageTeam({ callerRole: 'Owner' }), false);
  assert.equal(canManageTeam({ callerRole: true }), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Role guardrail: owners can never create owners/admins
// ─────────────────────────────────────────────────────────────────────────────

test('resolveInviteRole: owner request by non-admin is downgraded to member', () => {
  assert.equal(resolveInviteRole({ callerIsAdmin: false, requestedRole: 'owner' }), 'member');
  assert.equal(resolveInviteRole({ callerIsAdmin: false, requestedRole: 'admin' }), 'member');
  assert.equal(resolveInviteRole({ callerIsAdmin: false, requestedRole: 'member' }), 'member');
  assert.equal(resolveInviteRole({ callerIsAdmin: false }), 'member');
});

test('resolveInviteRole: admins may appoint owners', () => {
  assert.equal(resolveInviteRole({ callerIsAdmin: true, requestedRole: 'owner' }), 'owner');
  assert.equal(resolveInviteRole({ callerIsAdmin: true, requestedRole: 'member' }), 'member');
  // Unknown roles never pass through, even for admins
  assert.equal(resolveInviteRole({ callerIsAdmin: true, requestedRole: 'admin' }), 'member');
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-target management (pause / resend / remove)
// ─────────────────────────────────────────────────────────────────────────────

test('canManageTargetMember: plain member gets 403', () => {
  const res = canManageTargetMember({ callerRole: 'member', targetRole: 'member' });
  assert.equal(res.allowed, false);
  assert.equal(res.status, 403);
});

test('canManageTargetMember: nobody manages themselves', () => {
  const res = canManageTargetMember({ callerRole: 'owner', isSelf: true });
  assert.equal(res.allowed, false);
  assert.equal(res.status, 400);
});

test('canManageTargetMember: missing target is 404', () => {
  const res = canManageTargetMember({ callerRole: 'owner', targetExists: false });
  assert.equal(res.allowed, false);
  assert.equal(res.status, 404);
});

test('canManageTargetMember: owners cannot manage other owners', () => {
  const res = canManageTargetMember({ callerRole: 'owner', targetRole: 'owner' });
  assert.equal(res.allowed, false);
  assert.equal(res.status, 403);
});

test('canManageTargetMember: admins can manage owners', () => {
  const res = canManageTargetMember({ callerIsAdmin: true, targetRole: 'owner' });
  assert.equal(res.allowed, true);
});

test('canManageTargetMember: owner manages a plain member', () => {
  const res = canManageTargetMember({ callerRole: 'owner', targetRole: 'member' });
  assert.equal(res.allowed, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bulk email parsing (single + bulk paste)
// ─────────────────────────────────────────────────────────────────────────────

test('parseInviteEmails: normalizes case and whitespace', () => {
  const res = parseInviteEmails(['  Sarah.Dupont@Example.COM ']);
  assert.deepEqual(res.emails, ['sarah.dupont@example.com']);
});

test('parseInviteEmails: dedupes case-insensitively', () => {
  const res = parseInviteEmails(['a@x.co', 'A@X.CO', ' a@x.co ']);
  assert.deepEqual(res.emails, ['a@x.co']);
});

test('parseInviteEmails: splits bulk paste on commas, semicolons and newlines', () => {
  const res = parseInviteEmails('a@x.co, b@x.co;c@x.co\nd@x.co');
  assert.deepEqual(res.emails, ['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co']);
});

test('parseInviteEmails: empty input is a 400', () => {
  for (const empty of [[], '', null, undefined, ' , ;\n ']) {
    const res = parseInviteEmails(empty);
    assert.equal(res.status, 400);
    assert.ok(res.error);
  }
});

test('parseInviteEmails: enforces the bulk cap', () => {
  const many = Array.from({ length: MAX_BULK_INVITES + 1 }, (_, i) => `agent${i}@x.co`);
  const res = parseInviteEmails(many);
  assert.equal(res.status, 400);
  assert.match(res.error, /maximum/i);

  const exactly = parseInviteEmails(many.slice(0, MAX_BULK_INVITES));
  assert.equal(exactly.emails.length, MAX_BULK_INVITES);
});

// ─────────────────────────────────────────────────────────────────────────────
// Invite-target guardrails
// ─────────────────────────────────────────────────────────────────────────────

test('validateInviteTarget: brand-new email is fine', () => {
  assert.equal(validateInviteTarget({ existingProfile: null, organizationId: 'org-1' }).ok, true);
});

test('validateInviteTarget: admins can never be added as team members', () => {
  const res = validateInviteTarget({
    existingProfile: { role: 'admin', organization_id: null },
    organizationId: 'org-1',
    callerIsAdmin: true,
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 409);
});

test('validateInviteTarget: owner cannot poach a user from another org', () => {
  const res = validateInviteTarget({
    existingProfile: { role: 'member', organization_id: 'org-other' },
    organizationId: 'org-1',
    callerIsAdmin: false,
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 409);
  assert.match(res.error, /another organization/i);
});

test('validateInviteTarget: admin may move a user between orgs', () => {
  const res = validateInviteTarget({
    existingProfile: { role: 'member', organization_id: 'org-other' },
    organizationId: 'org-1',
    callerIsAdmin: true,
  });
  assert.equal(res.ok, true);
});

test('validateInviteTarget: re-inviting into the same org is idempotent-friendly', () => {
  const res = validateInviteTarget({
    existingProfile: { role: 'member', organization_id: 'org-1' },
    organizationId: 'org-1',
    callerIsAdmin: false,
  });
  assert.equal(res.ok, true);
});

test('validateInviteTarget: existing user with no org can join', () => {
  const res = validateInviteTarget({
    existingProfile: { role: 'member', organization_id: null },
    organizationId: 'org-1',
    callerIsAdmin: false,
  });
  assert.equal(res.ok, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Commission rate defaults
// ─────────────────────────────────────────────────────────────────────────────

test('resolveMemberCommissionRate: new members inherit the org rate', () => {
  assert.equal(resolveMemberCommissionRate({ existingProfile: null, organization: { commission_rate: 8 } }), 8);
  assert.equal(resolveMemberCommissionRate({ existingProfile: null, organization: { commission_rate: 0 } }), 0);
});

test('resolveMemberCommissionRate: null when org has no rate', () => {
  assert.equal(resolveMemberCommissionRate({ existingProfile: null, organization: {} }), null);
  assert.equal(resolveMemberCommissionRate({ existingProfile: null, organization: null }), null);
});

test('resolveMemberCommissionRate: existing profiles keep their configured rate', () => {
  assert.equal(
    resolveMemberCommissionRate({
      existingProfile: { id: 'u1', commission_rate: 15 },
      organization: { commission_rate: 8 },
    }),
    null
  );
});
