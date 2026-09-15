import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { resendEmployeeInvite, EMPLOYEE_SELECT } from '@/lib/employees/invite';
import { InviteError } from '@/lib/agents/invite';
import { revokeAccess } from '@/lib/agents/access';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdminAndEmployee(params) {
  const supabase = await createClient();
  const session = await requireSession(supabase);
  if (session.error) return { errorResponse: session.error };
  if (!isAdmin(session.profile)) {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const { id } = await params;
  if (!id || !UUID_REGEX.test(id)) {
    return { errorResponse: NextResponse.json({ error: 'Invalid employee ID' }, { status: 400 }) };
  }

  const adminSupabase = createAdminClient();
  const { data: employee } = await adminSupabase
    .from('profiles')
    .select(EMPLOYEE_SELECT)
    .eq('id', id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!employee) {
    return { errorResponse: NextResponse.json({ error: 'Employee not found' }, { status: 404 }) };
  }

  return { session, adminSupabase, employee, id };
}

// PUT { _resend: true } - send a fresh temporary password (admin only).
// Works before and after the first login, so it doubles as "reset password".
export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'employee-update' });
    if (rateLimitRes) return rateLimitRes;

    const ctx = await requireAdminAndEmployee(params);
    if (ctx.errorResponse) return ctx.errorResponse;
    const { session, adminSupabase, employee, id } = ctx;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (body?._resend === true) {
      if (id === session.user.id) {
        return NextResponse.json({ error: 'Use "Forgot password" on the login page for your own account' }, { status: 400 });
      }
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        await resendEmployeeInvite(adminSupabase, { profile: employee, siteUrl });
        return NextResponse.json({ message: `A new temporary password was sent to ${employee.email}.` });
      } catch (resendErr) {
        if (resendErr instanceof InviteError) {
          return NextResponse.json({ error: resendErr.message }, { status: resendErr.status });
        }
        throw resendErr;
      }
    }

    // Sam, 15 Sep 2026: some admins are commercials too — they take orders
    // and earn commission on them, like an agent. "Commercial" is the agent
    // flag on their profile: the Save dialog then credits their orders to
    // them, a commission row is written on save, and they appear on Admin →
    // Agents with orders, commissions and what is owed. Switching it off
    // keeps the history and the rate; only new orders stop being credited.
    if (body?.commercial === true || body?.commercial === false) {
      let patch;
      if (body.commercial) {
        const rate = Number(body.commission_rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });
        }
        patch = {
          is_agent: true,
          agent_status: 'active',
          agent_deleted_at: null,
          commission_rate: rate,
          agent_since: employee.agent_since || new Date().toISOString(),
        };
      } else {
        patch = { is_agent: false, agent_status: 'inactive' };
      }
      const { data, error } = await adminSupabase
        .from('profiles')
        .update(patch)
        .eq('id', id)
        .select(EMPLOYEE_SELECT)
        .single();
      if (error) {
        console.error('[Employee PUT] commercial update error:', error.message);
        return NextResponse.json({ error: 'Failed to update the employee' }, { status: 500 });
      }
      return NextResponse.json({ employee: { ...data, you: id === session.user.id } });
    }

    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  } catch (err) {
    console.error('[Employee PUT] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - take away full access (admin only). The person becomes a plain
// member and can no longer sign in unless they are also an agent or an
// assistant. Their documents keep their name.
export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'employee-delete' });
    if (rateLimitRes) return rateLimitRes;

    const ctx = await requireAdminAndEmployee(params);
    if (ctx.errorResponse) return ctx.errorResponse;
    const { session, adminSupabase, employee, id } = ctx;

    if (id === session.user.id) {
      return NextResponse.json({ error: 'You cannot remove your own access' }, { status: 400 });
    }

    const { count, error: countErr } = await adminSupabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (countErr) {
      console.error('[Employee DELETE] Count error:', countErr.message);
      return NextResponse.json({ error: 'Failed to remove employee' }, { status: 500 });
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'This is the last employee with full access' }, { status: 400 });
    }

    const { error: roleErr } = await adminSupabase
      .from('profiles')
      .update({ role: 'member' })
      .eq('id', id);
    if (roleErr) {
      console.error('[Employee DELETE] Error:', roleErr.message);
      return NextResponse.json({ error: 'Failed to remove employee' }, { status: 500 });
    }

    // Invalidate refresh tokens so no new sessions can be minted.
    try {
      await adminSupabase.rpc('revoke_user_sessions', { uid: id });
    } catch (revokeErr) {
      console.error('[Employee DELETE] session revocation error (non-blocking):', revokeErr?.message);
    }

    // Block future logins — unless they are also an agent or an assistant,
    // whose access is managed on their own screens.
    if (employee.email && !employee.is_agent && !employee.is_assistant) {
      try {
        await revokeAccess(adminSupabase, employee.email);
      } catch (emailErr) {
        console.error('[Employee DELETE] revokeAccess error (non-blocking):', emailErr.message);
      }
    }

    return NextResponse.json({ message: 'Access removed. Their documents are preserved.' });
  } catch (err) {
    console.error('[Employee DELETE] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
