import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, requireEventPermission } from '@/app/api/_lib/access';

const VALID_PERMISSIONS = ['read', 'edit', 'manage'];

export async function GET(_request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(_request, { maxRequests: 30, prefix: 'event-access-get' });
    if (rateLimitRes) return rateLimitRes;

    const { id: eventId } = await params;
    if (!eventId) return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await requireEventPermission(adminSupabase, eventId, user.id, 'manage', isAdmin);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: rows, error } = await adminSupabase
      .from('event_access')
      .select('event_id, user_id, granted_by, permission, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to load access list' }, { status: 500 });
    }

    const userIds = (rows || []).map((r) => r.user_id);
    let profileMap = new Map();
    if (userIds.length > 0) {
      const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    }

    const enriched = (rows || []).map((row) => ({
      ...row,
      profiles: profileMap.get(row.user_id) || null,
    }));
    return NextResponse.json({ access: enriched });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'event-access-post' });
    if (rateLimitRes) return rateLimitRes;

    const { id: eventId } = await params;
    if (!eventId) return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await requireEventPermission(adminSupabase, eventId, user.id, 'manage', isAdmin);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const permission = body?.permission;
    if (!VALID_PERMISSIONS.includes(permission)) {
      return NextResponse.json({ error: 'Invalid permission' }, { status: 400 });
    }

    // Sam, 14 Sep 2026: "how can I add Sarah's whole organization to the
    // fair?" — one call grants every current member of a team.
    if (body?.organization_id) {
      return grantTeam(adminSupabase, { eventId, organizationId: String(body.organization_id), permission, grantedBy: user.id });
    }

    let targetUserId = body?.user_id || null;
    const targetEmail = (body?.email || '').trim().toLowerCase();
    let resolvedTargetEmail = targetEmail;

    if (!targetUserId && !targetEmail) {
      return NextResponse.json({ error: 'Provide user_id, email or organization_id' }, { status: 400 });
    }

    if (!targetUserId) {
      const { data: profileByEmail } = await adminSupabase
        .from('profiles')
        .select('id, email')
        .ilike('email', targetEmail)
        .maybeSingle();
      if (!profileByEmail?.id) {
        return NextResponse.json({ error: 'User not found by email' }, { status: 404 });
      }
      targetUserId = profileByEmail.id;
      resolvedTargetEmail = (profileByEmail.email || targetEmail).trim().toLowerCase();
    } else if (!resolvedTargetEmail) {
      const { data: profileById } = await adminSupabase
        .from('profiles')
        .select('email')
        .eq('id', targetUserId)
        .maybeSingle();
      resolvedTargetEmail = (profileById?.email || '').trim().toLowerCase();
    }

    if (!resolvedTargetEmail) {
      return NextResponse.json({ error: 'Target user has no email address' }, { status: 400 });
    }

    const { data: eventRow } = await adminSupabase
      .from('events')
      .select('created_by')
      .eq('id', eventId)
      .maybeSingle();
    if (!eventRow) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    if (eventRow.created_by === targetUserId) {
      return NextResponse.json({ error: 'Owner already has implicit manage access' }, { status: 400 });
    }

    const { data: row, error } = await adminSupabase
      .from('event_access')
      .upsert({
        event_id: eventId,
        user_id: targetUserId,
        // Legacy production schema requires this denormalized email in
        // addition to the authoritative user_id.
        user_email: resolvedTargetEmail,
        granted_by: user.id,
        permission,
      }, { onConflict: 'event_id,user_id' })
      .select('event_id, user_id, granted_by, permission, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 });
    }

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', row.user_id)
      .maybeSingle();

    return NextResponse.json({ access: { ...row, profiles: profile || null } });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Grant a whole team at once. Members are the organisation's live
 * memberships plus any agent profile that carries the organisation id (the
 * two have drifted in the past). The fair's owner already has access and is
 * skipped; so is anyone without an email, which the legacy access row needs.
 */
async function grantTeam(adminSupabase, { eventId, organizationId, permission, grantedBy }) {
  const { data: organization } = await adminSupabase
    .from('organizations')
    .select('id, name')
    .eq('id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!organization) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  const [{ data: memberships }, { data: byProfile }, { data: eventRow }] = await Promise.all([
    adminSupabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).is('deleted_at', null),
    adminSupabase.from('profiles').select('id').eq('organization_id', organizationId).is('agent_deleted_at', null),
    adminSupabase.from('events').select('created_by').eq('id', eventId).maybeSingle(),
  ]);
  if (!eventRow) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const ids = new Set([
    ...(memberships || []).map((m) => m.user_id),
    ...(byProfile || []).map((p) => p.id),
  ]);
  ids.delete(eventRow.created_by);
  if (ids.size === 0) {
    return NextResponse.json({ error: `${organization.name} has no members to invite` }, { status: 400 });
  }

  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, full_name, email, agent_status')
    .in('id', [...ids]);
  const members = (profiles || []).filter((p) => p.email && p.agent_status !== 'inactive');
  if (members.length === 0) {
    return NextResponse.json({ error: `${organization.name} has no active members to invite` }, { status: 400 });
  }

  const rows = members.map((p) => ({
    event_id: eventId,
    user_id: p.id,
    user_email: String(p.email).trim().toLowerCase(),
    granted_by: grantedBy,
    permission,
  }));
  const { data: saved, error } = await adminSupabase
    .from('event_access')
    .upsert(rows, { onConflict: 'event_id,user_id' })
    .select('event_id, user_id, granted_by, permission, created_at');
  if (error) {
    console.error('[event-access POST] team grant failed:', error.message);
    return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 });
  }

  const byId = new Map(members.map((p) => [p.id, { id: p.id, full_name: p.full_name, email: p.email }]));
  return NextResponse.json({
    organization: { id: organization.id, name: organization.name },
    granted: (saved || []).length,
    access: (saved || []).map((row) => ({ ...row, profiles: byId.get(row.user_id) || null })),
  });
}
