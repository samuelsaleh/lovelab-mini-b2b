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

    const [{ data: profiles, error: profErr }, directChildResult] = await Promise.all([
      memberUserIds.length > 0
        ? adminSupabase.from('profiles').select('id, full_name, email').in('id', memberUserIds)
        : Promise.resolve({ data: [], error: null }),
      rootFolderIds.length > 0
        ? adminSupabase.from('agent_folders').select('id, name, agent_id, parent_id').in('parent_id', rootFolderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profErr) throw profErr;
    if (directChildResult.error) throw directChildResult.error;

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    const directChildren = directChildResult.data || [];
    const subAgentGroupIds = directChildren
      .filter((folder) => folder.name === 'Sub-agents')
      .map((folder) => folder.id);
    const { data: nestedAgentFolders, error: nestedErr } = subAgentGroupIds.length > 0
      ? await adminSupabase
        .from('agent_folders')
        .select('id, name, agent_id, parent_id')
        .in('parent_id', subAgentGroupIds)
      : { data: [], error: null };
    if (nestedErr) throw nestedErr;

    const subfoldersByParent = new Map();
    for (const sf of [...directChildren, ...(nestedAgentFolders || [])]) {
      if (!subfoldersByParent.has(sf.parent_id)) subfoldersByParent.set(sf.parent_id, []);
      subfoldersByParent.get(sf.parent_id).push(sf);
    }

    const orgFolders = orgs.map(org => {
      const members = membersByOrg.get(org.id) || [];
      const matchingRoot = orgRootMap.get(org.id);
      const rootChildren = matchingRoot ? (subfoldersByParent.get(matchingRoot.id) || []) : [];
      const subAgentsFolder = rootChildren.find((folder) => folder.name === 'Sub-agents') || null;
      // New hierarchy: member folders are nested under Sub-agents. Keep the
      // direct-child fallback during rollout so legacy trees remain readable
      // until the idempotent backfill reparents them.
      const agentSubfolders = subAgentsFolder
        ? (subfoldersByParent.get(subAgentsFolder.id) || [])
        : rootChildren.filter((folder) => folder.agent_id !== matchingRoot?.agent_id);

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
          doc_count: 0,
        };
      });

      return {
        organization_id: org.id,
        organization_name: org.name,
        root_folder_id: matchingRoot?.id || null,
        root_folder_name: matchingRoot?.name || org.name,
        sub_agents_folder_id: subAgentsFolder?.id || null,
        member_count: members.length,
        members: memberProfiles,
        agent_subfolders: agentSubfolders.map(sf => ({
          id: sf.id,
          name: sf.name,
          agent_id: sf.agent_id,
        })),
        doc_count: 0,
      };
    });

    // Phase 18b: server-authoritative doc_count per org folder.
    // The Documents sidebar previously filtered the in-memory documents array
    // (capped at 50 items) which made nicolas vial look like he had 0 orders
    // while his folder actually contained 5. The Phase 12 events-based count
    // covered events tagged with organization_id, but agent docs frequently
    // live in fair/partner events with no org tag, so those slipped through.
    //
    // We mirror the exact logic /api/documents uses when filtering by
    // organization_id: a doc "belongs to" an org if its created_by is a
    // member OR its event is in events.organization_id = org.id. Same
    // visibility filters apply (deleted_at IS NULL, exclude internal/
    // consignment/delete_from_stock channels).
    try {
      const allMemberIds = new Set();
      const memberOrgMap = new Map(); // user_id -> Set<org_id>
      for (const f of orgFolders) {
        for (const m of f.members) {
          allMemberIds.add(m.user_id);
          if (!memberOrgMap.has(m.user_id)) memberOrgMap.set(m.user_id, new Set());
          memberOrgMap.get(m.user_id).add(f.organization_id);
        }
      }

      const { data: orgEvents, error: orgEventsErr } = await adminSupabase
        .from('events')
        .select('id, organization_id')
        .in('organization_id', orgIds);
      if (orgEventsErr) throw orgEventsErr;
      const eventToOrg = new Map(
        (orgEvents || []).map((e) => [e.id, e.organization_id]),
      );
      const allOrgEventIds = (orgEvents || []).map((e) => e.id);

      const orParts = [];
      if (allMemberIds.size > 0) {
        orParts.push(`created_by.in.(${[...allMemberIds].join(',')})`);
      }
      if (allOrgEventIds.length > 0) {
        orParts.push(`event_id.in.(${allOrgEventIds.join(',')})`);
      }

      if (orParts.length > 0) {
        const { data: docs, error: docsErr } = await adminSupabase
          .from('documents')
          .select('id, created_by, event_id')
          .or(orParts.join(','))
          .is('deleted_at', null)
          .not('order_channel', 'in', '("internal","consignment","delete_from_stock","sample")');
        if (docsErr) throw docsErr;

        const countByOrg = new Map();
        // Per-member counts let the sidebar nest one child row per person under
        // the team. Keyed on created_by (never event_id) so an order that was
        // auto-filed into another member's folder before per-person folders
        // existed still counts for whoever actually made it.
        const countByOrgMember = new Map(); // `${org_id}|${user_id}` -> count
        const countedKeys = new Set(); // doc_id|org_id
        for (const d of docs || []) {
          const orgsForDoc = new Set();
          const memberOrgs = memberOrgMap.get(d.created_by);
          if (memberOrgs) for (const o of memberOrgs) orgsForDoc.add(o);
          if (d.event_id && eventToOrg.has(d.event_id)) {
            orgsForDoc.add(eventToOrg.get(d.event_id));
          }
          for (const oid of orgsForDoc) {
            const key = `${d.id}|${oid}`;
            if (countedKeys.has(key)) continue;
            countedKeys.add(key);
            countByOrg.set(oid, (countByOrg.get(oid) || 0) + 1);
            if (d.created_by && memberOrgs?.has(oid)) {
              const memberKey = `${oid}|${d.created_by}`;
              countByOrgMember.set(memberKey, (countByOrgMember.get(memberKey) || 0) + 1);
            }
          }
        }
        for (const f of orgFolders) {
          f.doc_count = countByOrg.get(f.organization_id) || 0;
          for (const m of f.members) {
            m.doc_count = countByOrgMember.get(`${f.organization_id}|${m.user_id}`) || 0;
          }
        }
      }
    } catch (countErr) {
      console.error('[org-folders GET] doc_count compute failed:', countErr.message);
      // Leave doc_count: 0 on every folder; the sidebar still falls back to
      // its in-memory filter when doc_count looks unset/zero.
    }

    return NextResponse.json({ orgFolders });
  } catch (err) {
    console.error('[org-folders GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load organization folders' }, { status: 500 });
  }
}
