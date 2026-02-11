import { createClient } from '@/lib/supabase/server';
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

    let query = supabase
      .from('clients')
      .select('*')
      .order('updated_at', { ascending: false });

    if (search && search.trim()) {
      // Sanitize search input: escape PostgREST special characters (commas, dots, parentheses)
      const sanitized = search.trim().replace(/[,.()"'\\%_]/g, '');
      if (sanitized) {
        query = query.or(`company.ilike.%${sanitized}%,name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
      }
    }

    const { data: clients, error } = await query.limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    const { id, name, company, country, address, city, zip, email, phone, vat, vat_valid } = body;

    if (!company || !company.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    if (id) {
      // Update existing client
      const { data: client, error } = await supabase
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
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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
          created_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ client });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
