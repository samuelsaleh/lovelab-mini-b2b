import { createAdminClient } from '@/lib/supabase/server';

/**
 * Ensures a root folder exists in the agent_folders table for the given
 * organization. Idempotent -- safe to call multiple times.
 */
export async function ensureOrgRoot(organizationId, orgName, ownerAgentId) {
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

/**
 * Ensures a per-agent subfolder exists under the org root folder.
 * Each agent in an org gets their own subfolder for their documents.
 * Idempotent -- safe to call multiple times.
 */
export async function ensureAgentSubfolder(orgRootFolderId, agentId, agentName) {
  if (!orgRootFolderId || !agentId) {
    throw new Error('orgRootFolderId and agentId are required');
  }

  const adminSupabase = createAdminClient();
  const folderName = agentName || 'Agent Folder';

  const { data: existingSubfolder } = await adminSupabase
    .from('agent_folders')
    .select('id, name, parent_id')
    .eq('agent_id', agentId)
    .eq('parent_id', orgRootFolderId)
    .maybeSingle();

  if (existingSubfolder) {
    return { subfolder: existingSubfolder };
  }

  const { data: subfolder, error: subErr } = await adminSupabase
    .from('agent_folders')
    .insert({ agent_id: agentId, name: folderName, parent_id: orgRootFolderId })
    .select('id, name, parent_id')
    .single();

  if (subErr) {
    console.error('[folder-provisioning] Failed to create agent subfolder:', subErr.message);
    throw subErr;
  }

  return { subfolder };
}

/**
 * Convenience function that ensures both the org root folder and the agent's
 * subfolder exist. Use this when adding an agent to an organization.
 */
export async function ensureAgentFolders(organizationId, orgName, ownerAgentId, agentId, agentName) {
  const { rootFolder } = await ensureOrgRoot(organizationId, orgName, ownerAgentId);
  const { subfolder } = await ensureAgentSubfolder(rootFolder.id, agentId, agentName);
  return { rootFolder, subfolder };
}

// Backward compatibility alias
export { ensureOrgRoot as ensureOrgFoldersInDb };
