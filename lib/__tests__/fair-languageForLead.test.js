/**
 * One language per lead. The lead's own setting wins, an old combined value
 * collapses to its first part, and the country decides only when nothing is set.
 */
import { languageForLead, isSupportedLanguage, SUPPORTED_LANGUAGE_CODES } from '@/lib/fair-assistant/languages';
import { CLOSINGS } from '@/lib/fair-assistant/signoff';
import { buildGreeting } from '@/lib/fair-assistant/greeting';

describe('languageForLead', () => {
  test('the lead\'s own language wins over the country', () => {
    expect(languageForLead({ country: 'Belgium', language: 'nl' })).toBe('nl');
    expect(languageForLead({ country: 'Germany', language: 'it' })).toBe('it');
  });

  test('an old combined value collapses to one language', () => {
    expect(languageForLead({ country: 'Belgium', language: 'fr+nl' })).toBe('fr');
    expect(languageForLead({ country: 'Switzerland', language: 'de+fr' })).toBe('de');
    expect(languageForLead({ country: 'Belgium', language: 'xx+nl' })).toBe('nl');
  });

  test('without a language the country decides, without a country English', () => {
    expect(languageForLead({ country: 'Belgium' })).toBe('fr');
    expect(languageForLead({ country: 'Deutschland' })).toBe('de');
    expect(languageForLead({ country: '', language: '' })).toBe('en');
    expect(languageForLead({})).toBe('en');
    expect(languageForLead({ language: 'klingon', country: 'Japan' })).toBe('ja');
  });

  test('every supported language has a greeting and a closing', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(isSupportedLanguage(code)).toBe(true);
      expect(CLOSINGS[code]).toBeTruthy();
      if (code !== 'en') expect(buildGreeting('Sam', code)).not.toBe('Hi Sam,');
    }
  });
});
