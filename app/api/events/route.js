import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { getUserContext, resolveAgentIds } from '@/app/api/_lib/access';

// Simple ISO date validation (YYYY-MM-DD)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// GET - List all events
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'events' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rawEvents, error } = await adminSupabase
      .from('events')
      .select('*, documents(count)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Events GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
    }

    const raw = rawEvents || [];
    let events = raw;

    if (!isAdmin) {
      const userIds = await resolveAgentIds(adminSupabase, user.id);

      let accessRows = [];
      const { data, error: accessErr } = await adminSupabase
        .from('event_access')
        .select('event_id, permission')
        .in('user_id', userIds);
      if (!accessErr) {
        accessRows = data || [];
      }

      const accessByEvent = new Map(accessRows.map((row) => [row.event_id, row.permission]));
      events = raw
        .filter((evt) => userIds.includes(evt.created_by) || accessByEvent.has(evt.id))
        .map((evt) => ({
          ...evt,
          permission: userIds.includes(evt.created_by) ? 'manage' : accessByEvent.get(evt.id),
        }));
    } else {
      events = raw.map((evt) => ({ ...evt, permission: 'manage' }));
    }

    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new event
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'events-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user } = await getUserContext(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, location, start_date, end_date, type, organization_id } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Event name is required' }, { status: 400 });
    }

    // Validate dates if provided
    if (start_date && !ISO_DATE_REGEX.test(start_date)) {
      return NextResponse.json({ error: 'Invalid start date format (use YYYY-MM-DD)' }, { status: 400 });
    }
    if (end_date && !ISO_DATE_REGEX.test(end_date)) {
      return NextResponse.json({ error: 'Invalid end date format (use YYYY-MM-DD)' }, { status: 400 });
    }
    if (start_date && end_date && end_date < start_date) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    const validTypes = ['fair', 'agent', 'partner', 'other'];
    const eventType = validTypes.includes(type) ? type : 'other';

    const { data: event, error } = await adminSupabase
      .from('events')
      .insert({
        name: name.trim(),
        location: location?.trim() || null,
        start_date: start_date || null,
        end_date: end_date || null,
        type: eventType,
        organization_id: (eventType === 'agent' && organization_id) ? organization_id : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Events POST] Error:', error.message);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
