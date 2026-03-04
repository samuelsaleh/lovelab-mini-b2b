import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getUserContext, requireEventPermission } from '@/app/api/_lib/access';

const VALID_PERMISSIONS = ['read', 'edit', 'manage'];

export async function PATCH(request, { params }) {
  try {
    const { id: eventId, userId } = await params;
    if (!eventId || !userId) {
      return NextResponse.json({ error: 'Missing event ID or user ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await requireEventPermission(adminSupabase, eventId, user.id, 'manage', isAdmin);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { permission } = await request.json();
    if (!VALID_PERMISSIONS.includes(permission)) {
      return NextResponse.json({ error: 'Invalid permission' }, { status: 400 });
    }

    const { data: row, error } = await adminSupabase
      .from('event_access')
      .update({ permission })
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .select('event_id, user_id, granted_by, permission, created_at')
      .single();

    if (error) return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 });
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

export async function DELETE(_request, { params }) {
  try {
    const { id: eventId, userId } = await params;
    if (!eventId || !userId) {
      return NextResponse.json({ error: 'Missing event ID or user ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await requireEventPermission(adminSupabase, eventId, user.id, 'manage', isAdmin);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await adminSupabase
      .from('event_access')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
