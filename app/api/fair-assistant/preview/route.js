import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin, siteUrl } from '@/lib/fair-assistant/server';
import { buildEmailForLead, translateSlotsForLanguages } from '@/lib/fair-assistant/translate';
import { languagesForCountry } from '@/lib/fair-assistant/languages';

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-preview' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const batchId = body.batchId;
  const leadId = body.leadId;

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

  let leadQuery = auth.adminSupabase.from('fair_leads').select('*').eq('batch_id', batchId);
  if (leadId) {
    leadQuery = leadQuery.eq('id', leadId);
  } else {
    leadQuery = leadQuery.limit(1);
  }

  const { data: leads, error: leadsErr } = await leadQuery;
  if (leadsErr || !leads?.length) {
    return NextResponse.json({ error: 'No leads available for preview' }, { status: 400 });
  }

  const lead = leads[0];
  const templateSlots = {
    headline: batch.headline,
    paragraph1: batch.paragraph1,
    paragraph2: batch.paragraph2,
    signoff: batch.signoff,
    fairName: batch.fair_name || batch.name,
    ctaLine: 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.',
  };

  const languages = languagesForCountry(lead.country);
  const translatedByLanguage = await translateSlotsForLanguages(templateSlots, languages);
  const email = buildEmailForLead({
    siteUrl: siteUrl(),
    lead,
    templateSlots,
    translatedByLanguage,
    languages,
  });

  return NextResponse.json({
    preview: email,
    lead: {
      id: lead.id,
      first_name: lead.first_name,
      company: lead.company,
      country: lead.country,
      languages,
    },
  });
}
