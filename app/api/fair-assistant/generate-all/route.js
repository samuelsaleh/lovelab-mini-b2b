import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin, siteUrl } from '@/lib/fair-assistant/server';
import { buildEmailForLead, translateSlotsForLanguages } from '@/lib/fair-assistant/translate';
import { languagesForCountry } from '@/lib/fair-assistant/languages';

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

  const templateSlots = {
    headline: batch.headline,
    paragraph1: batch.paragraph1,
    paragraph2: batch.paragraph2,
    signoff: batch.signoff,
    fairName: batch.fair_name || batch.name,
    ctaLine: batch.cta_line || 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.',
  };

  const uniqueLanguageSets = new Map();
  for (const lead of leads) {
    const langs = languagesForCountry(lead.country);
    const key = langs.join('+');
    if (!uniqueLanguageSets.has(key)) uniqueLanguageSets.set(key, langs);
  }

  const translatedCache = {};
  for (const [key, langs] of uniqueLanguageSets) {
    translatedCache[key] = await translateSlotsForLanguages(templateSlots, langs);
  }

  let generated = 0;
  let failed = 0;

  await mapPool(leads, CONCURRENCY, async (lead) => {
    const langs = languagesForCountry(lead.country);
    const cacheKey = langs.join('+');
    const translatedByLanguage = translatedCache[cacheKey];

    try {
      const email = buildEmailForLead({
        siteUrl: siteUrl(),
        lead,
        templateSlots,
        translatedByLanguage,
        languages: langs,
      });

      const { error } = await auth.adminSupabase
        .from('fair_email_drafts')
        .upsert({
          batch_id: batchId,
          lead_id: lead.id,
          subject: email.subject,
          body_html: email.bodyHtml,
          language: email.languages,
          status: 'draft_ready',
          error: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'lead_id' });

      if (error) throw error;
      generated += 1;
    } catch (err) {
      failed += 1;
      await auth.adminSupabase
        .from('fair_email_drafts')
        .upsert({
          batch_id: batchId,
          lead_id: lead.id,
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

  return NextResponse.json({ ok: true, generated, failed, total: leads.length });
}
