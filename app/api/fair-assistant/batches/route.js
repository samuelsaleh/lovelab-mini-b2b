import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { getFairTemplate } from '@/lib/fair-assistant/templates';

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'fair-batches' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.adminSupabase
    .from('fair_batches')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fair-batches GET]', error.message);
    return NextResponse.json({ error: 'Failed to load batches' }, { status: 500 });
  }

  return NextResponse.json({ batches: data || [] });
}

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-batches' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const name = (body.name || body.fairName || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const template = getFairTemplate(body.templateId || 'generic');

  const { data, error } = await auth.adminSupabase
    .from('fair_batches')
    .insert({
      name,
      fair_name: body.fairName?.trim() || name,
      event_id: body.eventId || null,
      template_id: template.id,
      headline: template.headline,
      paragraph1: template.paragraph1,
      paragraph2: template.paragraph2,
      signoff: template.signoff,
      status: 'uploading',
      created_by: auth.user.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[fair-batches POST]', error.message);
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 });
  }

  return NextResponse.json({ batch: data });
}
