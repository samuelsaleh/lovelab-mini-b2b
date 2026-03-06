import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isAdmin, requireSession } from '@/lib/organizations/authz';

export async function GET(_request, { params }) {
  try {
    const { id: organizationId } = await params;
    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    const adminSupabase = createAdminClient();

    if (!isAdmin(session.profile)) {
      const { data: membership } = await adminSupabase
        .from('organization_memberships')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', session.user.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: organization, error } = await adminSupabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({ organization });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to load organization' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id: organizationId } = await params;
    const supabase = await createClient();
    const session = await requireSession(supabase);
    if (session.error) return session.error;

    if (!isAdmin(session.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates = {};

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) {
        return NextResponse.json({ error: 'Organization name cannot be empty' }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.territory !== undefined) {
      updates.territory = body.territory || null;
    }

    if (body.commission_rate !== undefined) {
      const rate = body.commission_rate === null ? null : Number(body.commission_rate);
      if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100)) {
        return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });
      }
      updates.commission_rate = rate;
    }

    if (body.conditions !== undefined) {
      updates.conditions = body.conditions || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const adminSupabase = createAdminClient();
    const { data: organization, error } = await adminSupabase
      .from('organizations')
      .update(updates)
      .eq('id', organizationId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) {
      console.error('[org PATCH] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({ organization });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to update organization' }, { status: 500 });
  }
}
