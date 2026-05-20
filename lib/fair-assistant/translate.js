import { createAnthropicMessage } from '@/lib/ai/anthropic';
import { buildGreeting } from '@/lib/fair-assistant/greeting';
import { languageLabel } from '@/lib/fair-assistant/languages';
import { fillTemplateSlots, renderFairOutreachEmail } from '@/lib/fair-assistant/email-shell';

const TRANSLATE_SYSTEM = `You translate short B2B jewelry fair follow-up email text.
Rules:
- Translate ONLY the provided strings into the target language.
- Keep tone warm, professional, concise.
- Do not add facts about the company beyond what is provided.
- Return valid JSON only with keys: headline, paragraph1, paragraph2, signoff, ctaLine.
- Do not include HTML tags.`;

export async function translateEmailSlots(slots, languageCode) {
  if (languageCode === 'en') {
    return { ...slots };
  }

  const label = languageLabel(languageCode);
  // Translation is short, deterministic, and high-volume — Haiku is 3-5x cheaper
  // than Sonnet for the same quality on this task. The chat panel still runs on
  // the default (Sonnet 4.6) for better creative drafting.
  const { text } = await createAnthropicMessage({
    model: 'claude-haiku-4-5',
    system: TRANSLATE_SYSTEM,
    maxTokens: 800,
    messages: [{
      role: 'user',
      content: `Target language: ${label} (${languageCode})\n\nTranslate these fields:\n${JSON.stringify(slots, null, 2)}`,
    }],
  });

  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { ...slots };
  }
}

export function buildEmailForLead({
  siteUrl,
  lead,
  templateSlots,
  translatedByLanguage,
  languages,
}) {
  const vars = {
    firstName: lead.first_name || '',
    lastName: lead.last_name || '',
    company: lead.company || '',
    fairName: templateSlots.fairName || '',
    date: templateSlots.date || '',
  };

  const blocks = languages.map((lang) => {
    const base = translatedByLanguage[lang] || templateSlots;
    const greeting = buildGreeting(lead.first_name, lang);
    return {
      lang,
      greeting,
      headline: fillTemplateSlots(base.headline, vars),
      paragraph1: fillTemplateSlots(base.paragraph1, vars),
      paragraph2: fillTemplateSlots(base.paragraph2, vars),
      signoff: fillTemplateSlots(base.signoff, vars),
      ctaLine: fillTemplateSlots(base.ctaLine || templateSlots.ctaLine, vars),
    };
  });

  const primary = blocks[0];
  let combinedParagraph2 = primary.paragraph2 || '';
  if (blocks.length > 1) {
    combinedParagraph2 = blocks.map((block) => {
      return [block.greeting, block.paragraph1, block.paragraph2].filter(Boolean).join('\n\n');
    }).join('\n\n---\n\n');
  }

  const html = renderFairOutreachEmail({
    siteUrl,
    greeting: primary.greeting,
    headline: primary.headline,
    paragraph1: primary.paragraph1,
    paragraph2: blocks.length > 1 ? combinedParagraph2 : primary.paragraph2,
    signoff: primary.signoff,
    ctaLine: primary.ctaLine,
  });

  const subject = primary.headline || 'Following up from LoveLab';

  return {
    subject,
    bodyHtml: html,
    languages: languages.join('+'),
  };
}

export async function translateSlotsForLanguages(templateSlots, languageCodes) {
  const unique = [...new Set(languageCodes)];
  const translatedByLanguage = { en: templateSlots };

  for (const lang of unique) {
    if (lang === 'en') continue;
    translatedByLanguage[lang] = await translateEmailSlots(templateSlots, lang);
  }

  return translatedByLanguage;
}
