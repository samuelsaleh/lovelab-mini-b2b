import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin, siteUrl } from '@/lib/fair-assistant/server';
import { buildEmailForLead, translateSlotsForLanguages } from '@/lib/fair-assistant/translate';
import { languageForLead, languageLabel } from '@/lib/fair-assistant/languages';
import { defaultTemplateForLeadType } from '@/lib/fair-assistant/templates';

const CONCURRENCY = 10;

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'fair-generate' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const batchId = body.batchId;
  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const { data: batch, error: batchErr } = await auth.adminSupabase
    .from('fair_batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (batchErr || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  const { data: leads, error: leadsErr } = await auth.adminSupabase
    .from('fair_leads')
    .select('*')
    .eq('batch_id', batchId)
    .neq('status', 'failed');

  if (leadsErr) {
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }

  if (!leads?.length) {
    return NextResponse.json({ error: 'No leads to generate' }, { status: 400 });
  }

  await auth.adminSupabase
    .from('fair_batches')
    .update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', batchId);

  // Per-lead-type templateSlots — leads with lead_type='agent' or 'partner'
  // get distinct subject/body; shops use the batch's edited template.
  const batchTemplate = {
    subject: batch.subject || batch.headline,
    headline: batch.headline,
    paragraph1: batch.paragraph1,
    paragraph2: batch.paragraph2,
    signoff: batch.signoff,
  };
  const ctaLine = batch.cta_line || 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.';
  const fairName = batch.fair_name || batch.name;

  function slotsForLead(lead) {
    if (!lead.lead_type || lead.lead_type === 'shop' || lead.lead_type === 'other') {
      return { ...batchTemplate, fairName, ctaLine };
    }
    // Agent / partner leads: per-batch override columns win, with the
    // hardcoded preset as a last-resort fallback. The user can leave any
    // field blank and the preset value is used for just that slot.
    const tpl = defaultTemplateForLeadType(lead.lead_type);
    const prefix = lead.lead_type; // 'agent' or 'partner'
    const pick = (field) => {
      const overrideVal = batch[`${prefix}_${field}`];
      return (overrideVal && String(overrideVal).trim()) ? overrideVal : tpl[field];
    };
    return {
      subject: pick('subject') || pick('headline'),
      headline: pick('headline'),
      paragraph1: pick('paragraph1'),
      paragraph2: pick('paragraph2'),
      signoff: pick('signoff'),
      fairName,
      ctaLine,
    };
  }

  // One email, one language (lib/fair-assistant/languages.js languageForLead).
  // Cache translations by (lead_type, language) so we don't re-call Claude
  // for every lead that shares the same template + language.
  const translatedCache = new Map();
  async function getTranslations(lead) {
    const language = languageForLead(lead);
    const slots = slotsForLead(lead);
    const cacheKey = `${lead.lead_type || 'shop'}::${language}`;
    if (!translatedCache.has(cacheKey)) {
      translatedCache.set(cacheKey, await translateSlotsForLanguages(slots, [language]));
    }
    return { language, slots, translatedByLanguage: translatedCache.get(cacheKey) };
  }

  let generated = 0;
  let failed = 0;
  // Sam, 9 Sept 2026: a lead whose translation could not be verified gets NO
  // draft — never an English one, never a mixed one. The failure and its
  // reason are stored on the draft and returned here so the screen can say
  // exactly what went wrong and that nothing was generated for those leads.
  const translationFailures = [];

  await mapPool(leads, CONCURRENCY, async (lead) => {
    try {
      const { language, slots, translatedByLanguage } = await getTranslations(lead);
      const email = buildEmailForLead({
        siteUrl: siteUrl(),
        lead,
        templateSlots: slots,
        translatedByLanguage,
        language,
        button1: { label: batch.button1_label, url: batch.button1_url },
        button2: { label: batch.button2_label, url: batch.button2_url },
        customHtml: batch.custom_html || undefined,
        subject: batch.subject || undefined,
      });

      const { error } = await auth.adminSupabase
        .from('fair_email_drafts')
        .upsert({
          batch_id: batchId,
          lead_id: lead.id,
          subject: email.subject,
          body_html: email.bodyHtml,
          language: email.language,
          status: 'draft_ready',
          error: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'lead_id' });

      if (error) throw error;
      generated += 1;
    } catch (err) {
      failed += 1;
      if (err?.name === 'TranslationUnavailableError') {
        translationFailures.push({
          leadId: lead.id,
          email: lead.email,
          name: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
          language: err.languageCode,
          languageLabel: languageLabel(err.languageCode),
          reason: err.message,
        });
      }
      // Clear any earlier body so a stale draft can never be sent by mistake:
      // the send route only picks up draft_ready rows, and this one is failed
      // with no content.
      await auth.adminSupabase
        .from('fair_email_drafts')
        .upsert({
          batch_id: batchId,
          lead_id: lead.id,
          subject: null,
          body_html: null,
          status: 'failed',
          error: err.message,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'lead_id' });
    }
  });

  await auth.adminSupabase
    .from('fair_batches')
    .update({ status: 'drafting', updated_at: new Date().toISOString() })
    .eq('id', batchId);

  return NextResponse.json({
    ok: true,
    generated,
    failed,
    total: leads.length,
    translationFailures: translationFailures.length ? translationFailures : undefined,
  });
}
