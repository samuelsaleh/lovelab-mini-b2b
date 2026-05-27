import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyFairWebhookSecret } from '@/lib/fair-assistant/auth';
import {
  computeLeadHash,
  inferLeadType,
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

  // Sent by the IF Duplicate Found = TRUE branch in n8n once Sam wires that
  // branch up. Marks the image as processed (so it stops showing "stuck")
  // and annotates with the existing Salesforce lead id so we don't try to
  // re-create. No app-side lead row is inserted — the contact already lives
  // in Salesforce.
  if (event === 'image_duplicate' || event === 'lead_duplicate') {
    if (imageId) {
      const salesforceId = parsed.value?.lead?.salesforceId || parsed.value?.salesforceId;
      const note = salesforceId
        ? `Duplicate — already in Salesforce (${salesforceId})`
        : 'Duplicate — already in Salesforce';
      await adminSupabase
        .from('fair_images')
        .update({
          status: 'processed',
          error: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', imageId);
    }
    return NextResponse.json({ ok: true, marked: 'duplicate' });
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

  // Auto-classify shop/agent/partner from OCR'd title/description/company.
  // If n8n already explicitly sent a lead_type we trust that (normalizeLeadPayload
  // returned it); otherwise infer from the card text. Default to 'shop'.
  if (!normalized.lead_type) {
    normalized.lead_type = inferLeadType({
      title: normalized.title,
      company: normalized.company,
      description: lead?.description || lead?.notes || '',
      ocrText: lead?.ocrText || lead?.rawText || '',
    });
  }

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

  // The user can delete an "processing" image from the UI before n8n's
  // callback arrives (it's the only way to unstick a workflow that died
  // mid-flight). If that happened, drop the image_id from the insert
  // rather than failing the FK constraint — the lead still gets created.
  let effectiveImageId = imageId;
  if (imageId) {
    const { data: imgRow } = await adminSupabase
      .from('fair_images')
      .select('id')
      .eq('id', imageId)
      .maybeSingle();
    if (!imgRow) {
      console.warn('[fair-callback] image_id no longer exists, inserting lead without it:', imageId);
      effectiveImageId = null;
    }
  }

  const { data: inserted, error: insertErr } = await adminSupabase
    .from('fair_leads')
    .insert({
      batch_id: batchId,
      image_id: effectiveImageId,
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
