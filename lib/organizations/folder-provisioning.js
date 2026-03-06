import { createAdminClient } from '@/lib/supabase/server';

/**
 * Ensures a root folder exists in the agent_folders table for the given
 * organization. Agents create their own subfolders as needed.
 * Idempotent -- safe to call multiple times.
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
    return { rootFolder: existingRoots[0] };
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

  return { rootFolder };
}
