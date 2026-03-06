import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireOrganizationAccess } from '@/lib/organizations/authz';
import { getSenderFrom } from '@/lib/email';
import {
  generateInvitationToken,
  getDefaultExpiryIso,
  isValidEmail,
  normalizeEmail,
} from '@/lib/organizations/invitations';

async function getMembershipRole(supabase, organizationId, userId) {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data?.role || null;
}

export async function GET(_request, { params }) {
  try {
    const { id: organizationId } = await params;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    const { data, error } = await supabase
      .from('organization_memberships')
      .select('id, role, created_at, user_id, profiles:user_id(id, full_name, email)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ members: data || [] });
  } catch (err) {
    console.error('[org-members GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to list organization members' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { id: organizationId } = await params;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    const callerRole = await getMembershipRole(supabase, organizationId, session.user.id);
    const canManage = isAdmin(session.profile) || callerRole === 'owner';
    if (!canManage) {
      return NextResponse.json({ error: 'Only organization owners can add members' }, { status: 403 });
    }

    const body = await request.json();
    const role = body?.role === 'owner' ? 'owner' : 'member';
    const userId = body?.user_id || null;
    const email = normalizeEmail(body?.email);

    const adminSupabase = createAdminClient();
    let targetUserId = userId;

    if (!targetUserId && email) {
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
      }

      const { data: profile, error: profileErr } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (profileErr) throw profileErr;
      targetUserId = profile?.id;

      // User does not exist yet: create/refresh invitation token.
      if (!targetUserId) {
        const token = generateInvitationToken();
        const expiresAt = getDefaultExpiryIso(14);

        const { data: invitation, error: inviteErr } = await adminSupabase
          .from('organization_invitations')
          .upsert(
            {
              organization_id: organizationId,
              email,
              role,
              invited_by: session.user.id,
              token,
              expires_at: expiresAt,
              accepted_at: null,
              deleted_at: null,
            },
            { onConflict: 'organization_id,email' }
          )
          .select('id, email, token, expires_at, role')
          .single();

        if (inviteErr) throw inviteErr;

        const { data: org } = await adminSupabase
          .from('organizations')
          .select('name')
          .eq('id', organizationId)
          .single();
        const orgName = org?.name || 'your team';

        const resendApiKey = process.env.RESEND_API_KEY;
        if (resendApiKey) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b.love-lab.com';
          const signInUrl = `${siteUrl}/login`;
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: getSenderFrom(),
                to: [email],
                subject: `You're invited to join ${orgName} on LoveLab B2B`,
                html: `
                  <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                    <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
                    <h2 style="color: #1a1a1a; margin: 0 0 8px;">You're invited!</h2>
                    <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                      You've been invited to join <strong style="color: #5D3A5E;">${orgName}</strong> on LoveLab B2B as a sales partner.
                    </p>
                    <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                      Sign in or create your account to get started.
                    </p>
                    <a href="${signInUrl}" style="display: inline-block; padding: 14px 32px; background: #5D3A5E; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
                      Sign in to LoveLab B2B
                    </a>
                    <p style="color: #ccc; font-size: 11px; margin-top: 24px;">
                      LoveLab B2B &middot; This email was sent automatically.
                    </p>
                  </div>
                `,
              }),
            });
          } catch (emailErr) {
            console.error('[org-members POST] Invitation email error:', emailErr.message);
          }
        }

        return NextResponse.json(
          {
            invited: true,
            invitation,
            message: `Invitation sent to ${email}.`,
          },
          { status: 202 }
        );
      }
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing user_id or email' }, { status: 400 });
    }

    const { error: memberErr } = await adminSupabase
      .from('organization_memberships')
      .upsert(
        {
          organization_id: organizationId,
          user_id: targetUserId,
          role,
          deleted_at: null,
        },
        { onConflict: 'organization_id,user_id' }
      );
    if (memberErr) throw memberErr;

    const { error: profileUpdateErr } = await adminSupabase
      .from('profiles')
      .update({ organization_id: organizationId, is_agent: true })
      .eq('id', targetUserId);
    if (profileUpdateErr) throw profileUpdateErr;

    return NextResponse.json({ ok: true, organization_id: organizationId, user_id: targetUserId, role });
  } catch (err) {
    console.error('[org-members POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to add organization member' }, { status: 500 });
  }
}
