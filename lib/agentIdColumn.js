/**
 * Runtime guard for the documents.agent_id column (added by
 * supabase/migrations/20260818130000_documents_agent_id.sql).
 *
 * The write routes must NOT reference agent_id until the migration is applied,
 * otherwise every order save would fail with "column agent_id does not exist"
 * on an environment that is a migration behind. We probe once per process and
 * cache the result, mirroring the new_client_bonus_mode probe in
 * lib/commissionAttribution.js.
 */

let cached = null;

export async function documentsHaveAgentIdColumn(adminSupabase) {
  if (cached !== null) return cached;
  try {
    const query = adminSupabase.from('documents').select('agent_id');
    // Some lightweight clients/test doubles do not expose PostgREST's limit().
    // Treat an incomplete client like a migration-behind environment instead
    // of crashing every document save.
    if (!query || typeof query.limit !== 'function') {
      cached = false;
      return cached;
    }
    const { error } = await query.limit(1);
    cached = !error;
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * Normalize a client-supplied agent_id for persistence.
 *   - If a valid, non-deleted agent id is supplied, use it.
 *   - Else, if the creator is themselves an agent, default to the creator
 *     (so an agent's own order carries their agent_id without them picking).
 *   - Else null (admin/office order with no agent chosen).
 *
 * @returns {Promise<string|null>}
 */
export async function normalizeAgentId(adminSupabase, suppliedAgentId, { creatorId, creatorIsAgent } = {}) {
  if (suppliedAgentId) {
    const { data: agent } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('id', suppliedAgentId)
      .eq('is_agent', true)
      .in('agent_status', ['active', 'invited'])
      .is('agent_deleted_at', null)
      .maybeSingle();
    if (agent) return agent.id;
  }
  if (!suppliedAgentId && creatorIsAgent && creatorId) return creatorId;
  return null;
}
