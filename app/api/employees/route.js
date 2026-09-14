import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';
import { inviteEmployee, EMPLOYEE_SELECT } from '@/lib/employees/invite';
import { InviteError } from '@/lib/agents/invite';
import { NextResponse } from 'next/server';

/**
 * /api/employees — colleagues with the same access as an admin.
 *
 * Sam, 14 Sep 2026: invite from a button, like agents. An employee is simply
 * a profile with role = 'admin'; this is the list of them and the way in.
 */

async function requireAdminSession() {
  const supabase = await createClient();
  const session = await requireSession(supabase);
  if (session.error) return { errorResponse: session.error };
  if (!isAdmin(session.profile)) {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}

// GET - every employee, the caller marked (admin only)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'employees' });
    if (rateLimitRes) return rateLimitRes;

    const ctx = await requireAdminSession();
    if (ctx.errorResponse) return ctx.errorResponse;
    const { session } = ctx;

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('profiles')
      .select(EMPLOYEE_SELECT)
      .eq('role', 'admin')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[Employees GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load employees' }, { status: 500 });
    }

    return NextResponse.json({
      employees: (data || []).map((e) => ({ ...e, you: e.id === session.user.id })),
    });
  } catch (err) {
    console.error('[Employees GET] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - invite an employee: account, temp password, email (admin only)
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'employees-post' });
    if (rateLimitRes) return rateLimitRes;

    const ctx = await requireAdminSession();
    if (ctx.errorResponse) return ctx.errorResponse;
    const { session } = ctx;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { email, full_name, send_invite = true } = body || {};

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const emailLower = normalizeEmail(email);
    if (!isValidEmail(emailLower)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

    try {
      const result = await inviteEmployee(adminSupabase, {
        email: emailLower,
        fullName: typeof full_name === 'string' ? full_name : '',
        invitedByUserId: session.user.id,
        sendInvite: send_invite !== false,
        siteUrl,
      });
      return NextResponse.json(
        { employee: { ...result.employee, you: false }, created: result.created },
        { status: result.created ? 201 : 200 },
      );
    } catch (inviteErr) {
      if (inviteErr instanceof InviteError) {
        console.error('[Employees POST] Invite error:', inviteErr.message);
        return NextResponse.json({ error: inviteErr.message }, { status: inviteErr.status });
      }
      throw inviteErr;
    }
  } catch (err) {
    console.error('[Employees POST] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
