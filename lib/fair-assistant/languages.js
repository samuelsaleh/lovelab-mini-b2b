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

  // Fast path: already an English country name we know.
  if (COUNTRY_LANGUAGES[raw]) {
    return COUNTRY_LANGUAGES[raw];
  }
  const direct = Object.keys(COUNTRY_LANGUAGES).find(
    (key) => key.toLowerCase() === raw.toLowerCase()
  );
  if (direct) return COUNTRY_LANGUAGES[direct];

  // Business cards print the country in their OWN language ("Deutschland",
  // "Italia", "Polska") or as a bare ISO code ("DE", "IT"). Before this,
  // every one of those missed the table above and the lead silently got an
  // English email. normalizeCountry() maps them onto the canonical English
  // name via lib/countries.js COUNTRY_ALIASES.
  const normalized = normalizeCountry(raw);
  if (normalized && normalized !== 'Unknown' && COUNTRY_LANGUAGES[normalized]) {
    return COUNTRY_LANGUAGES[normalized];
  }

  return ['en'];
}

export function languageLabel(code) {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

export function primaryLanguageForCountry(country) {
  return languagesForCountry(country)[0] || 'en';
}
