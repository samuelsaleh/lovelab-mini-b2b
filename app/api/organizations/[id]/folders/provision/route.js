import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireOrganizationAccess } from '@/lib/organizations/authz';
import { ensureOrgFoldersInDb } from '@/lib/organizations/folder-provisioning';

export async function POST(_request, { params }) {
  try {
    const organizationId = params?.id;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single();
    if (error) throw error;

    const folder = await ensureOrgFoldersInDb(org.id, org.name, session.user.id);
    return NextResponse.json({ folder });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to provision organization folders' }, { status: 500 });
  }
}
