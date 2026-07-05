import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireOrganizationAccess } from '@/lib/organizations/authz';
import { resendAgentInvite, InviteError } from '@/lib/agents/invite';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * Owner/admin management of a single organization member.
 *
 *   PATCH  { action: 'pause' | 'reactivate' | 'resend_invite' }
 *   DELETE — soft-remove from the org (membership soft-delete + agent paused)
 *
 * Guardrails:
 *   - caller must be a LoveLab admin or an owner of THIS org
 *   - owners cannot manage other owners (admin-only)
 *   - nobody can manage themselves through this endpoint
 *   - profiles and documents are never hard-deleted
 */

async function getManagementContext(request, params, prefix) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix });
  if (rateLimitRes) return { error: rateLimitRes };

  const { id: organizationId, userId: targetUserId } = await params;
  const supabase = await createClient();
  const session = await requireOrganizationAccess(supabase, organizationId);
  if (session.error) return { error: session.error };

  const adminSupabase = createAdminClient();
  const callerIsAdmin = isAdmin(session.profile);

  const { data: callerMembership, error: callerErr } = await adminSupabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (callerErr) throw callerErr;

  const canManage = callerIsAdmin || callerMembership?.role === 'owner';
  if (!canManage) {
    return { error: NextResponse.json({ error: 'Only organization owners can manage members' }, { status: 403 }) };
  }

  if (targetUserId === session.user.id) {
    return { error: NextResponse.json({ error: 'You cannot manage your own membership' }, { status: 400 }) };
  }

  const { data: targetMembership, error: targetErr } = await adminSupabase
    .from('organization_memberships')
    .select('id, role, deleted_at')
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
    .is('deleted_at', null)
    .maybeSingle();
  if (targetErr) throw targetErr;

  if (!targetMembership) {
    return { error: NextResponse.json({ error: 'Member not found in this organization' }, { status: 404 }) };
  }

  if (targetMembership.role === 'owner' && !callerIsAdmin) {
    return { error: NextResponse.json({ error: 'Only admins can manage organization owners' }, { status: 403 }) };
  }

  return { adminSupabase, session, organizationId, targetUserId, targetMembership, callerIsAdmin };
}

export async function PATCH(request, { params }) {
  try {
    const ctx = await getManagementContext(request, params, 'org-member-patch');
    if (ctx.error) return ctx.error;
    const { adminSupabase, organizationId, targetUserId } = ctx;

    const body = await request.json();
    const action = body?.action;

    if (action === 'pause' || action === 'reactivate') {
      const nextStatus = action === 'pause' ? 'paused' : 'active';
      const { error } = await adminSupabase
        .from('profiles')
        .update({ agent_status: nextStatus })
        .eq('id', targetUserId);
      if (error) throw error;
      return NextResponse.json({ ok: true, user_id: targetUserId, agent_status: nextStatus });
    }

    if (action === 'resend_invite') {
      const { data: profile, error } = await adminSupabase
        .from('profiles')
        .select('id, email, full_name, has_password_set, agent_status')
        .eq('id', targetUserId)
        .single();
      if (error) throw error;

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b.love-lab.com';
      try {
        await resendAgentInvite(adminSupabase, { profile, siteUrl });
      } catch (err) {
        if (err instanceof InviteError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
      return NextResponse.json({ ok: true, user_id: targetUserId, resent: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[org-member PATCH]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const ctx = await getManagementContext(request, params, 'org-member-delete');
    if (ctx.error) return ctx.error;
    const { adminSupabase, organizationId, targetUserId, targetMembership } = ctx;

    // Soft-delete the membership — historical documents/commissions stay put.
    const { error: memberErr } = await adminSupabase
      .from('organization_memberships')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', targetMembership.id);
    if (memberErr) throw memberErr;

    // Detach the denormalized primary-org pointer and pause the agent so a
    // removed sub-agent can no longer log in (unless separately allowlisted).
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', targetUserId)
      .maybeSingle();

    const profileUpdates = { agent_status: 'paused' };
    if (profile?.organization_id === organizationId) {
      profileUpdates.organization_id = null;
    }
    const { error: profileErr } = await adminSupabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', targetUserId);
    if (profileErr) throw profileErr;

    return NextResponse.json({ ok: true, user_id: targetUserId, removed: true });
  } catch (err) {
    console.error('[org-member DELETE]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to remove member' }, { status: 500 });
  }
}
