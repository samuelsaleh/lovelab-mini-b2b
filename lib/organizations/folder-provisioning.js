import { createAdminClient } from '@/lib/supabase/server';

const DEFAULT_SUBFOLDERS = ['Contracts', 'Orders', 'Invoices', 'Other'];

/**
 * Ensures a root folder and default subfolders exist in the agent_folders table
 * for the given organization. Idempotent -- safe to call multiple times.
 *
 * @param {string} organizationId - The org UUID
 * @param {string} orgName - Display name for the root folder
 * @param {string} ownerAgentId - The agent_id to own the folders
 * @returns {{ rootFolder: object, subfolders: object[] }}
 */
export async function ensureOrgFoldersInDb(organizationId, orgName, ownerAgentId) {
  if (!organizationId || !ownerAgentId) {
    throw new Error('organizationId and ownerAgentId are required');
  }

  const adminSupabase = createAdminClient();
  const rootName = orgName || 'Organization';

  const { data: existingRoots } = await adminSupabase
    .from('agent_folders')
    .select('id, name')
    .eq('agent_id', ownerAgentId)
    .is('parent_id', null)
    .ilike('name', rootName);

  if (existingRoots && existingRoots.length > 0) {
    const rootFolder = existingRoots[0];
    const { data: existingSubs } = await adminSupabase
      .from('agent_folders')
      .select('id, name')
      .eq('parent_id', rootFolder.id);

    const existingNames = new Set((existingSubs || []).map((s) => s.name));
    const missingSubs = DEFAULT_SUBFOLDERS.filter((n) => !existingNames.has(n));

    if (missingSubs.length > 0) {
      const rows = missingSubs.map((name) => ({
        agent_id: ownerAgentId,
        name,
        parent_id: rootFolder.id,
      }));
      await adminSupabase.from('agent_folders').insert(rows);
    }

    const { data: allSubs } = await adminSupabase
      .from('agent_folders')
      .select('id, name, parent_id')
      .eq('parent_id', rootFolder.id);

    return { rootFolder, subfolders: allSubs || [] };
  }

  const { data: rootFolder, error: rootErr } = await adminSupabase
    .from('agent_folders')
    .insert({ agent_id: ownerAgentId, name: rootName, parent_id: null })
    .select('id, name')
    .single();

  if (rootErr) {
    console.error('[folder-provisioning] Failed to create root folder:', rootErr.message);
    throw rootErr;
  }

  const subRows = DEFAULT_SUBFOLDERS.map((name) => ({
    agent_id: ownerAgentId,
    name,
    parent_id: rootFolder.id,
  }));

  const { data: subfolders, error: subErr } = await adminSupabase
    .from('agent_folders')
    .insert(subRows)
    .select('id, name, parent_id');

  if (subErr) {
    console.error('[folder-provisioning] Failed to create subfolders:', subErr.message);
    throw subErr;
  }

  return { rootFolder, subfolders: subfolders || [] };
}

export { DEFAULT_SUBFOLDERS };
