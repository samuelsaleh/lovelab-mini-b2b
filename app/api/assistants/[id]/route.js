import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { setAssistantEventAccess } from '@/lib/assistants/invite';
import { InviteError, resendAgentInvite } from '@/lib/agents/invite';
import { revokeAccess } from '@/lib/agents/access';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSISTANT_SELECT = 'id, email, full_name, avatar_url, is_assistant, is_agent, role, has_password_set, created_at';

async function requireAdminAndAssistant(request, params) {
  const supabase = await createClient();
  const session = await requireSession(supabase);
  if (session.error) return { errorResponse: session.error };
  if (!isAdmin(session.profile)) {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const { id } = await params;
  if (!id || !UUID_REGEX.test(id)) {
    return { errorResponse: NextResponse.json({ error: 'Invalid assistant ID' }, { status: 400 }) };
  }

  const adminSupabase = createAdminClient();
  const { data: assistant } = await adminSupabase
    .from('profiles')
    .select(ASSISTANT_SELECT)
    .eq('id', id)
    .eq('is_assistant', true)
    .maybeSingle();

  if (!assistant) {
    return { errorResponse: NextResponse.json({ error: 'Assistant not found' }, { status: 404 }) };
  }

  return { session, adminSupabase, assistant, id };
}

// PUT - Update an assistant's name / fair list, or re-send the invite (admin only)
export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'assistant-update' });
    if (rateLimitRes) return rateLimitRes;

    const ctx = await requireAdminAndAssistant(request, params);
    if (ctx.errorResponse) return ctx.errorResponse;
    const { session, adminSupabase, assistant, id } = ctx;

    const body = await request.json();

    // Re-send the welcome email with a fresh temp password. Reuses the agent
    // helper: it refuses when the target already set their own password.
    if (body._resend === true) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        await resendAgentInvite(adminSupabase, { profile: assistant, siteUrl });
        return NextResponse.json({ message: 'Invite re-sent with a new temporary password.' });
      } catch (resendErr) {
        if (resendErr instanceof InviteError) {
          return NextResponse.json({ error: resendErr.message }, { status: resendErr.status });
        }
        throw resendErr;
      }
    }

    const updates = {};
    if (body.full_name !== undefined) {
      updates.full_name = typeof body.full_name === 'string' ? body.full_name.trim() || null : null;
    }

    let updated = assistant;
    if (Object.keys(updates).length > 0) {
      const { data, error } = await adminSupabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select(ASSISTANT_SELECT)
        .single();
      if (error) {
        console.error('[Assistant PUT] Update error:', error.message);
        return NextResponse.json({ error: 'Failed to update assistant' }, { status: 500 });
      }
      updated = data;
    }

    if (body.event_ids !== undefined) {
      const eventIds = Array.isArray(body.event_ids)
        ? body.event_ids.filter((eid) => UUID_REGEX.test(eid))
        : [];
      if (eventIds.length === 0) {
        return NextResponse.json({ error: 'An assistant needs access to at least one fair' }, { status: 400 });
      }

      const { data: events, error: eventsErr } = await adminSupabase
        .from('events')
        .select('id')
        .in('id', eventIds);
      if (eventsErr) {
        console.error('[Assistant PUT] events lookup error:', eventsErr.message);
        return NextResponse.json({ error: 'Failed to verify selected fairs' }, { status: 500 });
      }

      try {
        await setAssistantEventAccess(adminSupabase, {
          userId: id,
          userEmail: assistant.email,
          eventIds: (events || []).map((e) => e.id),
          grantedBy: session.user.id,
        });
      } catch (accessErr) {
        if (accessErr instanceof InviteError) {
          return NextResponse.json({ error: accessErr.message }, { status: accessErr.status });
        }
        throw accessErr;
      }
    }

    return NextResponse.json({ assistant: updated });
  } catch (err) {
    console.error('[Assistant PUT] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove an assistant: revoke login + fair access (admin only).
// Her orders are untouched (documents.created_by keeps the attribution).
export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'assistant-delete' });
    if (rateLimitRes) return rateLimitRes;

    const ctx = await requireAdminAndAssistant(request, params);
    if (ctx.errorResponse) return ctx.errorResponse;
    const { adminSupabase, assistant, id } = ctx;

    const { error: flagErr } = await adminSupabase
      .from('profiles')
      .update({ is_assistant: false })
      .eq('id', id);
    if (flagErr) {
      console.error('[Assistant DELETE] Error:', flagErr.message);
      return NextResponse.json({ error: 'Failed to remove assistant' }, { status: 500 });
    }

    const { error: accessErr } = await adminSupabase
      .from('event_access')
      .delete()
      .eq('user_id', id);
    if (accessErr) {
      console.error('[Assistant DELETE] event_access cleanup error (non-blocking):', accessErr.message);
    }

    // Invalidate refresh tokens so no new sessions can be minted.
    try {
      await adminSupabase.rpc('revoke_user_sessions', { uid: id });
    } catch (revokeErr) {
      console.error('[Assistant DELETE] session revocation error (non-blocking):', revokeErr.message);
    }

    // Block future logins — but never lock out someone who is ALSO an admin
    // or an agent (their access is managed elsewhere).
    if (assistant.email && !assistant.is_agent && assistant.role !== 'admin') {
      try {
        await revokeAccess(adminSupabase, assistant.email);
      } catch (emailErr) {
        console.error('[Assistant DELETE] revokeAccess error (non-blocking):', emailErr.message);
      }
    }

    return NextResponse.json({ message: 'Assistant removed. Their orders are preserved.' });
  } catch (err) {
    console.error('[Assistant DELETE] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
