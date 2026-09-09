/**
 * The sign-off of a fair follow-up is fixed per language and never touched
 * by the model. Sam, 9 Sept 2026: a Dutch and a French email both ended in
 * "Herzliche Grüße".
 */
import { buildSignoff, CLOSINGS, closingLanguage, looksLikeClosing } from '@/lib/fair-assistant/signoff';
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/fair-assistant/languages';

const TEMPLATE = 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp';

describe('buildSignoff', () => {
  test('a Dutch email closes in Dutch, with the name and company verbatim', () => {
    expect(buildSignoff(TEMPLATE, 'nl')).toBe('Met vriendelijke groet,\nAlberto Saleh\nLoveLab Antwerp');
  });

  test('a French email closes in French', () => {
    expect(buildSignoff(TEMPLATE, 'fr')).toBe('Bien cordialement,\nAlberto Saleh\nLoveLab Antwerp');
  });

  test('never carries a German closing into another language', () => {
    for (const lang of SUPPORTED_LANGUAGE_CODES.filter((l) => l !== 'de')) {
      expect(buildSignoff(TEMPLATE, lang)).not.toMatch(/Grüße/);
    }
    expect(buildSignoff(TEMPLATE, 'de')).toBe('Mit freundlichen Grüßen,\nAlberto Saleh\nLoveLab Antwerp');
  });

  test('every supported language has its own closing, none falls back to English', () => {
    for (const lang of SUPPORTED_LANGUAGE_CODES) {
      expect(CLOSINGS[lang]).toBeTruthy();
      if (lang !== 'en') expect(buildSignoff(TEMPLATE, lang)).not.toMatch(/regards/i);
    }
  });

  test('English keeps the closing Alberto typed', () => {
    expect(buildSignoff(TEMPLATE, 'en')).toBe(TEMPLATE);
    expect(buildSignoff('Best regards,\nDionne Saleh\nLove Group BV', 'en')).toBe('Best regards,\nDionne Saleh\nLove Group BV');
  });

  test('a template with only a name gets a closing put in front', () => {
    expect(buildSignoff('Alberto Saleh\nLoveLab Antwerp', 'it')).toBe('Cordiali saluti,\nAlberto Saleh\nLoveLab Antwerp');
    expect(buildSignoff('Alberto Saleh\nLoveLab Antwerp', 'en')).toBe('Kind regards,\nAlberto Saleh\nLoveLab Antwerp');
  });

  test('a template already closed in another language is replaced, not stacked', () => {
    expect(buildSignoff('Herzliche Grüße,\nAlberto Saleh\nLoveLab Antwerp', 'nl')).toBe('Met vriendelijke groet,\nAlberto Saleh\nLoveLab Antwerp');
  });

  test('an unknown language falls back to English rather than inventing one', () => {
    expect(buildSignoff(TEMPLATE, 'xx')).toBe('Kind regards,\nAlberto Saleh\nLoveLab Antwerp');
  });

  test('blank lines and stray spaces in the template are ignored', () => {
    expect(buildSignoff('  Warm regards, \n\n Alberto Saleh \n LoveLab Antwerp \n', 'es')).toBe('Un cordial saludo,\nAlberto Saleh\nLoveLab Antwerp');
  });
});

describe('closing detection', () => {
  test('recognises closings and the language they belong to', () => {
    expect(closingLanguage('Herzliche Grüße,')).toBe('de');
    expect(closingLanguage('herzliche grüße')).toBe('de');
    expect(closingLanguage('Cordiali saluti,')).toBe('it');
    expect(closingLanguage('Alberto Saleh')).toBeNull();
  });

  test('a short comma-ended line counts as a closing, a name or company does not', () => {
    expect(looksLikeClosing('Hartelijke groet,')).toBe(true);
    expect(looksLikeClosing('Alberto Saleh')).toBe(false);
    expect(looksLikeClosing('LoveLab Antwerp')).toBe(false);
  });
});
