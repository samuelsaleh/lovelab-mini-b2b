import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';

const EDITABLE_FIELDS = ['name', 'lead_type', 'headline', 'paragraph1', 'paragraph2', 'signoff', 'cta_line'];

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'fair-templates' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.adminSupabase
    .from('fair_saved_templates')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[fair-templates GET]', error.message);
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }

  return NextResponse.json({ templates: data || [] });
}

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-templates' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const row = { created_by: auth.user.id };
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) row[key] = body[key];
  }
  row.name = body.name.trim();

  const { data, error } = await auth.adminSupabase
    .from('fair_saved_templates')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    console.error('[fair-templates POST]', error.message);
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}
