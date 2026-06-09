/**
 * Helpers for the pack_visibility join table (Phase 26).
 *
 * A "restricted" pack is visible only to the agents listed in pack_visibility
 * (plus admins, via RLS). These helpers run with the admin client so they can
 * read/replace the assignment set regardless of RLS.
 */

/**
 * Replace the full set of agents allowed to see a pack. Passing an empty (or
 * missing) list clears all assignments — e.g. when a pack stops being
 * restricted.
 */
export async function syncPackVisibility(adminSupabase, packId, agentIds) {
  const ids = Array.isArray(agentIds)
    ? [...new Set(agentIds.filter((id) => typeof id === 'string' && id))]
    : []

  // Replace the set: delete existing rows, then insert the new ones.
  const { error: delErr } = await adminSupabase
    .from('pack_visibility')
    .delete()
    .eq('pack_id', packId)
  if (delErr) throw new Error(delErr.message)

  if (ids.length === 0) return

  const rows = ids.map((agent_id) => ({ pack_id: packId, agent_id }))
  const { error: insErr } = await adminSupabase
    .from('pack_visibility')
    .insert(rows)
  if (insErr) throw new Error(insErr.message)
}

/**
 * Return a map of { [pack_id]: [agent_id, ...] } for the given pack ids. Used
 * by the admin pack list so the editor can pre-check the right agents.
 */
export async function fetchAgentIdsForPacks(adminSupabase, packIds) {
  const map = {}
  if (!Array.isArray(packIds) || packIds.length === 0) return map

  const { data, error } = await adminSupabase
    .from('pack_visibility')
    .select('pack_id, agent_id')
    .in('pack_id', packIds)
  if (error) throw new Error(error.message)

  for (const row of data || []) {
    if (!map[row.pack_id]) map[row.pack_id] = []
    map[row.pack_id].push(row.agent_id)
  }
  return map
}
