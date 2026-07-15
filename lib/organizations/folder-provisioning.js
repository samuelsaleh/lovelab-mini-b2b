import { createAdminClient } from '@/lib/supabase/server';

/**
 * Ensures a root folder exists in the agent_folders table for the given
 * organization. Uses organization_id for direct lookup to prevent collisions.
 * Idempotent -- safe to call multiple times.
 */
export async function ensureOrgRoot(organizationId, orgName, ownerAgentId) {
  if (!organizationId || !ownerAgentId) {
    throw new Error('organizationId and ownerAgentId are required');
  }

  const adminSupabase = createAdminClient();
  const rootName = orgName || 'Organization';

  const { data: existingRoot } = await adminSupabase
    .from('agent_folders')
    .select('id, name')
    .eq('organization_id', organizationId)
    .is('parent_id', null)
    .maybeSingle();

  if (existingRoot) {
    return { rootFolder: existingRoot };
  }

  const { data: rootFolder, error: rootErr } = await adminSupabase
    .from('agent_folders')
    .insert({
      agent_id: ownerAgentId,
      name: rootName,
      parent_id: null,
      organization_id: organizationId,
    })
    .select('id, name')
    .single();

  if (rootErr) {
    console.error('[folder-provisioning] Failed to create root folder:', rootErr.message);
    throw rootErr;
  }

  return { rootFolder };
}

/**
 * Ensures the fixed "Sub-agents" grouping folder exists under the org root.
 * All non-owner member folders live below this grouping folder; the owner's
 * own orders remain visible at the organization root.
 */
export async function ensureSubAgentsFolder(orgRootFolderId, ownerAgentId) {
  if (!orgRootFolderId || !ownerAgentId) {
    throw new Error('orgRootFolderId and ownerAgentId are required');
  }

  const adminSupabase = createAdminClient();
  const { data: existing } = await adminSupabase
    .from('agent_folders')
    .select('id, name, parent_id, agent_id')
    .eq('parent_id', orgRootFolderId)
    .eq('name', 'Sub-agents')
    .maybeSingle();

  if (existing) return { subAgentsFolder: existing };

  const { data: subAgentsFolder, error } = await adminSupabase
    .from('agent_folders')
    .insert({
      agent_id: ownerAgentId,
      name: 'Sub-agents',
      parent_id: orgRootFolderId,
    })
    .select('id, name, parent_id, agent_id')
    .single();

  if (error) {
    console.error('[folder-provisioning] Failed to create Sub-agents folder:', error.message);
    throw error;
  }
  return { subAgentsFolder };
}

/**
 * Ensures a per-agent subfolder exists under the "Sub-agents" folder.
 * Idempotent -- safe to call multiple times.
 */
export async function ensureAgentSubfolder(subAgentsFolderId, agentId, agentName) {
  if (!subAgentsFolderId || !agentId) {
    throw new Error('subAgentsFolderId and agentId are required');
  }

  const adminSupabase = createAdminClient();
  const folderName = agentName || 'Agent Folder';

  const { data: existingSubfolder } = await adminSupabase
    .from('agent_folders')
    .select('id, name, parent_id')
    .eq('agent_id', agentId)
    .eq('parent_id', subAgentsFolderId)
    .maybeSingle();

  if (existingSubfolder) {
    return { subfolder: existingSubfolder };
  }

  const { data: subfolder, error: subErr } = await adminSupabase
    .from('agent_folders')
    .insert({ agent_id: agentId, name: folderName, parent_id: subAgentsFolderId })
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
  const { subAgentsFolder } = await ensureSubAgentsFolder(rootFolder.id, ownerAgentId);
  if (agentId === ownerAgentId) {
    return { rootFolder, subAgentsFolder, subfolder: null };
  }
  const { subfolder } = await ensureAgentSubfolder(subAgentsFolder.id, agentId, agentName);
  return { rootFolder, subAgentsFolder, subfolder };
}

// Backward compatibility alias
export { ensureOrgRoot as ensureOrgFoldersInDb };
