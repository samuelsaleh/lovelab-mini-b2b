/**
 * The sign-off of a fair follow-up email is never written by the model.
 *
 * Sam, 9 Sept 2026: a Dutch email and a French email both ended with
 * "Herzliche Grüße" — the translation prompt used it as an example and the
 * model copied it. The rule now: the closing phrase is a fixed string per
 * language, chosen here, and the name and company lines under it are taken
 * verbatim from the template. Nothing in the sign-off passes through Claude.
 */

// One closing per supported language. Keep this list in step with
// LANGUAGE_LABELS in languages.js — a language without an entry cannot be
// emailed (the translation is refused rather than sent with a guess).
export const CLOSINGS = {
  en: 'Kind regards,',
  fr: 'Bien cordialement,',
  nl: 'Met vriendelijke groet,',
  de: 'Mit freundlichen Grüßen,',
  it: 'Cordiali saluti,',
  es: 'Un cordial saludo,',
  pt: 'Com os melhores cumprimentos,',
  pl: 'Z poważaniem,',
  el: 'Με εκτίμηση,',
  tr: 'Saygılarımla,',
  he: 'בברכה,',
  ja: 'どうぞよろしくお願いいたします。',
  zh: '此致敬礼，',
  ko: '감사합니다.',
};

// Closings the model is known to produce, grouped by language, so a stray one
// can be recognised in a template's first line and inside a translation
// (a Dutch email must never contain a German closing, and so on).
export const CLOSINGS_BY_LANGUAGE = {
  en: ['Kind regards,', 'Warm regards,', 'Best regards,', 'Regards,', 'Sincerely,', 'Best wishes,', 'Warm wishes,'],
  fr: ['Bien cordialement,', 'Cordialement,', 'Bien à vous,', 'Meilleures salutations,', 'Cordiales salutations,', 'Sincères salutations,'],
  nl: ['Met vriendelijke groet,', 'Met vriendelijke groeten,', 'Hartelijke groeten,', 'Vriendelijke groeten,', 'Hartelijke groet,'],
  de: ['Mit freundlichen Grüßen,', 'Herzliche Grüße,', 'Viele Grüße,', 'Beste Grüße,', 'Freundliche Grüße,', 'Liebe Grüße,', 'Mit besten Grüßen,'],
  it: ['Cordiali saluti,', 'Distinti saluti,', 'Un caro saluto,', 'Un cordiale saluto,', 'Cari saluti,'],
  es: ['Un cordial saludo,', 'Saludos cordiales,', 'Atentamente,', 'Un saludo,', 'Cordialmente,'],
  pt: ['Com os melhores cumprimentos,', 'Atenciosamente,', 'Cumprimentos,', 'Cordialmente,', 'Com os melhores cumprimentos,'],
  pl: ['Z poważaniem,', 'Pozdrawiam,', 'Z wyrazami szacunku,', 'Pozdrawiam serdecznie,'],
  el: ['Με εκτίμηση,', 'Με φιλικούς χαιρετισμούς,', 'Φιλικά,'],
  tr: ['Saygılarımla,', 'Saygılarımızla,', 'İyi çalışmalar,'],
  he: ['בברכה,', 'בכבוד רב,'],
  ja: ['どうぞよろしくお願いいたします。', 'よろしくお願いいたします。', '敬具'],
  zh: ['此致敬礼，', '此致', '敬礼', '顺祝商祺'],
  ko: ['감사합니다.', '감사합니다,', '드림'],
};

export function normaliseClosing(line) {
  return String(line || '').trim().replace(/[,.。，、:：!]+$/u, '').toLowerCase();
}

const CLOSING_LANGUAGE = new Map();
for (const [lang, list] of Object.entries(CLOSINGS_BY_LANGUAGE)) {
  for (const closing of list) CLOSING_LANGUAGE.set(normaliseClosing(closing), lang);
}

/** The language a known closing phrase belongs to, or null. */
export function closingLanguage(line) {
  return CLOSING_LANGUAGE.get(normaliseClosing(line)) || null;
}

/** True when a line reads like a closing phrase rather than a name or company. */
export function looksLikeClosing(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (closingLanguage(trimmed)) return true;
  // "Warm regards," / "Hartelijke groet," — a short phrase ending in a comma.
  return /[,，、]$/u.test(trimmed) && trimmed.split(/\s+/).length <= 5;
}

/**
 * Build the sign-off for one language from the template's sign-off.
 *
 * The template's first line is the closing phrase Alberto typed in English
 * ("Warm regards,"); it is replaced by this language's fixed closing. Every
 * line after it — name, company — is kept exactly as written. A template
 * with no closing line at all gets one put in front. For English the
 * template's own English closing is kept, since that is what was typed.
 */
export function buildSignoff(templateSignoff, language = 'en') {
  const lines = String(templateSignoff || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstIsClosing = lines.length > 0 && looksLikeClosing(lines[0]);
  const nameLines = firstIsClosing ? lines.slice(1) : lines;

  let closing = CLOSINGS[language] || CLOSINGS.en;
  if (language === 'en' && firstIsClosing && closingLanguage(lines[0]) === 'en') closing = lines[0];

  return [closing, ...nameLines].join('\n');
}

/** Whether a fixed closing exists for this language. */
export function hasClosing(language) {
  return Object.prototype.hasOwnProperty.call(CLOSINGS, language);
}
