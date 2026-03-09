import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'org-folders' });
    if (rateLimitRes) return rateLimitRes;

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
      const { data: userMemberships, error: memErr } = await adminSupabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .is('deleted_at', null);
      if (memErr) throw memErr;

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

    // Parallel: fetch memberships and root folders at the same time
    const [{ data: memberships, error: memErr2 }, { data: rootFolders, error: rfErr }] = await Promise.all([
      adminSupabase
        .from('organization_memberships')
        .select('organization_id, user_id, role')
        .in('organization_id', orgIds)
        .is('deleted_at', null),
      adminSupabase
        .from('agent_folders')
        .select('id, name, agent_id, parent_id, organization_id')
        .in('organization_id', orgIds)
        .is('parent_id', null),
    ]);
    if (memErr2) throw memErr2;
    if (rfErr) throw rfErr;

    const membersByOrg = new Map();
    for (const m of memberships || []) {
      if (!membersByOrg.has(m.organization_id)) membersByOrg.set(m.organization_id, []);
      membersByOrg.get(m.organization_id).push(m);
    }

    // Build org-to-root mapping directly via organization_id
    const orgRootMap = new Map();
    for (const f of rootFolders || []) {
      if (f.organization_id && !orgRootMap.has(f.organization_id)) {
        orgRootMap.set(f.organization_id, f);
      }
    }

    // Parallel: fetch profiles and subfolders
    const memberUserIds = [...new Set((memberships || []).map(m => m.user_id))];
    const rootFolderIds = [...orgRootMap.values()].map(r => r.id);

    const [{ data: profiles, error: profErr }, subfolderResult] = await Promise.all([
      memberUserIds.length > 0
        ? adminSupabase.from('profiles').select('id, full_name, email').in('id', memberUserIds)
        : Promise.resolve({ data: [], error: null }),
      rootFolderIds.length > 0
        ? adminSupabase.from('agent_folders').select('id, name, agent_id, parent_id').in('parent_id', rootFolderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profErr) throw profErr;
    if (subfolderResult.error) throw subfolderResult.error;

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    const subfoldersByParent = new Map();
    for (const sf of subfolderResult.data || []) {
      if (!subfoldersByParent.has(sf.parent_id)) subfoldersByParent.set(sf.parent_id, []);
      subfoldersByParent.get(sf.parent_id).push(sf);
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
