/**
 * Pure business rules for the Team (sub-organization) feature.
 *
 * Kept dependency-free so both the API routes and the node:test suites use
 * the exact same code — no simulation drift.
 *
 * Model recap (per the partner-company template):
 *   - everyone in an org sees the same team data (docs, stats, breakdown)
 *   - only owners and LoveLab admins manage members (invite/pause/remove)
 *   - owners can never create other owners or admins
 *   - owners can never poach a user who belongs to another org
 */

import { normalizeEmail } from '../auth/validation.js';

export const MAX_BULK_INVITES = 50;

/** Can this caller manage the org's members at all? */
export function canManageTeam({ callerIsAdmin = false, callerRole = null } = {}) {
  return callerIsAdmin === true || callerRole === 'owner';
}

/**
 * Membership role guardrail: only LoveLab admins may appoint owners.
 * Org owners always create plain members, whatever they asked for.
 */
export function resolveInviteRole({ callerIsAdmin = false, requestedRole = 'member' } = {}) {
  const wanted = requestedRole === 'owner' ? 'owner' : 'member';
  return callerIsAdmin ? wanted : 'member';
}

/**
 * Per-target management guardrail (pause / resend / remove).
 * Returns { allowed: true } or { allowed: false, error, status }.
 */
export function canManageTargetMember({
  callerIsAdmin = false,
  callerRole = null,
  targetRole = null,
  isSelf = false,
  targetExists = true,
} = {}) {
  if (!canManageTeam({ callerIsAdmin, callerRole })) {
    return { allowed: false, error: 'Only organization owners can manage members', status: 403 };
  }
  if (isSelf) {
    return { allowed: false, error: 'You cannot manage your own membership', status: 400 };
  }
  if (!targetExists) {
    return { allowed: false, error: 'Member not found in this organization', status: 404 };
  }
  if (targetRole === 'owner' && !callerIsAdmin) {
    return { allowed: false, error: 'Only admins can manage organization owners', status: 403 };
  }
  return { allowed: true };
}

/**
 * Normalize + dedupe a raw email list (bulk paste supports arrays or a
 * single string with comma/semicolon/whitespace separators).
 * Returns { emails } or { error, status }.
 *
 * Format validation stays per-email downstream so a bulk paste with one
 * typo still processes the valid addresses (partial-failure reporting).
 */
export function parseInviteEmails(raw, { max = MAX_BULK_INVITES } = {}) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/[\s,;\n]+/);

  const emails = [...new Set(
    list.map((e) => normalizeEmail(e)).filter(Boolean)
  )];

  if (emails.length === 0) {
    return { error: 'Missing user_id or email', status: 400 };
  }
  if (emails.length > max) {
    return { error: `Too many invitations — maximum ${max} per request`, status: 400 };
  }
  return { emails };
}

/**
 * Guardrails for inviting a specific target profile into an org.
 * Returns { ok: true } or { ok: false, error, status }.
 */
export function validateInviteTarget({
  existingProfile = null,
  organizationId,
  callerIsAdmin = false,
} = {}) {
  if (!existingProfile) return { ok: true };

  if (existingProfile.role === 'admin') {
    return {
      ok: false,
      error: 'This user is an administrator and cannot be added as a team member',
      status: 409,
    };
  }

  if (
    !callerIsAdmin &&
    existingProfile.organization_id &&
    existingProfile.organization_id !== organizationId
  ) {
    return {
      ok: false,
      error: 'This user already belongs to another organization',
      status: 409,
    };
  }

  return { ok: true };
}

/**
 * Per-agent commission rate for an org invite: new accounts inherit the org
 * rate; existing profiles keep whatever rate the admin configured (null =
 * leave unchanged). Owners can never set individual rates (no input here).
 */
export function resolveMemberCommissionRate({ existingProfile = null, organization = null } = {}) {
  if (existingProfile) return null;
  return organization?.commission_rate ?? null;
}

/**
 * Team data visibility: may this (non-admin) caller use the
 * `organization_id` scope? Requires an ACTIVE membership in that org —
 * any role. Admins are handled before this check.
 */
export function canUseOrgScope({ isAdmin = false, organizationId, memberships = [] } = {}) {
  if (!organizationId) return false;
  if (isAdmin) return true;
  return (memberships || []).some(
    (m) => m && m.organization_id === organizationId && !m.deleted_at
  );
}

/**
 * PostgREST OR-filter for team-scoped document queries.
 * Returns null when the scope is empty (caller should return an empty list).
 */
export function buildTeamScopeOrFilter({ memberIds = [], eventIds = [] } = {}) {
  const orParts = [];
  if (memberIds.length > 0) orParts.push(`created_by.in.(${memberIds.join(',')})`);
  if (eventIds.length > 0) orParts.push(`event_id.in.(${eventIds.join(',')})`);
  return orParts.length > 0 ? orParts.join(',') : null;
}
