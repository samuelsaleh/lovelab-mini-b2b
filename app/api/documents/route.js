import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - List documents (optionally filtered by event_id)
export async function GET(request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    const search = searchParams.get('search');

    let query = supabase
      .from('documents')
      .select('*, events(name), profiles(full_name, email)')
      .order('created_at', { ascending: false });

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    if (search && search.trim()) {
      // Sanitize search input: escape PostgREST special characters
      const sanitized = search.trim().replace(/[,.()"'\\%_]/g, '');
      if (sanitized) {
        query = query.or(`client_name.ilike.%${sanitized}%,client_company.ilike.%${sanitized}%`);
      }
    }

    const { data: documents, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save document metadata (after uploading PDF to storage)
export async function POST(request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      event_id,
      client_name,
      client_company,
      document_type,
      file_path,
      file_name,
      file_size,
      total_amount,
      metadata,
    } = body;

    if (!client_name || !document_type || !file_path || !file_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        event_id: event_id || null,
        client_name,
        client_company: client_company || null,
        document_type,
        file_path,
        file_name,
        file_size: file_size || null,
        total_amount: total_amount || null,
        created_by: user.id,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
