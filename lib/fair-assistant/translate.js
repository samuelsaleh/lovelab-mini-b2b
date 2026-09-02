import { createAnthropicMessage } from '@/lib/ai/anthropic';
import { buildGreeting } from '@/lib/fair-assistant/greeting';
import { languageLabel } from '@/lib/fair-assistant/languages';
import { fillTemplateSlots, renderFairOutreachEmail } from '@/lib/fair-assistant/email-shell';

const TRANSLATE_SYSTEM = `You translate short B2B jewelry fair follow-up email text.

OUTPUT FORMAT — strict:
- Reply with a JSON object and NOTHING ELSE. No prose before, no commentary after, no markdown fences.
- The JSON must have these keys: "subject", "headline", "paragraph1", "paragraph2", "signoff", "ctaLine". Include all six keys even if a value is an empty string.
- The "subject" should read like a natural email subject line in the target language, not a literal word-for-word translation if that sounds awkward.
- Do NOT include HTML tags.

CONTENT RULES:
- Translate ONLY the provided strings into the target language.
- Keep tone warm, professional, concise.
- Do not add facts about the company beyond what is provided.
- Preserve placeholders like {firstName}, {company}, {fairName} verbatim — do not translate them.
- "signoff" contains a closing phrase followed by a person's name and company on their own lines. Translate the closing phrase ("Warm regards" -> "Herzliche Grüße", "Cordiali saluti", ...) and keep the name, company and line breaks exactly as given. Never leave the closing phrase in English.
- Brand and product names (LoveLab, Love Group BV, CUTY, CUBIX, MATCHY, TRIPLY) and fair names stay verbatim.`;

// Pulls a JSON object out of Claude's response even when wrapped in prose or
// markdown fences. Returns the parsed object, or throws.
function extractJsonObject(text) {
  if (!text || typeof text !== 'string') throw new Error('empty response');
  // Strip markdown fences if present.
  const noFences = text.replace(/```json/gi, '').replace(/```/g, '');
  // Find the first balanced { ... } in the cleaned text.
  const start = noFences.indexOf('{');
  const end = noFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no JSON object delimiters found');
  }
  const slice = noFences.slice(start, end + 1);
  return JSON.parse(slice);
}

export async function translateEmailSlots(slots, languageCode) {
  if (languageCode === 'en') {
    return { ...slots };
  }

  const label = languageLabel(languageCode);
  // Translation is short, deterministic, and high-volume — Haiku is 3-5x cheaper
  // than Sonnet for the same quality on this task. The chat panel still runs on
  // the default (Sonnet 4.6) for better creative drafting.
  let text;
  try {
    const res = await createAnthropicMessage({
      model: 'claude-haiku-4-5',
      system: TRANSLATE_SYSTEM,
      maxTokens: 800,
      messages: [{
        role: 'user',
        content: `Target language: ${label} (${languageCode})\n\nTranslate these fields. Return ONLY a JSON object:\n${JSON.stringify(slots, null, 2)}`,
      }],
    });
    text = res.text;
  } catch (err) {
    // Anthropic API call failed entirely. Log and fall back to English so
    // the send still goes out (better than blocking the batch).
    console.error(`[translate ${languageCode}] Anthropic call failed:`, err.message);
    return { ...slots, __translationFailed: true, __translationError: err.message };
  }

  try {
    const parsed = extractJsonObject(text);
    // Sanity-check: every required key should be a string. If anything is
    // missing or non-string, fall back to the English version for that key.
    // 'subject' MUST be in this list. It was omitted originally, so the
    // translated subject Claude returned was thrown away and every lead —
    // Italian, German, Japanese — received an English subject line sitting
    // on top of a translated body.
    const required = ['subject', 'headline', 'paragraph1', 'paragraph2', 'signoff', 'ctaLine'];
    const merged = { ...slots };
    for (const key of required) {
      if (typeof parsed[key] === 'string') merged[key] = parsed[key];
    }
    return merged;
  } catch (err) {
    // This is the silent-bug case Sam hit: Italian lead, English email. Now
    // we log enough to debug WHY parsing failed without taking the whole
    // batch down.
    console.error(
      `[translate ${languageCode}] JSON parse failed: ${err.message}\n` +
      `--- raw response (first 800 chars) ---\n` +
      `${(text || '').slice(0, 800)}\n` +
      `--- end raw ---`
    );
    return { ...slots, __translationFailed: true, __translationError: err.message };
  }
}

export function buildEmailForLead({
  siteUrl,
  lead,
  templateSlots,
  translatedByLanguage,
  languages,
  button1,
  button2,
  customHtml,
  subject: explicitSubject,
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
      subject: fillTemplateSlots(base.subject || templateSlots.subject, vars),
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
    // The email shell already renders the PRIMARY language's greeting and
    // paragraph1 above this slot. Repeating every block here (primary
    // included) printed the French greeting and opening paragraph twice to
    // every Belgian lead. Only the secondary languages get a full block.
    const secondaryBlocks = blocks.slice(1).map((block) => {
      return [block.greeting, block.paragraph1, block.paragraph2].filter(Boolean).join('\n\n');
    });
    combinedParagraph2 = [primary.paragraph2, ...secondaryBlocks]
      .filter(Boolean)
      .join('\n\n---\n\n');
  }

  const html = renderFairOutreachEmail({
    siteUrl,
    greeting: primary.greeting,
    headline: primary.headline,
    // fairName is a proper noun — don't translate; show it as the gold subtitle.
    fairName: vars.fairName,
    paragraph1: primary.paragraph1,
    paragraph2: blocks.length > 1 ? combinedParagraph2 : primary.paragraph2,
    signoff: primary.signoff,
    ctaLine: primary.ctaLine,
    button1,
    button2,
    // customHtml gets {firstName}/{company}/{fairName} interpolation so the
    // pasted Claude HTML can still personalize per recipient.
    customHtml: customHtml ? fillTemplateSlots(customHtml, vars) : undefined,
  });

  // Subject lives in templateSlots so it goes through translation alongside
  // the body copy — Sam writes "Following up from Vicenzaoro" in English and
  // an Italian lead receives a natural Italian subject line.
  // explicitSubject is kept as a tiebreaker for callers that bypass the
  // template flow entirely (e.g. one-off preview); fall through to the
  // translated subject, then headline, then a generic fallback.
  const subject = primary.subject
    ? primary.subject
    : explicitSubject
      ? fillTemplateSlots(explicitSubject, vars)
      : (primary.headline || 'Following up from LoveLab');

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
