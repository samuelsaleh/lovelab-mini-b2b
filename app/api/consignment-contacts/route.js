import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserContext } from '@/app/api/_lib/access';
import { NextResponse } from 'next/server';

// GET — list all consignment contacts (admin only)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'consignment-contacts-get' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: contacts, error } = await adminSupabase
      .from('consignment_contacts')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[ConsignmentContacts GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
    }

    return NextResponse.json({ contacts: contacts || [] });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — create a new consignment contact (admin only)
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'consignment-contacts-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const { user, isAdmin } = await getUserContext(supabase);

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { full_name, company, phone, email, address, notes } = body;

    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
    }

    const { data: contact, error } = await adminSupabase
      .from('consignment_contacts')
      .insert({
        full_name: full_name.trim(),
        company: company?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[ConsignmentContacts POST] Error:', error.message);
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
    }

    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
