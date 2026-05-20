import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyFairWebhookSecret } from '@/lib/fair-assistant/auth';
import {
  computeLeadHash,
  normalizeLeadPayload,
  parseLeadCreatedCallback,
} from '@/lib/fair-assistant/schemas';
import { languagesForCountry, languageLabel, primaryLanguageForCountry } from '@/lib/fair-assistant/languages';

export async function POST(request) {
  const authErr = verifyFairWebhookSecret(request);
  if (authErr) return authErr;

  const body = await request.json();
  const parsed = parseLeadCreatedCallback(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { event, batchId, imageId, lead, error: callbackError, summary } = parsed.value;
  const adminSupabase = createAdminClient();

  if (event === 'lead_failed' || event === 'image_failed') {
    if (imageId) {
      await adminSupabase
        .from('fair_images')
        .update({
          status: 'failed',
          error: callbackError || 'Processing failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', imageId);
    }
    return NextResponse.json({ ok: true });
  }

  if (event === 'batch_complete' || event === 'extraction_complete') {
    await adminSupabase
      .from('fair_batches')
      .update({
        status: 'extracted',
        total_leads: summary?.totalLeads ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return NextResponse.json({ ok: true });
  }

  if (event !== 'lead_created') {
    return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }

  const normalized = normalizeLeadPayload(lead || {});
  const langs = languagesForCountry(normalized.country);
  const leadHash = computeLeadHash({
    email: normalized.email,
    firstName: normalized.first_name,
    lastName: normalized.last_name,
    company: normalized.company,
  });

  const { data: existing } = await adminSupabase
    .from('fair_leads')
    .select('id')
    .eq('batch_id', batchId)
    .eq('lead_hash', leadHash)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, leadId: existing.id });
  }

  const { data: inserted, error: insertErr } = await adminSupabase
    .from('fair_leads')
    .insert({
      batch_id: batchId,
      image_id: imageId,
      ...normalized,
      language: langs.join('+'),
      language_label: langs.map(languageLabel).join(' + '),
      lead_hash: leadHash,
      status: 'extracted',
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[fair-callback] insert lead failed:', insertErr.message);
    return NextResponse.json({ error: 'Failed to insert lead' }, { status: 500 });
  }

  if (imageId) {
    await adminSupabase
      .from('fair_images')
      .update({ status: 'processed', updated_at: new Date().toISOString() })
      .eq('id', imageId);
  }

  const { count } = await adminSupabase
    .from('fair_leads')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', batchId);

  await adminSupabase
    .from('fair_batches')
    .update({
      total_leads: count || 0,
      status: 'extracting',
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  return NextResponse.json({ ok: true, leadId: inserted.id, language: primaryLanguageForCountry(normalized.country) });
}
