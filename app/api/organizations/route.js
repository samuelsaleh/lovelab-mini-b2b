import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { ensureOrgFoldersInDb } from '@/lib/organizations/folder-provisioning';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'organizations' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    if (isAdmin(session.profile)) {
      // Authentication is performed with the user's cookie-bound client above,
      // but admins must list organizations through the server-only service
      // client. The user client is still subject to organizations RLS and can
      // legitimately return an empty array even for an application-level admin.
      const adminSupabase = createAdminClient();
      const { data, error } = await adminSupabase
        .from('organizations')
        .select('id, name, territory, conditions, commission_rate, created_by, created_at, updated_at, deleted_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[organizations GET] admin list failed:', error.message);
        throw error;
      }
      return NextResponse.json({ organizations: data || [] });
    }

    const { data: memberships, error } = await supabase
      .from('organization_memberships')
      .select('role, organizations(*)')
      .eq('user_id', session.user.id)
      .is('deleted_at', null);
    if (error) throw error;

    const organizations = (memberships || [])
      .map((m) => m.organizations)
      .filter(Boolean);

    return NextResponse.json({ organizations });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to list organizations' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    // Tighter ceiling than GET — POST creates rows, GET just lists them.
    const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'organizations-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    const body = await request.json();
    const name = String(body?.name || '').trim();
    const territory = body?.territory || null;
    const ownerUserId = body?.owner_user_id || session.user.id;

    if (!name) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    // Non-admin users can only create their own organization.
    if (!isAdmin(session.profile) && ownerUserId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const { data: organization, error: orgError } = await adminSupabase
      .from('organizations')
      .insert({
        name,
        territory,
        created_by: session.user.id,
      })
      .select('*')
      .single();
    if (orgError) throw orgError;

    const membershipRows = [
      {
        organization_id: organization.id,
        user_id: ownerUserId,
        role: 'owner',
      },
    ];

    if (ownerUserId !== session.user.id) {
      membershipRows.push({
        organization_id: organization.id,
        user_id: session.user.id,
        role: 'owner',
      });
    }

    const { error: memberError } = await adminSupabase
      .from('organization_memberships')
      .upsert(membershipRows, { onConflict: 'organization_id,user_id' });
    if (memberError) throw memberError;

    const { error: profileError } = await adminSupabase
      .from('profiles')
      .update({ organization_id: organization.id })
      .eq('id', ownerUserId);
    if (profileError) throw profileError;

    let folderInfo = null;
    try {
      folderInfo = await ensureOrgFoldersInDb(organization.id, organization.name, ownerUserId);
    } catch (folderErr) {
      console.error('[org POST] Folder provisioning error (non-blocking):', folderErr.message);
    }

    return NextResponse.json({ organization, folder: folderInfo }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to create organization' }, { status: 500 });
  }
}
