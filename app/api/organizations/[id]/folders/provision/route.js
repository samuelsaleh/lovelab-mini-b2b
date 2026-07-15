import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireOrganizationAccess } from '@/lib/organizations/authz';
import { provisionOrganizationFolders } from '@/lib/organizations/provision-agent';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'org-folders-provision' });
    if (rateLimitRes) return rateLimitRes;

    const { id: organizationId } = await params;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    const folder = await provisionOrganizationFolders(organizationId);
    return NextResponse.json({ folder });
  } catch (err) {
    console.error('[org-folders-provision POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to provision organization folders' }, { status: 500 });
  }
}
