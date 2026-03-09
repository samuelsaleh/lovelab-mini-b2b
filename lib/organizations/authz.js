import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/organizations/utils';
import { shouldAllowOrgAccess } from '@/lib/organizations/validation';

async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, is_agent, organization_id')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function requireSession(supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    console.warn('[org-authz] Unauthorized access attempt', { error: error?.message });
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const profile = await getProfile(supabase, user.id);
  return { user, profile };
}

export async function canAccessOrganization(supabase, user, profile, organizationId) {
  if (!organizationId) return false;
  if (isAdmin(profile)) return true;

  const { data: membership, error } = await supabase
    .from('organization_memberships')
    .select('id, deleted_at')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return shouldAllowOrgAccess(profile, membership);
}

export async function requireOrganizationAccess(supabase, organizationId) {
  const session = await requireSession(supabase);
  if (session.error) return session;

  const allowed = await canAccessOrganization(
    supabase,
    session.user,
    session.profile,
    organizationId
  );

  if (!allowed) {
    console.warn('[org-authz] Forbidden: user %s denied access to org %s', session.user.id, organizationId);
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return session;
}

export { isAdmin };
