import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireSession } from '@/lib/organizations/authz';

export async function GET() {
  try {
    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    const adminSupabase = createAdminClient();
    const admin = isAdmin(session.profile);

    let orgs;

    if (admin) {
      const { data, error } = await adminSupabase
        .from('organizations')
        .select('id, name')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      orgs = data || [];
    } else {
      const { data: userMemberships } = await adminSupabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .is('deleted_at', null);

      const userOrgIds = (userMemberships || []).map(m => m.organization_id);
      if (userOrgIds.length === 0) {
        return NextResponse.json({ orgFolders: [] });
      }

      const { data, error } = await adminSupabase
        .from('organizations')
        .select('id, name')
        .in('id', userOrgIds)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      orgs = data || [];
    }

    if (orgs.length === 0) {
      return NextResponse.json({ orgFolders: [] });
    }

    const orgIds = orgs.map(o => o.id);

    const { data: memberships } = await adminSupabase
      .from('organization_memberships')
      .select('organization_id, user_id, role')
      .in('organization_id', orgIds)
      .is('deleted_at', null);

    const membersByOrg = new Map();
    for (const m of memberships || []) {
      if (!membersByOrg.has(m.organization_id)) membersByOrg.set(m.organization_id, []);
      membersByOrg.get(m.organization_id).push(m);
    }

    const memberUserIds = [...new Set((memberships || []).map(m => m.user_id))];
    const { data: profiles } = await adminSupabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', memberUserIds);
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    const allOwnerIds = [];
    for (const [, members] of membersByOrg) {
      const owner = members.find(m => m.role === 'owner') || members[0];
      if (owner) allOwnerIds.push(owner.user_id);
    }

    const uniqueOwnerIds = [...new Set(allOwnerIds)];
    let rootByAgent = new Map();
    if (uniqueOwnerIds.length > 0) {
      const { data: rootFolders } = await adminSupabase
        .from('agent_folders')
        .select('id, name, agent_id, parent_id')
        .in('agent_id', uniqueOwnerIds)
        .is('parent_id', null);

      for (const f of rootFolders || []) {
        if (!rootByAgent.has(f.agent_id)) rootByAgent.set(f.agent_id, []);
        rootByAgent.get(f.agent_id).push(f);
      }
    }

    // Build org-to-root mapping first
    const orgRootMap = new Map();
    for (const org of orgs) {
      const members = membersByOrg.get(org.id) || [];
      const owner = members.find(m => m.role === 'owner') || members[0];
      const ownerId = owner?.user_id;
      const ownerRoots = rootByAgent.get(ownerId) || [];
      const matchingRoot = ownerRoots.find(f => f.name.toLowerCase() === org.name.toLowerCase()) || ownerRoots[0];
      if (matchingRoot) orgRootMap.set(org.id, matchingRoot);
    }

    // Fetch per-agent subfolders for all root folders
    const rootFolderIds = [...orgRootMap.values()].map(r => r.id);
    let subfoldersByParent = new Map();
    if (rootFolderIds.length > 0) {
      const { data: subfolders } = await adminSupabase
        .from('agent_folders')
        .select('id, name, agent_id, parent_id')
        .in('parent_id', rootFolderIds);

      for (const sf of subfolders || []) {
        if (!subfoldersByParent.has(sf.parent_id)) subfoldersByParent.set(sf.parent_id, []);
        subfoldersByParent.get(sf.parent_id).push(sf);
      }
    }

    const orgFolders = orgs.map(org => {
      const members = membersByOrg.get(org.id) || [];
      const matchingRoot = orgRootMap.get(org.id);
      const agentSubfolders = matchingRoot ? (subfoldersByParent.get(matchingRoot.id) || []) : [];

      const memberProfiles = members.map(m => {
        const p = profileMap.get(m.user_id);
        const subfolder = agentSubfolders.find(sf => sf.agent_id === m.user_id);
        return {
          user_id: m.user_id,
          role: m.role,
          full_name: p?.full_name || '',
          email: p?.email || '',
          subfolder_id: subfolder?.id || null,
          subfolder_name: subfolder?.name || null,
        };
      });

      return {
        organization_id: org.id,
        organization_name: org.name,
        root_folder_id: matchingRoot?.id || null,
        root_folder_name: matchingRoot?.name || org.name,
        member_count: members.length,
        members: memberProfiles,
        agent_subfolders: agentSubfolders.map(sf => ({
          id: sf.id,
          name: sf.name,
          agent_id: sf.agent_id,
        })),
      };
    });

    return NextResponse.json({ orgFolders });
  } catch (err) {
    console.error('[org-folders GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load organization folders' }, { status: 500 });
  }
}
