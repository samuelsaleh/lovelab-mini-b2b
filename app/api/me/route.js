import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// The user's primary active org membership (prefers the org denormalized on
// the profile, falls back to their first active membership). Lets the UI
// know whether to show the Team page and whether the user is an org owner.
async function getOrganizationMembership(user, profile) {
  try {
    const admin = createAdminClient();
    const { data: memberships, error } = await admin
      .from('organization_memberships')
      .select('organization_id, role, organizations:organization_id(id, name, deleted_at)')
      .eq('user_id', user.id)
      .is('deleted_at', null);
    if (error || !memberships || memberships.length === 0) return null;

    const active = memberships.filter((m) => m.organizations && !m.organizations.deleted_at);
    if (active.length === 0) return null;

    const primary =
      active.find((m) => m.organization_id === profile?.organization_id) || active[0];

    return {
      organization_id: primary.organization_id,
      organization_name: primary.organizations?.name || null,
      role: primary.role,
    };
  } catch (err) {
    console.error('[me GET] org membership lookup failed (non-blocking):', err.message);
    return null;
  }
}

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'me-get' });
  if (rateLimitRes) return rateLimitRes;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ user: null, profile: null });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profileError && profile) {
      const organization_membership = await getOrganizationMembership(user, profile);
      return NextResponse.json({ user, profile, organization_membership });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (adminProfile) {
      const organization_membership = await getOrganizationMembership(user, adminProfile);
      return NextResponse.json({ user, profile: adminProfile, organization_membership });
    }

    return NextResponse.json({
      user,
      profile: null,
      error: 'profile_not_found',
    });
  } catch (err) {
    return NextResponse.json({ user: null, profile: null, error: err.message }, { status: 500 });
  }
}
