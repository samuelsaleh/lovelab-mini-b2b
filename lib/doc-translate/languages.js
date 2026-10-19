// Languages offered by the admin "Translate to…" menu. Limited to the scripts the
// bundled PDF fonts cover (Latin, Greek, Cyrillic); Arabic, Hebrew, CJK, Thai and
// Hindi need extra fonts and right-to-left shaping and are not offered yet.
export const TRANSLATION_LANGUAGES = [
  { code: 'cs', name: 'Czech', native: 'Čeština' },
  { code: 'da', name: 'Danish', native: 'Dansk' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'no', name: 'Norwegian', native: 'Norsk' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
]

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Prefix match on the English or the native name: typing "f" lists French and Finnish.
export function filterLanguages(query) {
  const q = fold(query)
  if (!q) return TRANSLATION_LANGUAGES
  return TRANSLATION_LANGUAGES.filter((l) => fold(l.name).startsWith(q) || fold(l.native).startsWith(q))
}

export function languageName(code) {
  return TRANSLATION_LANGUAGES.find((l) => l.code === code)?.name || code
}
