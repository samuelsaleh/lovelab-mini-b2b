/**
 * Who settles an agent's commissions: the agent alone, or their organization?
 *
 * A multi-member organization (Phase 31) is paid once, through its owner:
 * one report keyed to the owner's profile, one payment recorded on the
 * owner. Anything that looks up "this agent's report" must therefore look
 * at the owner's reports when the agent is a member of such an org.
 *
 * Shared by POST /api/agent-payments (refuses per-member payments) and
 * PATCH /api/commissions/[id]/reported (links a member's line to the org
 * report instead of searching for a report in the member's own name).
 */

/**
 * @param {object} adminSupabase  service-role client
 * @param {string} agentId        profile id of the agent whose line/payment it is
 * @param {{ organizationId?: string|null }} [opts]  pass the agent's
 *   `organization_id` when the caller already loaded the profile (null means
 *   "known to have none"); leave it out and the profile is read here.
 * @returns {Promise<null | { organizationId: string, ownerId: string|null, multiMember: boolean }>}
 *   null when the agent is not in an organization.
 */
export async function getOrgSettlementScope(adminSupabase, agentId, { organizationId: knownOrgId } = {}) {
  if (!agentId) return null;

  let organizationId = knownOrgId || null;
  if (knownOrgId === undefined) {
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('organization_id')
      .eq('id', agentId)
      .single();
    organizationId = profile?.organization_id || null;
  }
  if (!organizationId) return null;

  const { data: activeMembers, error } = await adminSupabase
    .from('organization_memberships')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
  if (error) throw error;

  const members = activeMembers || [];
  const owner = members.find((m) => m.role === 'owner') || null;
  return {
    organizationId,
    ownerId: owner?.user_id || null,
    multiMember: members.length > 1,
  };
}

/**
 * The organization an archived report was generated for, if any. Org reports
 * carry it in their snapshot (`snapshot_data.organization`); per-agent
 * reports have no such key.
 */
export function reportOrganizationId(report) {
  const org = report?.organization ?? report?.snapshot_data?.organization;
  return org && typeof org === 'object' ? org.id || null : null;
}
