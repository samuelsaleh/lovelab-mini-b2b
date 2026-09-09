import { createAnthropicMessage } from '@/lib/ai/anthropic';
import { buildGreeting } from '@/lib/fair-assistant/greeting';
import { languageLabel, isSupportedLanguage } from '@/lib/fair-assistant/languages';
import { buildSignoff, hasClosing } from '@/lib/fair-assistant/signoff';
import { checkTranslation, describeProblems, TRANSLATED_FIELDS } from '@/lib/fair-assistant/translationCheck';
import { fillTemplateSlots, renderFairOutreachEmail } from '@/lib/fair-assistant/email-shell';

// Sam, 9 Sept 2026: a Dutch and a French follow-up both ended in a German
// closing, copied from an example in this very prompt. The rules now:
//   - the sign-off never goes through the model (lib/fair-assistant/signoff.js);
//   - one email is written in exactly one language;
//   - every translation is checked, retried once, and otherwise REFUSED —
//     an unverified translation is never sent, and English is never sent to
//     a lead whose language is something else.
const TRANSLATE_SYSTEM = `You translate short B2B jewelry fair follow-up email text into ONE target language.

OUTPUT FORMAT — strict:
- Reply with a JSON object and NOTHING ELSE. No prose before, no commentary after, no markdown fences.
- The JSON must have exactly these keys: "subject", "headline", "paragraph1", "paragraph2", "ctaLine". Include every key even if a value is an empty string.
- Do NOT include HTML tags.

CONTENT RULES:
- Every word of every value must be in the target language. Never leave a sentence, phrase or word in English or in any other language. Never mix languages.
- Do not add a greeting or a closing phrase (no "regards", no "salutations", nothing of that kind): the greeting and the sign-off are added separately.
- The "subject" should read like a natural email subject line in the target language, not a literal word-for-word translation if that sounds awkward.
- Keep tone warm, professional, concise. Do not add facts about the company beyond what is provided.
- Preserve placeholders like {firstName}, {company}, {fairName} verbatim — do not translate them.
- Brand and product names (LoveLab, Love Group BV, CUTY, CUBIX, MATCHY, TRIPLY), fair names, place names and URLs stay verbatim.`;

const VERIFY_SYSTEM = `You check the language of short email text. Reply with a JSON object and NOTHING ELSE: {"ok": true} when every field is written entirely in the target language, otherwise {"ok": false, "problems": ["<field>: <what is in the wrong language>"]}.
Brand names, product names, fair names, place names, personal names, URLs and placeholders like {firstName} are allowed in any field. Anything else — a sentence, a phrase, a closing formula — in a language other than the target is a problem. Do not judge style or tone.`;

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

function pickTranslatable(slots) {
  const out = {};
  for (const field of TRANSLATED_FIELDS) out[field] = String(slots?.[field] || '');
  return out;
}

function refused(slots, languageCode, reason) {
  const label = languageLabel(languageCode);
  const message = `Translation to ${label} was refused: ${reason}`;
  console.error(`[translate ${languageCode}] ${message}`);
  return { ...slots, __translationFailed: true, __translationError: message };
}

async function askForTranslation({ createMessage, label, languageCode, source, previousProblems }) {
  const feedback = previousProblems
    ? `\n\nYour previous attempt was rejected because: ${previousProblems}. Fix this. Every value must be entirely in ${label}.`
    : '';
  const res = await createMessage({
    // Sonnet 5 writes these, not Haiku. They go to real buyers met at a fair, in
    // their own language, over Alberto's name — register and idiom matter more
    // than the per-call saving, and translations are cached per
    // (lead_type, language) in generate-all, so one call covers a whole batch.
    model: 'claude-sonnet-5',
    system: TRANSLATE_SYSTEM,
    maxTokens: 800,
    messages: [{
      role: 'user',
      content: `Target language: ${label} (${languageCode})\n\nTranslate these fields. Return ONLY a JSON object:\n${JSON.stringify(source, null, 2)}${feedback}`,
    }],
  });
  const parsed = extractJsonObject(res.text);
  const translated = {};
  for (const field of TRANSLATED_FIELDS) translated[field] = typeof parsed[field] === 'string' ? parsed[field] : '';
  return translated;
}

// Second opinion from a cheap model: is every field really in the target
// language? Catches what the word lists in translationCheck cannot (a German
// paragraph in a Dutch email). If the check itself cannot run, the
// deterministic checks that already passed stand — the send is not blocked
// by a verification outage, and the outage is logged.
async function verifyLanguage({ createMessage, label, languageCode, translated }) {
  try {
    const res = await createMessage({
      model: 'claude-haiku-4-5-20251001',
      system: VERIFY_SYSTEM,
      maxTokens: 300,
      messages: [{
        role: 'user',
        content: `Target language: ${label} (${languageCode})\n\n${JSON.stringify(translated, null, 2)}`,
      }],
    });
    const parsed = extractJsonObject(res.text);
    if (parsed.ok === true) return { ok: true };
    const problems = Array.isArray(parsed.problems) && parsed.problems.length
      ? parsed.problems.map(String).join('; ')
      : 'the language check reported a problem';
    return { ok: false, problems };
  } catch (err) {
    console.error(`[translate ${languageCode}] language verification could not run:`, err.message);
    return { ok: true, unverified: true };
  }
}

/**
 * Translate the body slots of a template into one language.
 *
 * Returns the slots in that language with a fixed sign-off, or the English
 * slots tagged __translationFailed / __translationError. Callers must treat
 * a tagged result as "no email" — buildEmailForLead throws on it.
 */
