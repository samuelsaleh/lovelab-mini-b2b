import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { inviteAssistant } from '@/lib/assistants/invite';
import { InviteError } from '@/lib/agents/invite';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ASSISTANT_SELECT = 'id, email, full_name, avatar_url, is_assistant, is_agent, role, has_password_set, created_at';

// GET - List all commercial assistants with their assigned fairs (admin only)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'assistants' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;
    if (!isAdmin(session.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const { data: assistants, error } = await adminSupabase
      .from('profiles')
      .select(ASSISTANT_SELECT)
      .eq('is_assistant', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Assistants GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load assistants' }, { status: 500 });
    }

    const assistantIds = (assistants || []).map((a) => a.id);
    const fairsByUser = new Map();
    if (assistantIds.length > 0) {
      const { data: accessRows, error: accessErr } = await adminSupabase
        .from('event_access')
        .select('user_id, permission, events:event_id(id, name, type, start_date, end_date)')
        .in('user_id', assistantIds);
      if (accessErr) {
        console.error('[Assistants GET] event_access error (non-blocking):', accessErr.message);
      }
      for (const row of accessRows || []) {
        if (!row.events) continue;
        if (!fairsByUser.has(row.user_id)) fairsByUser.set(row.user_id, []);
        fairsByUser.get(row.user_id).push({
          id: row.events.id,
          name: row.events.name,
          type: row.events.type,
          start_date: row.events.start_date,
          end_date: row.events.end_date,
          permission: row.permission,
        });
      }
    }

    return NextResponse.json({
      assistants: (assistants || []).map((a) => ({
        ...a,
        fairs: fairsByUser.get(a.id) || [],
      })),
    });
  } catch (err) {
    console.error('[Assistants GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Invite a new commercial assistant with a set of fairs (admin only)
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'assistants-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;
    if (!isAdmin(session.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { user } = session;

    const body = await request.json();
    const { email, full_name, event_ids, send_invite = true } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const emailLower = normalizeEmail(email);
    if (!isValidEmail(emailLower)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const eventIds = Array.isArray(event_ids) ? event_ids.filter((id) => UUID_REGEX.test(id)) : [];
    if (eventIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one fair for the assistant' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Only grant fairs that actually exist; names feed the invite email.
    const { data: events, error: eventsErr } = await adminSupabase
      .from('events')
      .select('id, name')
      .in('id', eventIds);
    if (eventsErr) {
      console.error('[Assistants POST] events lookup error:', eventsErr.message);
      return NextResponse.json({ error: 'Failed to verify selected fairs' }, { status: 500 });
    }
    if (!events || events.length === 0) {
      return NextResponse.json({ error: 'None of the selected fairs exist' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

    try {
      const result = await inviteAssistant(adminSupabase, {
        email: emailLower,
        fullName: full_name,
        eventIds: events.map((e) => e.id),
        eventNames: events.map((e) => e.name),
        invitedByUserId: user.id,
        sendInvite: send_invite,
        siteUrl,
      });
      return NextResponse.json({ assistant: result.assistant, created: result.created });
    } catch (inviteErr) {
      if (inviteErr instanceof InviteError) {
        console.error('[Assistants POST] Invite error:', inviteErr.message);
        return NextResponse.json({ error: inviteErr.message }, { status: inviteErr.status });
      }
      throw inviteErr;
    }
  } catch (err) {
    console.error('[Assistants POST] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
