import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// Simple ISO date validation (YYYY-MM-DD)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// GET - List all events
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'events' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: events, error } = await supabase
      .from('events')
      .select('*, documents(count)')
      .eq('created_by', user.id) // Ownership filter
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Events GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, location, start_date, end_date } = body;

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

    const { data: event, error } = await supabase
      .from('events')
      .insert({
        name: name.trim(),
        location: location?.trim() || null,
        start_date: start_date || null,
        end_date: end_date || null,
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
