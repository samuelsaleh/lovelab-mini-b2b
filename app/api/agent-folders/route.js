import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { resolveAgentIds } from '@/app/api/_lib/access';

async function getAuthorizedUser(supabase, adminSupabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role, is_agent')
    .eq('id', user.id)
    .single();
  return { user, isAdmin: profile?.role === 'admin', isAgent: profile?.is_agent === true };
}

// GET /api/agent-folders?agent_id=&parent_id=&organization_id=
// Lists folders at a given level. parent_id=null lists root folders.
// When organization_id is provided, returns folders for all org members.
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'agent-folders-get' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin, isAgent } = await getAuthorizedUser(supabase, adminSupabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');
    const organizationId = searchParams.get('organization_id') || null;
    const parentId = searchParams.get('parent_id') || null;

    if (!agentId && !organizationId) {
      return NextResponse.json({ error: 'agent_id or organization_id is required' }, { status: 400 });
    }

    let targetIds = [];

    if (organizationId) {
      const { data: members, error: memErr } = await adminSupabase
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', organizationId)
        .is('deleted_at', null);
      if (memErr) throw memErr;
      targetIds = (members || []).map((m) => m.user_id);

      if (!isAdmin) {
        const isMember = targetIds.includes(user.id);
        if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const allIds = await resolveAgentIds(adminSupabase, agentId);
      if (!isAdmin && !allIds.includes(user.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      targetIds = allIds;
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ folders: [] });
    }

    let query = adminSupabase
      .from('agent_folders')
      .select('id, name, parent_id, agent_id, created_at')
      .in('agent_id', targetIds)
      .order('name', { ascending: true });

    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }

    const { data: folders, error } = await query;
    if (error) {
      console.error('[agent-folders GET]', error.message);
      return NextResponse.json({ error: 'Failed to load folders' }, { status: 500 });
    }

    return NextResponse.json({ folders: folders || [] });
  } catch (err) {
    console.error('[agent-folders GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/agent-folders — create a subfolder
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'agent-folders-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getAuthorizedUser(supabase, adminSupabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { agent_id, name, parent_id } = await request.json();

    if (!agent_id || !name?.trim()) {
      return NextResponse.json({ error: 'agent_id and name are required' }, { status: 400 });
    }

    const postAllIds = await resolveAgentIds(adminSupabase, agent_id);
    if (!isAdmin && !postAllIds.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify parent folder belongs to the same agent (if provided)
    if (parent_id) {
      const { data: parentFolder } = await adminSupabase
        .from('agent_folders')
        .select('agent_id')
        .eq('id', parent_id)
        .single();
      if (!parentFolder || !postAllIds.includes(parentFolder.agent_id)) {
        return NextResponse.json({ error: 'Invalid parent folder' }, { status: 400 });
      }
    }

    const { data: folder, error } = await adminSupabase
      .from('agent_folders')
      .insert({ agent_id, name: name.trim(), parent_id: parent_id || null, created_by: user.id })
      .select()
      .single();

    if (error) {
      console.error('[agent-folders POST]', error.message);
      return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
    }

    return NextResponse.json({ folder });
  } catch (err) {
    console.error('[agent-folders POST] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
