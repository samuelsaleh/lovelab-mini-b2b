import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { welcomeAgentWithPasswordEmail } from '@/lib/email-templates';
import { sendEmail } from '@/lib/send-email';
import { generateTempPassword } from '@/lib/auth/generateTempPassword';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/agents/[id]/reset-password
// Admin-only one-click rescue for an agent who can't sign in. Generates a
// fresh temp password, updates the auth user, flips has_password_set back
// to false so they're forced through /set-password on next login, and
// re-sends the branded welcome email with credentials.
export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'agent-reset-password' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;
    if (!isAdmin(session.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: agent, error: profileErr } = await adminSupabase
      .from('profiles')
      .select('id, email, full_name, is_agent')
      .eq('id', id)
      .maybeSingle();

    if (profileErr || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const tempPassword = generateTempPassword(agent.full_name);

    const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(id, {
      password: tempPassword,
    });
    if (pwErr) {
      console.error('[Agent reset-password] updateUserById error:', pwErr.message);
      return NextResponse.json({ error: 'Failed to set new password' }, { status: 500 });
    }

    const { error: flagErr } = await adminSupabase
      .from('profiles')
      .update({ has_password_set: false })
      .eq('id', id);
    if (flagErr) {
      console.error('[Agent reset-password] profile flag update error:', flagErr.message);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const agentName = agent.full_name?.trim() || agent.email;
    try {
      const { subject, html } = welcomeAgentWithPasswordEmail(
        agentName,
        agent.email,
        tempPassword,
        `${siteUrl}/login`,
        siteUrl,
      );
      await sendEmail({ to: agent.email, subject, html });
    } catch (emailErr) {
      console.error('[Agent reset-password] email send failed (non-blocking):', emailErr?.message);
    }

    return NextResponse.json({
      message: 'Password reset. New credentials sent by email.',
      email: agent.email,
    });
  } catch (err) {
    console.error('[Agent reset-password] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
