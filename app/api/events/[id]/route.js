import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, requireEventPermission } from '@/app/api/_lib/access';

const VALID_TYPES = ['fair', 'agent', 'partner', 'other'];

export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'events-put' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
    const { allowed } = await requireEventPermission(adminSupabase, id, user.id, 'manage', isAdmin);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { name, type } = body;

    const trimmed = (name || '').trim();
    if (!trimmed) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });

    const updates = { name: trimmed };
    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) {
        return NextResponse.json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
      }
      updates.type = type;
    }

    const { data: event, error } = await adminSupabase
      .from('events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Events PUT] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update event. You may not have permission.' }, { status: 500 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'events-del' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
    }
    const { allowed } = await requireEventPermission(adminSupabase, id, user.id, 'manage', isAdmin);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Unlink documents from this event (set event_id to null) so they aren't orphaned
    await adminSupabase
      .from('documents')
      .update({ event_id: null })
      .eq('event_id', id);

    const { error } = await adminSupabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Events DELETE] Error:', error.message);
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
