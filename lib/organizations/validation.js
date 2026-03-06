/**
 * Validates an organization update payload.
 * Returns { valid: true, updates } or { valid: false, error }.
 */
export function validateOrgUpdate(body) {
  const allowedFields = ['name', 'territory', 'commission_rate', 'conditions'];
  const updates = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return { valid: false, error: 'No valid fields to update' };
  }

  if (updates.name !== undefined) {
    const trimmed = String(updates.name).trim();
    if (!trimmed) return { valid: false, error: 'Organization name cannot be empty' };
    updates.name = trimmed;
  }

  if (updates.commission_rate !== undefined && updates.commission_rate !== null) {
    const rate = Number(updates.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return { valid: false, error: 'Commission rate must be between 0 and 100' };
    }
    updates.commission_rate = rate;
  }

  if (updates.territory !== undefined) {
    updates.territory = updates.territory ? String(updates.territory).trim() : null;
  }

  if (updates.conditions !== undefined) {
    updates.conditions = updates.conditions ? String(updates.conditions).trim() : null;
  }

  return { valid: true, updates };
}

/**
 * Resolves the effective commission rate for an agent.
 * Agent's personal rate takes precedence; falls back to org rate.
 */
export function resolveEffectiveRate(agentRate, orgRate) {
  const personal = Number(agentRate) || 0;
  if (personal > 0) return personal;
  return Number(orgRate) || 0;
}

/**
 * Determines whether a user should be allowed access to an organization.
 * Pure decision function -- no DB calls.
 */
export function shouldAllowOrgAccess(profile, membership) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (!membership) return false;
  return !membership.deleted_at;
}
