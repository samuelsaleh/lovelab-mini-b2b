/**
 * Build greeting line for outreach emails.
 * If no first name, use the language's bare greeting — never invent a name.
 *
 * Every language in lib/fair-assistant/languages.js LANGUAGE_LABELS must have
 * an entry here. A missing entry used to fall back to English, which produced
 * "Hi Piotr," sitting on top of an otherwise fully Polish email.
 */
const GREETINGS = {
  en: { named: (n) => `Hi ${n},`, bare: 'Hi,' },
  fr: { named: (n) => `Bonjour ${n},`, bare: 'Bonjour,' },
  nl: { named: (n) => `Hallo ${n},`, bare: 'Hallo,' },
  de: { named: (n) => `Hallo ${n},`, bare: 'Hallo,' },
  it: { named: (n) => `Ciao ${n},`, bare: 'Ciao,' },
  es: { named: (n) => `Hola ${n},`, bare: 'Hola,' },
  pt: { named: (n) => `Olá ${n},`, bare: 'Olá,' },
  // "Dzień dobry" rather than "Cześć" — these are B2B fair contacts, not friends.
  pl: { named: (n) => `Dzień dobry ${n},`, bare: 'Dzień dobry,' },
  el: { named: (n) => `Γεια σας ${n},`, bare: 'Γεια σας,' },
  tr: { named: (n) => `Merhaba ${n},`, bare: 'Merhaba,' },
  he: { named: (n) => `שלום ${n},`, bare: 'שלום,' },
  // CJK: the honorific follows the name, so these are not "Hi {name}" shaped.
  ja: { named: (n) => `${n}様`, bare: 'ご担当者様' },
  zh: { named: (n) => `${n} 您好，`, bare: '您好，' },
  ko: { named: (n) => `${n}님, 안녕하세요,`, bare: '안녕하세요,' },
};

export function buildGreeting(firstName, language = 'en') {
  const name = (firstName || '').trim();
  const g = GREETINGS[language] || GREETINGS.en;
  return name ? g.named(name) : g.bare;
}