export async function translateEmailSlots(slots, languageCode, deps = {}) {
  const createMessage = deps.createMessage || createAnthropicMessage;

  if (languageCode === 'en') {
    return { ...slots, signoff: buildSignoff(slots.signoff, 'en') };
  }
  if (!isSupportedLanguage(languageCode) || !hasClosing(languageCode)) {
    return refused(slots, languageCode, `${languageCode} is not a language this tool can write in`);
  }

  const label = languageLabel(languageCode);
  const source = pickTranslatable(slots);
  let previousProblems = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let translated;
    try {
      translated = await askForTranslation({ createMessage, label, languageCode, source, previousProblems });
    } catch (err) {
      // API failure or unparseable reply. Log enough to debug and try once
      // more; a second failure refuses the translation rather than sending
      // English to a non-English lead.
      console.error(`[translate ${languageCode}] attempt ${attempt} failed: ${err.message}`);
      previousProblems = `the reply could not be read (${err.message})`;
      continue;
    }

    const check = checkTranslation({ source, translated, language: languageCode });
    if (!check.ok) {
      previousProblems = describeProblems(check.problems);
      console.warn(`[translate ${languageCode}] attempt ${attempt} rejected: ${previousProblems}`);
      continue;
    }

    const verified = await verifyLanguage({ createMessage, label, languageCode, translated });
    if (!verified.ok) {
      previousProblems = verified.problems;
      console.warn(`[translate ${languageCode}] attempt ${attempt} rejected by language check: ${previousProblems}`);
      continue;
    }

    return {
      ...slots,
      ...translated,
      signoff: buildSignoff(slots.signoff, languageCode),
      __verified: !verified.unverified,
    };
  }

  return refused(slots, languageCode, previousProblems || 'no usable translation after two attempts');
}

export class TranslationUnavailableError extends Error {
  constructor(languageCode, detail) {
    super(detail || `No verified ${languageLabel(languageCode)} translation is available, so no email was built.`);
    this.name = 'TranslationUnavailableError';
    this.languageCode = languageCode;
  }
}

/**
 * Build one lead's email in ONE language.
 *
 * `language` is the lead's language (lib/fair-assistant/languages.js
 * languageForLead). For anything but English a verified translation must be
 * present in translatedByLanguage; otherwise this throws rather than
 * silently falling back to English or mixing languages.
 */
export function buildEmailForLead({
  siteUrl,
  lead,
  templateSlots,
  translatedByLanguage,
  language,
  languages, // legacy: first entry used
  button1,
  button2,
  customHtml,
  subject: explicitSubject,
}) {
  const lang = language || (Array.isArray(languages) && languages[0]) || 'en';

  let base;
  if (lang === 'en') {
    base = translatedByLanguage?.en || { ...templateSlots, signoff: buildSignoff(templateSlots.signoff, 'en') };
  } else {
    base = translatedByLanguage?.[lang];
    if (!base) throw new TranslationUnavailableError(lang);
    if (base.__translationFailed) throw new TranslationUnavailableError(lang, base.__translationError);
  }

  const vars = {
    firstName: lead.first_name || '',
    lastName: lead.last_name || '',
    company: lead.company || '',
    fairName: templateSlots.fairName || '',
    date: templateSlots.date || '',
  };

  const block = {
    greeting: buildGreeting(lead.first_name, lang),
    subject: fillTemplateSlots(base.subject || templateSlots.subject, vars),
    headline: fillTemplateSlots(base.headline, vars),
    paragraph1: fillTemplateSlots(base.paragraph1, vars),
    paragraph2: fillTemplateSlots(base.paragraph2, vars),
    // Fixed per language, name and company verbatim — never from the model.
    signoff: fillTemplateSlots(buildSignoff(templateSlots.signoff, lang), vars),
    ctaLine: fillTemplateSlots(base.ctaLine || templateSlots.ctaLine, vars),
  };

  const html = renderFairOutreachEmail({
    siteUrl,
    greeting: block.greeting,
    headline: block.headline,
    // fairName is a proper noun — don't translate; show it as the gold subtitle.
    fairName: vars.fairName,
    paragraph1: block.paragraph1,
    paragraph2: block.paragraph2,
    signoff: block.signoff,
    ctaLine: block.ctaLine,
    button1,
    button2,
    // customHtml gets {firstName}/{company}/{fairName} interpolation so the
    // pasted Claude HTML can still personalize per recipient.
    customHtml: customHtml ? fillTemplateSlots(customHtml, vars) : undefined,
    // Section heading, pills, contact label and default buttons follow the
    // email's language too — see chrome-strings.js.
    lang,
  });

  // Subject lives in templateSlots so it goes through translation alongside
  // the body copy — Sam writes "Following up from Vicenzaoro" in English and
  // an Italian lead receives a natural Italian subject line.
  // explicitSubject is kept as a tiebreaker for callers that bypass the
  // template flow entirely (e.g. one-off preview); fall through to the
  // translated subject, then headline, then a generic fallback.
  const subject = block.subject
    ? block.subject
    : explicitSubject
      ? fillTemplateSlots(explicitSubject, vars)
      : (block.headline || 'Following up from LoveLab');

  return {
    subject,
    bodyHtml: html,
    language: lang,
    languages: lang,
  };
}

export async function translateSlotsForLanguages(templateSlots, languageCodes, deps = {}) {
  const unique = [...new Set(languageCodes)];
  const translatedByLanguage = { en: { ...templateSlots, signoff: buildSignoff(templateSlots.signoff, 'en') } };

  for (const lang of unique) {
    if (lang === 'en') continue;
    translatedByLanguage[lang] = await translateEmailSlots(templateSlots, lang, deps);
  }

  return translatedByLanguage;
}
