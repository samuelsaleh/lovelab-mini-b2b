import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { languagesForCountry, languageLabel } from '@/lib/fair-assistant/languages';

const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'company', 'email', 'phone', 'mobile_phone',
  'title', 'country', 'street', 'city', 'state', 'postal_code',
  'language', 'language_label', 'status',
];

export async function PATCH(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'fair-lead' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const patch = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  // If country changed but language wasn't explicitly set, recompute the language
  // from the country map so users don't have to remember to update both.
  if (body.country !== undefined && body.language === undefined) {
    const langs = languagesForCountry(body.country);
    patch.language = langs.join('+');
    patch.language_label = langs.map(languageLabel).join(' + ');
  }

  const { data, error } = await auth.adminSupabase
    .from('fair_leads')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[fair-lead PATCH]', error.message);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }

  return NextResponse.json({ lead: data });
}

export async function DELETE(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'fair-lead' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  const { error } = await auth.adminSupabase
    .from('fair_leads')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[fair-lead DELETE]', error.message);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
