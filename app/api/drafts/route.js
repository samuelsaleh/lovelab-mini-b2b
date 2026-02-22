import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// GET - Get draft for a specific company (or list all drafts)
export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'drafts' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('company');

    let query = supabase
      .from('drafts')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (companyName) {
      query = query.eq('company_name', companyName).limit(1);
    } else {
      query = query.limit(50);
    }

    const { data: drafts, error } = await query;

    if (error) {
      console.error('[Drafts GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 });
    }

    // If looking for a specific company, return single draft or null
    if (companyName) {
      return NextResponse.json({ draft: drafts?.[0] || null });
    }

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('[Drafts GET] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create or update draft (upsert by company_name)
export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'drafts-post' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { company_name, form_state } = body;

    if (!company_name || !form_state) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if draft exists for this company
    const { data: existing } = await supabase
      .from('drafts')
      .select('id')
      .eq('user_id', user.id)
      .eq('company_name', company_name)
      .limit(1)
      .single();

    let result;
    if (existing) {
      // Update existing draft
      result = await supabase
        .from('drafts')
        .update({ form_state, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new draft
      result = await supabase
        .from('drafts')
        .insert({
          user_id: user.id,
          company_name,
          form_state,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('[Drafts POST] Error:', result.error.message);
      return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
    }

    return NextResponse.json({ draft: result.data });
  } catch (error) {
    console.error('[Drafts POST] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete draft by company_name or id
export async function DELETE(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'drafts-del' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('company');
    const id = searchParams.get('id');

    if (!companyName && !id) {
      return NextResponse.json({ error: 'Missing company or id parameter' }, { status: 400 });
    }

    let query = supabase
      .from('drafts')
      .delete()
      .eq('user_id', user.id);

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('company_name', companyName);
    }

    const { error } = await query;

    if (error) {
      console.error('[Drafts DELETE] Error:', error.message);
      return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Drafts DELETE] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
