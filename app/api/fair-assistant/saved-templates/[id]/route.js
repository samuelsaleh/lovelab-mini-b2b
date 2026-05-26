import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';

const EDITABLE_FIELDS = ['name', 'lead_type', 'headline', 'paragraph1', 'paragraph2', 'signoff', 'cta_line'];

export async function PATCH(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-templates' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const patch = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const { data, error } = await auth.adminSupabase
    .from('fair_saved_templates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[fair-templates PATCH]', error.message);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}

export async function DELETE(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'fair-templates' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const { error } = await auth.adminSupabase
    .from('fair_saved_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[fair-templates DELETE]', error.message);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
