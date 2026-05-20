/** Map country names (as extracted by n8n) to ISO-ish language codes for translation. */
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
  const normalized = country.trim();
  if (COUNTRY_LANGUAGES[normalized]) {
    return COUNTRY_LANGUAGES[normalized];
  }
  const match = Object.keys(COUNTRY_LANGUAGES).find(
    (key) => key.toLowerCase() === normalized.toLowerCase()
  );
  return match ? COUNTRY_LANGUAGES[match] : ['en'];
}

export function languageLabel(code) {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

export function primaryLanguageForCountry(country) {
  return languagesForCountry(country)[0] || 'en';
}
