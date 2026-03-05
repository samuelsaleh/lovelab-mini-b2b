import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'reports-get' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: reports, error } = await supabase
      .from('saved_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ reports });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'reports-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, entity_type, config } = body;

    if (!name || !entity_type) {
      return NextResponse.json({ error: 'Missing name or entity type' }, { status: 400 });
    }

    const validTypes = ['documents', 'commissions', 'clients', 'events'];
    if (!validTypes.includes(entity_type)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    if (config && JSON.stringify(config).length > 65536) {
      return NextResponse.json({ error: 'Report config too large (max 64KB)' }, { status: 400 });
    }

    const { data: report, error } = await supabase
      .from('saved_reports')
      .insert({
        user_id: user.id,
        name: name.trim(),
        entity_type,
        config: config || {}
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
