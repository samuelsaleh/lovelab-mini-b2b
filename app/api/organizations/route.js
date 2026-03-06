import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { ensureOrgFoldersInDb } from '@/lib/organizations/folder-provisioning';

export async function GET() {
  try {
    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    if (isAdmin(session.profile)) {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
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
