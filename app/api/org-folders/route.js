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

    const { data: orgs, error: orgErr } = await adminSupabase
      .from('organizations')
      .select('id, name')
      .is('deleted_at', null)
      .order('name');
    if (orgErr) throw orgErr;

    if (!orgs || orgs.length === 0) {
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

    if (!admin) {
      const userOrgIds = (memberships || [])
        .filter(m => m.user_id === session.user.id)
        .map(m => m.organization_id);
      const allowed = new Set(userOrgIds);
      const filtered = orgs.filter(o => allowed.has(o.id));
      if (filtered.length === 0) {
        return NextResponse.json({ orgFolders: [] });
      }
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

    const { data: rootFolders } = await adminSupabase
      .from('agent_folders')
      .select('id, name, agent_id, parent_id')
      .in('agent_id', [...new Set(allOwnerIds)])
      .is('parent_id', null);

    const rootByAgent = new Map();
    for (const f of rootFolders || []) {
      if (!rootByAgent.has(f.agent_id)) rootByAgent.set(f.agent_id, []);
      rootByAgent.get(f.agent_id).push(f);
    }

    const orgFolders = orgs.map(org => {
      const members = membersByOrg.get(org.id) || [];
      const owner = members.find(m => m.role === 'owner') || members[0];
      const ownerId = owner?.user_id;

      const ownerRoots = rootByAgent.get(ownerId) || [];
      const matchingRoot = ownerRoots.find(f => f.name.toLowerCase() === org.name.toLowerCase()) || ownerRoots[0];

      const memberProfiles = members.map(m => {
        const p = profileMap.get(m.user_id);
        return {
          user_id: m.user_id,
          role: m.role,
          full_name: p?.full_name || '',
          email: p?.email || '',
        };
      });

      return {
        organization_id: org.id,
        organization_name: org.name,
        root_folder_id: matchingRoot?.id || null,
        root_folder_name: matchingRoot?.name || org.name,
        member_count: members.length,
        members: memberProfiles,
      };
    });

    const visibleOrgs = admin
      ? orgFolders
      : orgFolders.filter(o => {
          const members = membersByOrg.get(o.organization_id) || [];
          return members.some(m => m.user_id === session.user.id);
        });

    return NextResponse.json({ orgFolders: visibleOrgs });
  } catch (err) {
    console.error('[org-folders GET]', err);
    return NextResponse.json({ error: 'Failed to load organization folders' }, { status: 500 });
  }
}
