import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, requireSession } from '@/lib/organizations/authz';
import { autoEnsureOrganization } from '@/lib/organizations/provision-agent';

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

    const { organization, folder } = await autoEnsureOrganization(targetUserId, session.user.id);
    return NextResponse.json({ ok: true, organization, folder });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Failed to auto-ensure organization' },
      { status: 500 }
    );
  }
}
