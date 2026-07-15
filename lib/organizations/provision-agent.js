import { createAdminClient } from '@/lib/supabase/server';
import { ensureOrgRoot, ensureSubAgentsFolder, ensureAgentSubfolder } from './folder-provisioning';

/**
 * Full provisioning flow for adding an agent to an organization:
 * 1. Fetch org details
 * 2. Find the org owner (for root folder ownership)
 * 3. Ensure org root folder exists
 * 4. Ensure agent subfolder exists
 *
 * Idempotent and non-throwing -- returns { rootFolder, subfolder } or null on failure.
 */
export async function provisionAgentInOrg(orgId, agentId) {
  if (!orgId || !agentId) return null;

  const adminSupabase = createAdminClient();

  const { data: org } = await adminSupabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  if (!org) return null;

  const { data: ownerMembership } = await adminSupabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'owner')
    .maybeSingle();

  const { data: agentProfile } = await adminSupabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', agentId)
    .single();

  const ownerAgentId = ownerMembership?.user_id || agentId;
  const agentName = agentProfile?.full_name || agentProfile?.email || 'Agent';

  const { rootFolder } = await ensureOrgRoot(orgId, org.name, ownerAgentId);
  const { subAgentsFolder } = await ensureSubAgentsFolder(rootFolder.id, ownerAgentId);
  const { subfolder } = agentId === ownerAgentId
    ? { subfolder: null }
    : await ensureAgentSubfolder(subAgentsFolder.id, agentId, agentName);

  return { rootFolder, subAgentsFolder, subfolder };
}

/**
 * Ensures the complete folder tree for every active member in an organization:
 *
 *   Organization root (owner)
 *   └── Sub-agents
 *       ├── Member A
 *       └── Member B
 *
 * The owner intentionally has no child folder; their documents remain at root.
 * Idempotent and safe for self-healing endpoints and repair scripts.
 */
export async function provisionOrganizationFolders(orgId) {
  if (!orgId) return null;
  const adminSupabase = createAdminClient();

  const [{ data: org, error: orgError }, { data: memberships, error: memberError }] = await Promise.all([
    adminSupabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .is('deleted_at', null)
      .single(),
    adminSupabase
      .from('organization_memberships')
      .select('user_id, role, profiles:user_id(full_name, email)')
      .eq('organization_id', orgId)
      .is('deleted_at', null),
  ]);
  if (orgError) throw orgError;
  if (memberError) throw memberError;

  const owner = (memberships || []).find((m) => m.role === 'owner');
  if (!owner?.user_id) throw new Error('Organization must have an active owner');

  const { rootFolder } = await ensureOrgRoot(org.id, org.name, owner.user_id);
  const { subAgentsFolder } = await ensureSubAgentsFolder(rootFolder.id, owner.user_id);
  const subfolders = [];
  for (const member of memberships || []) {
    if (member.user_id === owner.user_id) continue;
    const name = member.profiles?.full_name || member.profiles?.email || 'Agent';
    const { subfolder } = await ensureAgentSubfolder(subAgentsFolder.id, member.user_id, name);
    subfolders.push(subfolder);
  }
  return { rootFolder, subAgentsFolder, subfolders };
}

/**
 * Auto-ensure organization for an agent profile: if the profile has no org,
 * create one. Then provision folders. Called directly (no HTTP round-trip).
 *
 * @param {string} targetUserId - The user to ensure an org for
 * @param {string} callerUserId - The authenticated caller (for created_by)
 * @returns {{ organization, folder }} or throws
 */
export async function autoEnsureOrganization(targetUserId, callerUserId) {
  const adminSupabase = createAdminClient();

  const { data: profile, error: profileErr } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name, organization_id')
    .eq('id', targetUserId)
    .single();
  if (profileErr) throw profileErr;

  let organization = null;

  if (profile.organization_id) {
    const { data: existingOrg, error: orgErr } = await adminSupabase
      .from('organizations')
      .select('id, name')
      .eq('id', profile.organization_id)
      .single();
    if (orgErr) throw orgErr;
    organization = existingOrg;
  } else {
    // Remove any stale memberships from a previous org before creating a new one
    try {
      await adminSupabase
        .from('organization_memberships')
        .delete()
        .eq('user_id', profile.id);
    } catch (cleanupErr) {
      console.error('[auto-ensure] Stale membership cleanup error (non-blocking):', cleanupErr.message);
    }

    const orgName =
      `${(profile.full_name || profile.email || 'Agent').trim()} Organization`.trim();

    const { data: createdOrg, error: createErr } = await adminSupabase
      .from('organizations')
      .insert({ name: orgName, created_by: callerUserId })
      .select('id, name')
      .single();
    if (createErr) throw createErr;
    organization = createdOrg;

    await adminSupabase
      .from('profiles')
      .update({ organization_id: organization.id })
      .eq('id', profile.id);

    await adminSupabase
      .from('organization_memberships')
      .upsert(
        { organization_id: organization.id, user_id: profile.id, role: 'owner' },
        { onConflict: 'organization_id,user_id' }
      );
  }

  let folder = null;
  try {
    folder = await provisionAgentInOrg(organization.id, profile.id);
  } catch (folderErr) {
    console.error('[auto-ensure] Folder provisioning error (non-blocking):', folderErr.message);
  }

  return { organization, folder, profile };
}
