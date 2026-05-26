/**
 * Build greeting line for outreach emails.
 * If no first name, use "Hi," only — never invent a name.
 */
export function buildGreeting(firstName, language = 'en') {
  const name = (firstName || '').trim();
  if (!name) {
    return language === 'fr' ? 'Bonjour,' :
      language === 'nl' ? 'Hallo,' :
      language === 'de' ? 'Hallo,' :
      language === 'it' ? 'Ciao,' :
      language === 'es' ? 'Hola,' :
      language === 'pt' ? 'Olá,' :
      'Hi,';
  }

  return language === 'fr' ? `Bonjour ${name},` :
    language === 'nl' ? `Hallo ${name},` :
    language === 'de' ? `Hallo ${name},` :
    language === 'it' ? `Ciao ${name},` :
    language === 'es' ? `Hola ${name},` :
    language === 'pt' ? `Olá ${name},` :
    `Hi ${name},`;
}
