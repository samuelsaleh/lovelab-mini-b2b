import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin, siteUrl } from '@/lib/fair-assistant/server';
import { buildEmailForLead, translateSlotsForLanguages } from '@/lib/fair-assistant/translate';
import { languagesForCountry } from '@/lib/fair-assistant/languages';
import { defaultTemplateForLeadType } from '@/lib/fair-assistant/templates';

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-preview' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const batchId = body.batchId;
  const leadId = body.leadId;
  const overrides = body.overrides || null;
  const allowPlaceholder = body.allowPlaceholder === true;

  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const { data: batchRow, error: batchErr } = await auth.adminSupabase
    .from('fair_batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (batchErr || !batchRow) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  // Merge in any unsaved field values from the live preview so the user can
  // see their edits before they blur the input. Translation is skipped when
  // overrides are present (live preview is always in the source language —
  // makes typing feel instant instead of waiting for Claude on every keystroke).
  const batch = overrides ? { ...batchRow, ...overrides } : batchRow;
  const skipTranslation = Boolean(overrides);

  let leadQuery = auth.adminSupabase.from('fair_leads').select('*').eq('batch_id', batchId);
  if (leadId) {
    leadQuery = leadQuery.eq('id', leadId);
  } else {
    leadQuery = leadQuery.limit(1);
  }

  const { data: leads, error: leadsErr } = await leadQuery;
  if (leadsErr) {
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }

  // No leads yet? Live preview passes allowPlaceholder=true so the user can
  // still see the email shell with a generic recipient. Explicit /preview
  // calls (Open big preview button) leave allowPlaceholder false and 400.
  const lead = leads?.length ? leads[0] : (allowPlaceholder ? {
    id: 'placeholder',
    first_name: '',
    last_name: '',
    company: '',
    email: '',
    country: '',
    lead_type: 'shop',
    language: 'en',
    language_label: 'English',
  } : null);

  if (!lead) {
    return NextResponse.json({ error: 'No leads available for preview' }, { status: 400 });
  }
  const fairName = batch.fair_name || batch.name;
  const ctaLine = batch.cta_line || 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.';

  // forceLeadType lets the Outreach tab preview a specific template (e.g. the
  // user is editing the Agents tab — show the agent email even if the first
  // lead is a shop). Defaults to the actual lead's type.
  const renderedType = body.forceLeadType || lead.lead_type || 'shop';
  const useTypeTemplate = renderedType && renderedType !== 'shop' && renderedType !== 'other';
  const templateSlots = useTypeTemplate
    ? (() => {
        const tpl = defaultTemplateForLeadType(renderedType);
        const prefix = renderedType; // 'agent' or 'partner'
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
      })()
    : {
        subject: batch.subject || batch.headline,
        headline: batch.headline,
        paragraph1: batch.paragraph1,
        paragraph2: batch.paragraph2,
        signoff: batch.signoff,
        fairName,
        ctaLine,
      };

  const languages = languagesForCountry(lead.country);
  const translatedByLanguage = skipTranslation
    ? { en: templateSlots }
    : await translateSlotsForLanguages(templateSlots, languages);
  // Force EN when previewing unsaved edits so we don't fall through to the
  // (now empty) translated map for non-English leads.
  const previewLanguages = skipTranslation ? ['en'] : languages;
  const email = buildEmailForLead({
    siteUrl: siteUrl(),
    lead,
    templateSlots,
    translatedByLanguage,
    languages: previewLanguages,
    button1: { label: batch.button1_label, url: batch.button1_url },
    button2: { label: batch.button2_label, url: batch.button2_url },
    customHtml: batch.custom_html || undefined,
    subject: batch.subject || undefined,
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
