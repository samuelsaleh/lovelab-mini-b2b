import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { ensureOrganizationFolders } from '@/lib/organizations/provisioning';

// Utility endpoint to auto-create organization+folders for an existing agent profile.
// Intended for onboarding hooks or migration verification scripts.
export async function POST(request) {
  try {
    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    const body = await request.json();
    const targetUserId = body?.user_id || session.user.id;

    if (!isAdmin(session.profile) && targetUserId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();
    const { data: profile, error: profileErr } = await adminSupabase
      .from('profiles')
      .select('id, email, full_name, organization_id')
      .eq('id', targetUserId)
      .single();
    if (profileErr) throw profileErr;

    let organization = null;

    if (profile.organization_id) {
      const { data: existingOrg, error: orgErr } = await adminSupabase
        .from('organizations')
        .select('id, name')
        .eq('id', profile.organization_id)
        .single();
      if (orgErr) throw orgErr;
      organization = existingOrg;
    } else {
      const orgName =
        `${(profile.full_name || profile.email || 'Agent').trim()} Organization`.trim();

      const { data: createdOrg, error: createErr } = await adminSupabase
        .from('organizations')
        .insert({ name: orgName, created_by: session.user.id })
        .select('id, name')
        .single();
      if (createErr) throw createErr;
      organization = createdOrg;

      const { error: profileUpdateErr } = await adminSupabase
        .from('profiles')
        .update({ organization_id: organization.id })
        .eq('id', profile.id);
      if (profileUpdateErr) throw profileUpdateErr;

      const { error: memberErr } = await adminSupabase
        .from('organization_memberships')
        .upsert(
          {
            organization_id: organization.id,
            user_id: profile.id,
            role: 'owner',
          },
          { onConflict: 'organization_id,user_id' }
        );
      if (memberErr) throw memberErr;
    }

    const folder = await ensureOrganizationFolders(organization);

    return NextResponse.json({ ok: true, organization, folder });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Failed to auto-ensure organization' },
      { status: 500 }
    );
  }
}
