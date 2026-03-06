import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/organizations/authz';
import { ensureOrganizationFolders } from '@/lib/organizations/provisioning';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    const body = await request.json();
    const token = String(body?.token || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Missing invitation token' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data: invitation, error: inviteErr } = await adminSupabase
      .from('organization_invitations')
      .select('id, organization_id, email, role, expires_at, accepted_at, deleted_at')
      .eq('token', token)
      .is('deleted_at', null)
      .maybeSingle();
    if (inviteErr) throw inviteErr;
    if (!invitation) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 });
    }
    if (invitation.accepted_at) {
      return NextResponse.json({ error: 'Invitation already accepted' }, { status: 409 });
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
    }
    if (
      invitation.email &&
      String(invitation.email).toLowerCase() !== String(session.user.email || '').toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'Invitation email does not match signed-in user' },
        { status: 403 }
      );
    }

    const { error: memberErr } = await adminSupabase
      .from('organization_memberships')
      .upsert(
        {
          organization_id: invitation.organization_id,
          user_id: session.user.id,
          role: invitation.role === 'owner' ? 'owner' : 'member',
          deleted_at: null,
        },
        { onConflict: 'organization_id,user_id' }
      );
    if (memberErr) throw memberErr;

    const { error: profileErr } = await adminSupabase
      .from('profiles')
      .update({ organization_id: invitation.organization_id, is_agent: true })
      .eq('id', session.user.id);
    if (profileErr) throw profileErr;

    const { error: acceptedErr } = await adminSupabase
      .from('organization_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);
    if (acceptedErr) throw acceptedErr;

    const { data: org, error: orgErr } = await adminSupabase
      .from('organizations')
      .select('id, name')
      .eq('id', invitation.organization_id)
      .single();
    if (orgErr) throw orgErr;

    const folder = await ensureOrganizationFolders(org);

    return NextResponse.json({
      ok: true,
      organization_id: invitation.organization_id,
      folder,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to accept invitation' }, { status: 500 });
  }
}
