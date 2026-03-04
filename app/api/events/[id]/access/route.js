import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getUserContext, requireEventPermission } from '@/app/api/_lib/access';

const VALID_PERMISSIONS = ['read', 'edit', 'manage'];

export async function GET(_request, { params }) {
  try {
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

    let targetUserId = body?.user_id || null;
    const targetEmail = (body?.email || '').trim().toLowerCase();

    if (!targetUserId && !targetEmail) {
      return NextResponse.json({ error: 'Provide user_id or email' }, { status: 400 });
    }

    if (!targetUserId) {
      const { data: profileByEmail } = await adminSupabase
        .from('profiles')
        .select('id')
        .ilike('email', targetEmail)
        .maybeSingle();
      if (!profileByEmail?.id) {
        return NextResponse.json({ error: 'User not found by email' }, { status: 404 });
      }
      targetUserId = profileByEmail.id;
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
