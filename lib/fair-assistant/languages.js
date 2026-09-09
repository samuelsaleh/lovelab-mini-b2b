/** Map country names (as extracted by n8n) to ISO-ish language codes for translation. */
import { normalizeCountry } from '@/lib/countries';
const COUNTRY_LANGUAGES = {
  Italy: ['it'],
  France: ['fr'],
  Germany: ['de'],
  Spain: ['es'],
  Portugal: ['pt'],
  Netherlands: ['nl'],
  Belgium: ['fr', 'nl'],
  Switzerland: ['de', 'fr'],
  Luxembourg: ['fr', 'de'],
  Canada: ['en', 'fr'],
  China: ['zh'],
  Japan: ['ja'],
  'South Korea': ['ko'],
  'United Arab Emirates': ['en'],
  'United States': ['en'],
  'United Kingdom': ['en'],
  Ireland: ['en'],
  Austria: ['de'],
  Poland: ['pl'],
  Greece: ['el'],
  Turkey: ['tr'],
  Israel: ['he'],
  India: ['en'],
  Australia: ['en'],
  Brazil: ['pt'],
  Mexico: ['es'],
  Argentina: ['es'],
};

const LANGUAGE_LABELS = {
  en: 'English',
  fr: 'French',
  nl: 'Dutch',
  de: 'German',
  it: 'Italian',
  es: 'Spanish',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  pl: 'Polish',
  el: 'Greek',
  tr: 'Turkish',
  he: 'Hebrew',
};

export function languagesForCountry(country) {
  if (!country || country.trim() === '' || country === 'Not Available') {
    return ['en'];
  }
  const raw = country.trim();

  if (COUNTRY_LANGUAGES[raw]) {
    return COUNTRY_LANGUAGES[raw];
  }
  const match = Object.keys(COUNTRY_LANGUAGES).find(
    (key) => key.toLowerCase() === raw.toLowerCase()
  );
  if (match) return COUNTRY_LANGUAGES[match];

  // Business cards print the country in their OWN language ("Deutschland",
  // "Italia", "Polska") or as a bare ISO code ("DE"). Every one of those used
  // to miss the table above and the lead silently got an English email.
  // normalizeCountry() maps them onto the canonical English name.
  const normalized = normalizeCountry(raw);
  if (normalized && normalized !== 'Unknown' && COUNTRY_LANGUAGES[normalized]) {
    return COUNTRY_LANGUAGES[normalized];
  }

  return ['en'];
}

export function languageLabel(code) {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_LABELS);

export function isSupportedLanguage(code) {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, code);
}

export function primaryLanguageForCountry(country) {
  return languagesForCountry(country)[0] || 'en';
}

/**
 * The ONE language a lead's email is written in.
 *
 * Sam, 9 Sept 2026: an email is never in two languages. The lead's own
 * language (set on the card or in Edit Lead) wins; an old combined value
 * such as "fr+nl" resolves to its first part; otherwise the country's
 * first language. Always a single supported code.
 */
export function languageForLead(lead) {
  const raw = String(lead?.language || '').trim().toLowerCase();
  if (raw) {
    const first = raw.split('+').map((s) => s.trim()).find(isSupportedLanguage);
    if (first) return first;
  }
  return primaryLanguageForCountry(lead?.country);
}
