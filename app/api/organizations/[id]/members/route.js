import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireOrganizationAccess } from '@/lib/organizations/authz';
import { isValidEmail, normalizeEmail } from '@/lib/organizations/invitations';
import { inviteAgent, InviteError } from '@/lib/agents/invite';
import { provisionAgentInOrg } from '@/lib/organizations/provision-agent';
import { checkRateLimit } from '@/lib/rateLimit';

// Cap for bulk invites — protects the email sender and the auth API.
const MAX_BULK_INVITES = 50;

async function getMembershipRole(adminSupabase, organizationId, userId) {
  // Always use admin client to avoid the self-referential RLS policy
  const { data, error } = await adminSupabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data?.role || null;
}

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'org-members' });
    if (rateLimitRes) return rateLimitRes;

    const { id: organizationId } = await params;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    // Use admin client to bypass the self-referential RLS policy on organization_memberships
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('organization_memberships')
      .select('id, role, created_at, user_id, profiles:user_id(id, full_name, email, agent_status, has_password_set)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const callerRole = await getMembershipRole(adminSupabase, organizationId, session.user.id);

    return NextResponse.json({
      members: data || [],
      caller_role: isAdmin(session.profile) ? 'admin' : callerRole,
    });
  } catch (err) {
    console.error('[org-members GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to list organization members' }, { status: 500 });
  }
}

/**
 * Invite one email into the organization via the full agent onboarding flow
 * (allowed_emails grant + temp-password auth account + agent profile +
 * member membership + folder provisioning). Used for both new users and
 * existing users being pulled into the org.
 *
 * Returns { ok, invited, member } or throws InviteError.
 */
async function inviteOneMember(adminSupabase, {
  email,
  fullName,
  organizationId,
  organization,
  membershipRole,
  callerIsAdmin,
  invitedByUserId,
  siteUrl,
}) {
  const emailLower = normalizeEmail(email);
  if (!isValidEmail(emailLower)) {
    throw new InviteError('Valid email is required', 400);
  }

  const { data: existingProfile, error: profileErr } = await adminSupabase
    .from('profiles')
    .select('id, email, is_agent, role, organization_id, agent_deleted_at')
    .eq('email', emailLower)
    .maybeSingle();
  if (profileErr) throw profileErr;

  if (existingProfile) {
    // Never let an org invite touch an admin account.
    if (existingProfile.role === 'admin') {
      throw new InviteError('This user is an administrator and cannot be added as a team member', 409);
    }

    // Owners cannot poach users who already belong to a different org.
    // Admins can move people between orgs explicitly.
    if (
      !callerIsAdmin &&
      existingProfile.organization_id &&
      existingProfile.organization_id !== organizationId
    ) {
      throw new InviteError('This user already belongs to another organization', 409);
    }
  }

  // Per-agent commission rate defaults to the org rate for NEW accounts only;
  // existing profiles keep whatever rate the admin configured for them.
  const commissionRate = existingProfile
    ? null
    : (organization?.commission_rate ?? null);

  const { agent, created } = await inviteAgent(adminSupabase, {
    email: emailLower,
    fullName: fullName || '',
    commissionRate,
    organizationId,
    membershipRole,
    autoEnsureOrg: false,
    invitedByUserId,
    sendInvite: true,
    siteUrl,
  });

  return {
    ok: true,
    invited: true,
    created,
    member: {
      user_id: agent?.id || null,
      email: emailLower,
      full_name: agent?.full_name || fullName || '',
      role: membershipRole,
      agent_status: agent?.agent_status || null,
    },
  };
}

export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'org-members-post' });
    if (rateLimitRes) return rateLimitRes;

    const { id: organizationId } = await params;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    const body = await request.json();
    const userId = body?.user_id || null;

    const adminSupabase = createAdminClient();
    const callerIsAdmin = isAdmin(session.profile);
    const callerRole = await getMembershipRole(adminSupabase, organizationId, session.user.id);
    const canManage = callerIsAdmin || callerRole === 'owner';
    if (!canManage) {
      return NextResponse.json({ error: 'Only organization owners can add members' }, { status: 403 });
    }

    // Role guardrail: only LoveLab admins may appoint additional owners.
    // Org owners always create plain members.
    const requestedRole = body?.role === 'owner' ? 'owner' : 'member';
    const role = callerIsAdmin ? requestedRole : 'member';

    const { data: organization, error: orgErr } = await adminSupabase
      .from('organizations')
      .select('id, name, commission_rate')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();
    if (orgErr || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b.love-lab.com';

    // ── Path A: direct add by user_id (existing admin flows) ──────────────
    if (userId) {
      const { error: memberErr } = await adminSupabase
        .from('organization_memberships')
        .upsert(
          {
            organization_id: organizationId,
            user_id: userId,
            role,
            deleted_at: null,
          },
          { onConflict: 'organization_id,user_id' }
        );
      if (memberErr) throw memberErr;

      const { error: profileUpdateErr } = await adminSupabase
        .from('profiles')
        .update({ organization_id: organizationId, is_agent: true })
        .eq('id', userId);
      if (profileUpdateErr) throw profileUpdateErr;

      try {
        await provisionAgentInOrg(organizationId, userId);
      } catch (folderErr) {
        console.error('[org-members POST] Folder provisioning error (non-blocking):', folderErr.message);
      }

      return NextResponse.json({ ok: true, organization_id: organizationId, user_id: userId, role });
    }

    // ── Path B: invite by email (single or bulk) — full agent onboarding ──
    const rawEmails = Array.isArray(body?.emails)
      ? body.emails
      : (body?.email ? [body.email] : []);
    const fullName = typeof body?.full_name === 'string' ? body.full_name : '';

    // Normalize + dedupe while preserving order
    const emails = [...new Set(
      rawEmails.map((e) => normalizeEmail(e)).filter(Boolean)
    )];

    if (emails.length === 0) {
      return NextResponse.json({ error: 'Missing user_id or email' }, { status: 400 });
    }
    if (emails.length > MAX_BULK_INVITES) {
      return NextResponse.json(
        { error: `Too many invitations — maximum ${MAX_BULK_INVITES} per request` },
        { status: 400 }
      );
    }

    const results = [];
    for (const email of emails) {
      try {
        const result = await inviteOneMember(adminSupabase, {
          email,
          fullName: emails.length === 1 ? fullName : '',
          organizationId,
          organization,
          membershipRole: role,
          callerIsAdmin,
          invitedByUserId: session.user.id,
          siteUrl,
        });
        results.push({ email, ...result });
      } catch (err) {
        const message = err instanceof InviteError ? err.message : 'Failed to invite this member';
        if (!(err instanceof InviteError)) {
          console.error('[org-members POST] Invite error for', email, ':', err.message);
        }
        results.push({ email, ok: false, error: message });
      }
    }

    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    // Single-email requests keep a flat response shape for existing callers.
    if (emails.length === 1) {
      const only = results[0];
      if (!only.ok) {
        return NextResponse.json({ error: only.error }, { status: 400 });
      }
      return NextResponse.json(
        {
          ok: true,
          invited: true,
          member: only.member,
          message: `Invitation sent to ${only.email}.`,
        },
        { status: 202 }
      );
    }

    return NextResponse.json(
      {
        ok: failed.length === 0,
        invited_count: succeeded.length,
        failed_count: failed.length,
        results,
      },
      { status: failed.length === results.length ? 400 : 202 }
    );
  } catch (err) {
    console.error('[org-members POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to add organization member' }, { status: 500 });
  }
}
