import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/organizations/authz';

export async function GET() {
  try {
    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    const email = String(session.user.email || '').toLowerCase();
    if (!email) return NextResponse.json({ invitations: [] });

    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, organization_id, role, expires_at, token, organizations(name)')
      .eq('email', email)
      .is('accepted_at', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ invitations: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to list invitations' }, { status: 500 });
  }
}
