import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// GET - List all clients (with optional search)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'clients' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const adminSupabase = createAdminClient();

    // Clients are a shared pool: every authenticated user (agents + admins)
    // can browse the full directory so an order can always be matched to an
    // existing client, even when that client was first created by an admin or
    // a different agent. Edit access is shared too (see POST below) — agents
    // often onboard a client the office first entered and need to keep its
    // details up to date.
    let query = adminSupabase
      .from('clients')
      .select('*')
      .order('updated_at', { ascending: false });

    if (search && search.trim()) {
      // Sanitize search input: escape PostgREST special characters (commas, dots, parentheses)
      const sanitized = search.trim().replace(/[,.()"'\\%_*]/g, '');
      if (sanitized) {
        query = query.or(`company.ilike.%${sanitized}%,name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
      }
    }

    const { data: clients, error } = await query.limit(2000);

    if (error) {
      console.error('[Clients GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 });
    }

    return NextResponse.json({ clients });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create or update a client
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'clients-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      name,
      company,
      country,
      address,
      city,
      zip,
      email,
      phone,
      vat,
      vat_valid,
      source,
      source_comment,
      source_imported_at,
    } = body;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const isAdmin = profile?.role === 'admin';
    const adminSupabase = createAdminClient();
    const sourcePayload = {};
    if (isAdmin && (source || source_comment || source_imported_at)) {
      sourcePayload.source = source === 'salesforce' ? 'salesforce' : 'manual';
      sourcePayload.source_comment = source_comment?.trim() || null;
      sourcePayload.source_imported_at = source_imported_at || null;
    }

    if (!company || !company.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    if (id) {
      // Shared directory: any authenticated user can edit any client's core
      // details (created_by is never overwritten, so ownership/attribution is
      // preserved). The Salesforce `source*` metadata stays admin-only via
      // sourcePayload above. We deliberately do NOT scope this by created_by:
      // agents routinely onboard a client the office first entered and need to
      // keep its address / VAT / contact up to date.
      const { data: client, error } = await adminSupabase
        .from('clients')
        .update({
          name: name?.trim() || null,
          company: company.trim(),
          country: country?.trim() || null,
          address: address?.trim() || null,
          city: city?.trim() || null,
          zip: zip?.trim() || null,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          vat: vat?.trim() || null,
          vat_valid: vat_valid ?? null,
          ...sourcePayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        // maybeSingle (not single): a missing id matches 0 rows → handled as a
        // 404 below instead of throwing.
        .maybeSingle();

      if (error) {
        console.error('[Clients POST update] Error:', error.message);
        return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
      }

      // No row updated → the id doesn't exist.
      if (!client) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }

      return NextResponse.json({ client });
    } else {
      // Create new client
      const { data: client, error } = await supabase
        .from('clients')
        .insert({
          name: name?.trim() || null,
          company: company.trim(),
          country: country?.trim() || null,
          address: address?.trim() || null,
          city: city?.trim() || null,
          zip: zip?.trim() || null,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          vat: vat?.trim() || null,
          vat_valid: vat_valid ?? null,
          ...sourcePayload,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[Clients POST insert] Error:', error.message);
        return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
      }

      return NextResponse.json({ client });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
