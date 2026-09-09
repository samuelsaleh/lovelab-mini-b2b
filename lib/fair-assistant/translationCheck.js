/**
 * Deterministic checks on a translated fair follow-up before it may be used.
 *
 * The model is asked for a translation; these checks decide whether to
 * believe it. They catch the failures we have actually seen — a field left
 * in English, a closing phrase from another language pasted in, the wrong
 * script — without a second opinion from a model. A translation that fails
 * here is retried once and then refused; nothing is ever sent as a guess.
 */
import { CLOSINGS_BY_LANGUAGE, normaliseClosing } from '@/lib/fair-assistant/signoff';

export const TRANSLATED_FIELDS = ['subject', 'headline', 'paragraph1', 'paragraph2', 'ctaLine'];

// Words that stay untranslated on purpose and must not count as "English".
const PROTECTED_WORDS = new Set([
  'lovelab', 'love', 'lab', 'group', 'bv', 'antwerp', 'cuty', 'cubix', 'matchy', 'triply',
  'google', 'meet', 'b2b', 'lookbook', 'vicenzaoro', 'inhorgenta', 'jck', 'bijorhca', 'bijorcha',
  'las', 'vegas', 'munich', 'milano', 'fiera', 'nordstil', 'ambiente', 'baselworld',
]);

// Very common English words that do not exist as words in any other supported
// language. Three distinct hits in one field means English is present.
const ENGLISH_MARKERS = new Set([
  'the', 'and', 'with', 'you', 'your', 'our', 'would', 'please', 'thank', 'thanks',
  'whenever', 'meeting', 'pleasure', 'looking', 'forward', 'happy', 'share', 'latest',
  'quick', 'call', 'reply', 'know', 'works', 'best', 'from', 'this', 'that', 'have',
]);

const SCRIPTS = {
  ja: /[぀-ヿ一-鿿]/u,
  zh: /[一-鿿]/u,
  ko: /[가-힯ᄀ-ᇿ㄰-㆏]/u,
  el: /[Ͱ-Ͽ]/u,
  he: /[֐-׿]/u,
};
const NON_LATIN = /[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ฀-๿぀-ヿ㄰-㆏一-鿿가-힯]/u;

function placeholdersIn(text) {
  return [...String(text || '').matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0]);
}

function words(text) {
  return String(text || '')
    .replace(/\{[a-zA-Z]+\}/g, ' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/** Words that a translator is expected to change: not placeholders, brands or numbers. */
export function translatableWords(text) {
  return words(text).filter((w) => !PROTECTED_WORDS.has(w) && !/^\d+$/.test(w) && w.length > 1);
}

function normalise(text) {
  return words(text).join(' ');
}

export function containsEnglish(text) {
  const hits = new Set(words(text).filter((w) => ENGLISH_MARKERS.has(w)));
  return hits.size >= 3;
}

/** A closing phrase from a language other than `language`, if one appears in the text. */
export function foreignClosingIn(text, language) {
  const haystack = ` ${normaliseClosing(String(text || '').replace(/\s+/g, ' '))} `;
  for (const [lang, closings] of Object.entries(CLOSINGS_BY_LANGUAGE)) {
    if (lang === language) continue;
    for (const closing of closings) {
      const needle = normaliseClosing(closing);
      // Single words ("Regards", "Cumprimentos", "敬礼") are only a closing
      // when they stand on their own line; longer phrases anywhere.
      if (!needle.includes(' ') && needle.length < 6) continue;
      if (haystack.includes(` ${needle} `) || haystack.includes(` ${needle},`) || haystack.includes(`${needle}\n`)) {
        return { closing, language: lang };
      }
    }
  }
  return null;
}

/**
 * Check a translation against its English source.
 * Returns { ok, problems: [{ field, reason }] }.
 */
export function checkTranslation({ source, translated, language }) {
  const problems = [];
  if (!translated || typeof translated !== 'object') {
    return { ok: false, problems: [{ field: '*', reason: 'no translation returned' }] };
  }
  for (const field of TRANSLATED_FIELDS) {
    const src = String(source?.[field] || '');
    const out = translated[field];
    const srcWords = translatableWords(src);
    if (!src.trim()) continue; // nothing to translate

    if (typeof out !== 'string' || !out.trim()) {
      problems.push({ field, reason: 'came back empty' });
      continue;
    }
    for (const ph of placeholdersIn(src)) {
      if (!out.includes(ph)) problems.push({ field, reason: `lost the placeholder ${ph}` });
    }
    if (language !== 'en') {
      if (srcWords.length >= 2 && normalise(out) === normalise(src)) {
        problems.push({ field, reason: 'was left in English' });
      } else if (srcWords.length >= 4 && containsEnglish(out)) {
        problems.push({ field, reason: 'still contains English' });
      }
    }
    const foreign = foreignClosingIn(out, language);
    if (foreign) problems.push({ field, reason: `contains a ${foreign.language.toUpperCase()} closing ("${foreign.closing}")` });

    if (SCRIPTS[language]) {
      if (srcWords.length >= 2 && !SCRIPTS[language].test(out)) problems.push({ field, reason: `is not written in the ${language.toUpperCase()} script` });
    } else if (NON_LATIN.test(out)) {
      problems.push({ field, reason: 'contains characters from another script' });
    }
  }
  return { ok: problems.length === 0, problems };
}

export function describeProblems(problems) {
  return (problems || []).map((p) => `${p.field} ${p.reason}`).join('; ');
}
